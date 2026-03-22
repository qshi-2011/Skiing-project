import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Job, JobStatus } from '@/lib/types'
import { scoreLabel } from '@/lib/analysis-summary'

export const dynamic = 'force-dynamic'

const STATUS_DOT: Record<JobStatus, string> = {
  created: 'var(--ink-muted)',
  uploaded: 'var(--accent)',
  queued: 'var(--gold)',
  running: 'var(--accent)',
  done: 'var(--success)',
  error: 'var(--danger)',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  created: 'Created',
  uploaded: 'Uploaded',
  queued: 'Queued',
  running: 'Analysing',
  done: 'Done',
  error: 'Error',
}

export default async function ProfilePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const runs = (jobs ?? []) as Job[]
  const completedRuns = runs.filter((j) => j.status === 'done')
  const scoredRuns = completedRuns.filter((j) => j.score != null) as (Job & { score: number })[]
  const avgScore = scoredRuns.length
    ? Math.round(scoredRuns.reduce((s, j) => s + j.score, 0) / scoredRuns.length)
    : null
  const bestScore = scoredRuns.length ? Math.max(...scoredRuns.map((j) => j.score)) : null

  const displayName = user.email?.split('@')[0] ?? 'Athlete'
  const initials = displayName.slice(0, 2).toUpperCase()
  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <div className="route-bg route-bg--dashboard" />
      <div className="space-y-6">

        {/* ── Profile header ───────────────────────────── */}
        <section className="surface-card p-8 lg:p-10">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: '5rem',
                height: '5rem',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: '1.6rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              {initials}
            </div>
            <div>
              <h1 style={{ fontSize: 'clamp(1.4rem, 2vw, 2rem)', fontWeight: 800, color: 'var(--ink-strong)', letterSpacing: '-0.03em' }}>
                {displayName}
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                {user.email}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                Member since {memberSince}
              </p>
            </div>
          </div>
        </section>

        {/* ── Stats row ────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="metric-tile">
            <p className="metric-value">{runs.length}</p>
            <p className="metric-label">Total runs</p>
          </div>
          <div className="metric-tile">
            <p className="metric-value">{completedRuns.length}</p>
            <p className="metric-label">Completed</p>
          </div>
          <div className="metric-tile">
            <p className="metric-value">{avgScore ?? '—'}</p>
            <p className="metric-label">Average score</p>
          </div>
          <div className="metric-tile metric-tile--high">
            <div className="metric-tile-dot" style={{ background: 'var(--accent)' }} />
            <p className="metric-value" style={{ color: 'var(--accent)' }}>{bestScore ?? '—'}</p>
            <p className="metric-label">Best score</p>
          </div>
        </div>

        {/* ── Run history ──────────────────────────────── */}
        <section className="surface-card p-6 lg:p-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="section-label">Run History</p>
              <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                All your analysis runs
              </h2>
            </div>
            <Link href="/upload" className="cta-primary" style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
              Upload New Run
            </Link>
          </div>

          {!runs.length ? (
            <div className="mt-5 surface-card-muted p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                No runs yet. Upload your first ski video to get started.
              </p>
              <Link href="/upload" className="cta-primary mt-4 inline-flex" style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}>
                Upload Your First Run
              </Link>
            </div>
          ) : (
            <ul className="mt-5 space-y-2">
              {runs.map((job: Job) => {
                const filename =
                  String(job.config?.original_filename ?? '') ||
                  job.video_object_path?.split('/').pop() ||
                  job.id.slice(0, 8)
                const date = new Date(job.created_at)
                return (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="surface-card-muted flex items-center gap-3 px-4 py-3 group transition-transform hover:-translate-y-0.5"
                      style={{ display: 'flex' }}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: STATUS_DOT[job.status as JobStatus] }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink-strong)' }}>
                          {filename}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                          {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {job.score != null && (
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                            {job.score}
                          </span>
                          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                            {scoreLabel(job.score)}
                          </p>
                        </div>
                      )}
                      <span className="text-xs shrink-0 px-2 py-0.5 rounded-full" style={{
                        color: STATUS_DOT[job.status as JobStatus],
                        background: 'rgba(0,0,0,0.04)',
                      }}>
                        {STATUS_LABEL[job.status as JobStatus]}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
