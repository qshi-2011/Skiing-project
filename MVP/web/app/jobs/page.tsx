import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Job, JobStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; pill: string }> = {
  created:  { label: 'Created',   dot: 'var(--ink-muted)',  pill: 'rgba(255,255,255,0.04)' },
  uploaded: { label: 'Uploaded',  dot: 'var(--accent)',     pill: 'var(--accent-dim)' },
  queued:   { label: 'Queued',    dot: 'var(--gold)',       pill: 'var(--gold-dim)' },
  running:  { label: 'Analysing', dot: 'var(--accent)',     pill: 'var(--accent-dim)' },
  done:     { label: 'Done',      dot: 'var(--success)',    pill: 'var(--success-dim)' },
  error:    { label: 'Error',     dot: 'var(--danger)',     pill: 'var(--danger-dim)' },
}

export default async function ArchivePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const runs = jobs ?? []
  const completedRuns = runs.filter((job) => job.status === 'done')
  const activeRuns = runs.filter((job) => job.status === 'queued' || job.status === 'running' || job.status === 'uploaded')

  return (
    <div className="space-y-6">
      <section className="surface-card p-8 lg:p-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="eyebrow">Run archive</span>
            <h1 className="section-title mt-6">Every session, captured and ready to revisit.</h1>
            <p className="section-copy mt-4 max-w-xl">
              Your full history of uploaded runs. Tap into any recap to review technique scores, key moments, and coaching feedback.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/upload" className="cta-primary">
                Analyse a new run
              </Link>
              <Link href="/" className="cta-secondary">
                Back to coaching hub
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="metric-tile">
              <p className="metric-value">{runs.length}</p>
              <p className="metric-label">Total runs in archive.</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value">{completedRuns.length}</p>
              <p className="metric-label">Completed recaps ready to review.</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value">{activeRuns.length}</p>
              <p className="metric-label">Currently processing.</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value">{runs.filter((j) => j.status === 'error').length}</p>
              <p className="metric-label">Runs needing retry.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>All runs</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-strong)' }}>
              Archive
            </h2>
          </div>
          <Link href="/upload" className="cta-secondary">
            New upload
          </Link>
        </div>

        {!runs.length ? (
          <div className="surface-card-muted p-10 text-center mt-5">
            <div
              className="w-16 h-16 rounded-[1.4rem] flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line-soft)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <p className="text-base font-semibold" style={{ color: 'var(--ink-strong)' }}>No analyses yet</p>
            <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
              Upload a ski video to create your first recap card.
            </p>
          </div>
        ) : (
          <ul className="space-y-3 mt-5">
            {runs.map((job: Job) => {
              const cfg = STATUS_CONFIG[job.status as JobStatus]
              const filename =
                String(job.config?.original_filename ?? '') ||
                job.video_object_path?.split('/').pop() ||
                job.id.slice(0, 8)
              const isRunning = job.status === 'running' || job.status === 'queued'

              return (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="surface-card-muted flex items-center gap-4 px-5 py-4 group transition-transform hover:-translate-y-0.5"
                    style={{ display: 'flex' }}
                  >
                    <div
                      className="w-11 h-11 rounded-[1rem] shrink-0 flex items-center justify-center"
                      style={{ background: cfg.pill }}
                    >
                      {isRunning ? (
                        <div
                          className="w-2.5 h-2.5 rounded-full animate-pulse"
                          style={{ background: cfg.dot }}
                        />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.dot }} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink-strong)' }}>{filename}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>

                    {job.score != null && (
                      <span className="text-sm font-bold shrink-0" style={{ color: 'var(--accent)' }}>
                        {job.score}
                      </span>
                    )}

                    <span
                      className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: cfg.pill, color: cfg.dot }}
                    >
                      {cfg.label}
                    </span>

                    <svg
                      width="14" height="14"
                      viewBox="0 0 24 24" fill="none"
                      stroke="var(--ink-muted)"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="shrink-0 transition-all group-hover:translate-x-0.5"
                      style={{ transition: 'transform 150ms, stroke 150ms' }}
                    >
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
