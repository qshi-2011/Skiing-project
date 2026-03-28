import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Job } from '@/lib/types'
import { groupBySeason } from '@/lib/seasons'
import { backfillMissingScores, loadPreviewUrlsForJobIds, resolveJobPresentation } from '@/lib/server-job-data'
import { getJobDisplayName, getJobUserNote, getJobOriginalFilename, getJobSearchText } from '@/lib/job-ui'
import { RunMetadataEditor } from '@/components/run-metadata-editor'
import { ArchiveRunsClient, type ArchiveRunItem } from '@/components/archive-runs-client'

export const dynamic = 'force-dynamic'

function sessionTypeLabel(value: unknown) {
  if (typeof value !== 'string' || !value) return null

  const labels: Record<string, string> = {
    free_skiing: 'Free skiing',
    slalom: 'Slalom',
    giant_slalom: 'Giant slalom',
    super_g: 'Super-G',
    training_drill: 'Training drill',
    other: 'Other',
  }

  return labels[value] ?? value.replace(/_/g, ' ')
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams?: { edit?: string | string[] }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const runs = (jobs ?? []) as Job[]
  const completedRuns = runs.filter((job) => job.status === 'done')
  await backfillMissingScores(service, completedRuns)

  const seasonGroups = groupBySeason(runs)
  const scoredRuns = completedRuns.filter((job): job is Job & { score: number } => job.score != null)
  const avgScore = scoredRuns.length
    ? Math.round(scoredRuns.reduce((sum, job) => sum + job.score, 0) / scoredRuns.length)
    : null
  const previewUrlByJob = await loadPreviewUrlsForJobIds(service, runs.map((run) => run.id))
  const initialEditJobId =
    typeof searchParams?.edit === 'string'
      ? searchParams.edit
      : Array.isArray(searchParams?.edit)
        ? searchParams.edit[0] ?? null
        : null
  const selectedRun = initialEditJobId
    ? runs.find((run) => run.id === initialEditJobId) ?? runs[0] ?? null
    : runs[0] ?? null

  const archiveRuns: ArchiveRunItem[] = runs.map((job) => {
    const date = new Date(job.created_at)
    const sessionType = sessionTypeLabel(job.config?.session_type)
    const displayName = getJobDisplayName(job)
    const presentation = resolveJobPresentation(job)

    return {
      id: job.id,
      created_at: job.created_at,
      status: job.status,
      statusLabel: presentation.label,
      statusHelper: presentation.helper,
      statusTone: presentation.tone,
      statusDot: presentation.dot,
      statusPill: presentation.pill,
      canRetry: presentation.retryable,
      actionLabel: presentation.actionLabel,
      displayName,
      originalFilename: getJobOriginalFilename(job),
      userNote: getJobUserNote(job),
      subtitle: `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${sessionType ? ` · ${sessionType}` : ''}`,
      score: job.score,
      previewUrl: previewUrlByJob.get(job.id) ?? null,
      sessionType,
      searchText: getJobSearchText(job),
    }
  })

  return (
    <div className="space-y-6">
        <section className="surface-card p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="eyebrow">Run archive</span>
              <h1 className="section-title mt-6">Every session, captured and ready to revisit.</h1>
              <p className="section-copy mt-4 max-w-xl">
                Your full history of uploaded runs, grouped by ski season. Search, filter, and compare recaps without guessing which repeated filename is which.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/upload" className="cta-primary">
                  Analyze a new run
                </Link>
                <Link href="/" className="cta-secondary">
                  Back to coaching hub
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="metric-tile">
                  <p className="metric-value">{runs.length}</p>
                  <p className="metric-label">Total runs in archive</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{completedRuns.length}</p>
                  <p className="metric-label">Completed recaps</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{avgScore ?? '—'}</p>
                  <p className="metric-label">Average score</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{seasonGroups.length}</p>
                  <p className="metric-label">{seasonGroups.length === 1 ? 'Season' : 'Seasons'} tracked</p>
                </div>
              </div>

              {selectedRun && (
                <div className="surface-card-muted p-5">
                  <p className="section-label">Edit run details</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--ink-strong)' }}>
                    {getJobDisplayName(selectedRun)}
                  </p>
                  {getJobUserNote(selectedRun) && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {getJobUserNote(selectedRun)}
                    </p>
                  )}
                  <div className="mt-4">
                    <RunMetadataEditor
                      jobId={selectedRun.id}
                      initialDisplayName={getJobDisplayName(selectedRun)}
                      initialUserNote={getJobUserNote(selectedRun)}
                      defaultEditing={Boolean(initialEditJobId)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {!runs.length ? (
          <section className="surface-card p-6">
            <div className="surface-card-muted p-10 text-center">
              <div
                className="w-16 h-16 rounded-[var(--radius-lg)] flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
              </div>
              <p className="text-base font-bold" style={{ color: 'var(--ink-strong)' }}>No analyses yet</p>
              <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
                Upload a ski video to create your first recap card.
              </p>
            </div>
          </section>
        ) : (
          <ArchiveRunsClient runs={archiveRuns} initialEditJobId={initialEditJobId} />
        )}
    </div>
  )
}
