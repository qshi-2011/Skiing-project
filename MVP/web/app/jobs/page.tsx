import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createArtifactDownloadUrl, getDefaultR2ArtifactsBucket } from '@/lib/r2'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Job, JobStatus } from '@/lib/types'
import { groupBySeason } from '@/lib/seasons'
import { backfillMissingScores } from '@/lib/server-job-data'
import { ArchiveRunsClient, type ArchiveRunItem } from '@/components/archive-runs-client'

export const dynamic = 'force-dynamic'

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; pill: string }> = {
  created:  { label: 'Created',   dot: 'var(--ink-muted)',  pill: 'rgba(0,0,0,0.04)' },
  uploaded: { label: 'Uploaded',  dot: 'var(--accent)',     pill: 'var(--accent-dim)' },
  queued:   { label: 'Queued',    dot: 'var(--gold)',       pill: 'var(--gold-dim)' },
  running:  { label: 'Analyzing', dot: 'var(--accent)',     pill: 'var(--accent-dim)' },
  done:     { label: 'Done',      dot: 'var(--success)',    pill: 'var(--success-dim)' },
  error:    { label: 'Error',     dot: 'var(--danger)',     pill: 'var(--danger-dim)' },
}

interface PreviewArtifact {
  job_id: string
  kind: string
  object_path: string
  meta?: Record<string, unknown>
}

function artifactStorageProvider(artifact: { meta?: Record<string, unknown> }) {
  return artifact.meta?.storage_provider === 'r2' ? 'r2' : 'supabase'
}

function artifactStorageBucket(artifact: { meta?: Record<string, unknown> }) {
  const metaBucket = artifact.meta?.storage_bucket
  return typeof metaBucket === 'string' && metaBucket ? metaBucket : getDefaultR2ArtifactsBucket()
}

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

function runTitle(job: Job) {
  return (
    String(job.config?.original_filename ?? '') ||
    job.video_object_path?.split('/').pop() ||
    job.id.slice(0, 8)
  )
}

export default async function ArchivePage() {
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

  const previewByJob = new Map<string, PreviewArtifact>()
  if (runs.length) {
    const { data: artifacts } = await service
      .from('artifacts')
      .select('job_id, kind, object_path, meta')
      .in('job_id', runs.map((run) => run.id))
      .in('kind', ['cool_moment_photo', 'peak_pressure_frame', 'peak_pressure_frame_enhanced'])
      .order('created_at')

    for (const artifact of (artifacts ?? []) as PreviewArtifact[]) {
      const current = previewByJob.get(artifact.job_id)
      if (!current) {
        previewByJob.set(artifact.job_id, artifact)
        continue
      }
      if (current.kind !== 'cool_moment_photo' && artifact.kind === 'cool_moment_photo') {
        previewByJob.set(artifact.job_id, artifact)
      }
    }
  }

  const previewUrlByJob = new Map<string, string>()
  await Promise.all(Array.from(previewByJob.values()).map(async (artifact) => {
    if (artifactStorageProvider(artifact) === 'r2') {
      previewUrlByJob.set(
        artifact.job_id,
        await createArtifactDownloadUrl(artifact.object_path, artifactStorageBucket(artifact)),
      )
      return
    }

    const { data } = await service.storage
      .from('artifacts')
      .createSignedUrl(artifact.object_path, 3600)

    if (data?.signedUrl) {
      previewUrlByJob.set(artifact.job_id, data.signedUrl)
    }
  }))

  const archiveRuns: ArchiveRunItem[] = runs.map((job) => {
    const date = new Date(job.created_at)
    const sessionType = sessionTypeLabel(job.config?.session_type)

    return {
      id: job.id,
      created_at: job.created_at,
      status: job.status,
      statusLabel: STATUS_CONFIG[job.status].label,
      statusDot: STATUS_CONFIG[job.status].dot,
      statusPill: STATUS_CONFIG[job.status].pill,
      title: runTitle(job),
      subtitle: `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${sessionType ? ` · ${sessionType}` : ''}`,
      score: job.score,
      previewUrl: previewUrlByJob.get(job.id) ?? null,
      sessionType,
    }
  })

  return (
    <>
      <div className="route-bg route-bg--archive" />
      <div className="space-y-6">
        <section className="surface-card p-8 lg:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/alpine/hero-corduroy.jpg"
            alt="Freshly groomed corduroy slope"
            className="hero-photo mb-6"
            style={{ height: '160px' }}
          />
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
          <ArchiveRunsClient runs={archiveRuns} />
        )}
      </div>
    </>
  )
}
