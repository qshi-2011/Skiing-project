import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Job, JobStatus } from '@/lib/types'
import { buildTechniqueDashboard, scoreLabel, type TechniqueRunSummary, type CoachingTip } from '@/lib/analysis-summary'
import { buildNextSessionCard } from '@/lib/practice-guidance'

export const dynamic = 'force-dynamic'

/* ── Status display helpers ───────────────────────────── */
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

const CATEGORY_BADGE: Record<string, string> = {
  balance: 'category-badge-balance',
  edging: 'category-badge-edging',
  rhythm: 'category-badge-rhythm',
  movement: 'category-badge-movement',
  general: 'category-badge-general',
}

const CATEGORY_ICON: Record<string, string> = {
  balance: 'Balance',
  edging: 'Edging',
  rhythm: 'Rhythm',
  movement: 'Movement',
  general: 'General',
}

function levelBadgeClass(label: string) {
  switch (label) {
    case 'Focus': return 'level-badge level-badge--focus'
    case 'Building': return 'level-badge level-badge--building'
    case 'Good': return 'level-badge level-badge--good'
    case 'Dialed': return 'level-badge level-badge--dialed'
    default: return 'level-badge level-badge--building'
  }
}

/* ── Data fetching ────────────────────────────────────── */
async function fetchSummary(
  service: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>,
  job: Job,
): Promise<TechniqueRunSummary | null> {
  const { data: artifacts } = await service
    .from('artifacts')
    .select('*')
    .eq('job_id', job.id)
    .eq('kind', 'summary_json')
    .limit(1)

  const summaryArtifact = artifacts?.[0]
  if (!summaryArtifact) return null

  const { data: file } = await service.storage
    .from('artifacts')
    .download(summaryArtifact.object_path)

  if (!file) return null

  try {
    return JSON.parse(await file.text()) as TechniqueRunSummary
  } catch {
    return null
  }
}

/* ── Public Landing Page ──────────────────────────────── */
function LandingPage() {
  return (
    <>
      <div className="route-bg route-bg--landing" />
      <div className="space-y-8">

        {/* ── Hero: headline left + analysis preview right ── */}
        <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr] items-center">
          {/* Left: headline + CTAs */}
          <div>
            <h1 className="landing-hero-title--white">
              Elite analysis<br />for every run.
            </h1>
            <p className="mt-4" style={{ fontSize: '1rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.6)', maxWidth: '28rem' }}>
              Stop guessing your progress. See exactly what to fix with AI-powered technique analysis used by national teams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sample-analysis" className="cta-primary">
                See Full Analysis
              </Link>
              <Link
                href="/login"
                className="cta-secondary"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Right: sample analysis preview card */}
          <div className="surface-card-strong p-5 lg:p-6">
            <p className="section-label">Sample Analysis Preview</p>

            {/* Autoplay overlay video */}
            <div
              className="mt-3 overflow-hidden"
              style={{ borderRadius: 'var(--radius-xl)', background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src="/sample/overlay.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full aspect-video bg-black"
              />
            </div>

            {/* Score + turns row */}
            <div className="mt-3 grid gap-3 grid-cols-3">
              <div className="metric-tile metric-tile--high">
                <div className="metric-tile-dot" style={{ background: 'var(--accent)' }} />
                <p className="metric-value" style={{ color: 'var(--accent)', fontSize: '1.6rem' }}>73</p>
                <p className="metric-label">Technique score</p>
              </div>
              <div className="metric-tile">
                <p className="metric-value" style={{ fontSize: '1.6rem' }}>4</p>
                <p className="metric-label">Turns detected</p>
              </div>
              <div className="metric-tile metric-tile--high">
                <div className="metric-tile-dot" style={{ background: 'var(--accent)' }} />
                <p className="metric-value" style={{ color: 'var(--accent)', fontSize: '1.6rem' }}>94%</p>
                <p className="metric-label">Pose confidence</p>
              </div>
            </div>

            {/* Top coaching insight */}
            <div className="mt-3 surface-card-muted p-4">
              <p className="section-label" style={{ color: 'var(--amber)' }}>Top Insight</p>
              <p className="mt-2 text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>Work on symmetric knee flexion</p>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ink-soft)' }}>
                Average left-right knee flexion asymmetry is 20.8&deg;. Aim for &lt;10&deg; to distribute load evenly.
              </p>
            </div>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────── */}
        <section className="surface-card p-8 lg:p-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="how-step">
              <span className="how-step-number">01</span>
              <h3>Record your run.</h3>
              <p>Use any smartphone to capture your technique from the side or behind. No specialized hardware required.</p>
            </div>
            <div className="how-step">
              <span className="how-step-number">02</span>
              <h3>Get instant feedback.</h3>
              <p>Our computer vision engine analyzes 34 biometric markers to identify inefficiencies automatically.</p>
            </div>
            <div className="how-step">
              <span className="how-step-number">03</span>
              <h3>Track your progress.</h3>
              <p>Compare runs over time with our performance dashboard and watch your technique score climb.</p>
            </div>
          </div>
        </section>

        {/* ── CTA block ──────────────────────────────────── */}
        <section className="surface-card p-8 lg:p-10 text-center">
          <h2 className="section-title">Ready to transform your skiing?</h2>
          <p className="section-copy mt-3 mx-auto max-w-lg">
            Join athletes who use SkiCoach AI to shave seconds off their times and perfect their form.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <Link href="/login" className="cta-primary">
              Get Started Free
            </Link>
            <Link href="/sample-analysis" className="cta-secondary">
              View Sample Analysis
            </Link>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="site-footer">
          <div className="site-footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Technical Docs</a>
          </div>
          <p className="site-footer-copy">&copy; 2024 SkiCoach AI. All rights reserved.</p>
        </footer>
      </div>
    </>
  )
}

/* ── Authenticated Dashboard ──────────────────────────── */
async function Dashboard() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { createServiceClient } = await import('@/lib/supabase/server')
  const service = createServiceClient()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const runs = (jobs ?? []) as Job[]
  const completedRuns = runs.filter((j) => j.status === 'done')
  const latestCompleted = completedRuns[0] ?? null

  const scoredRuns = completedRuns.filter((j) => j.score != null) as (Job & { score: number })[]
  const latestScore = scoredRuns[0]?.score ?? null
  const previousScore = scoredRuns[1]?.score ?? null
  const scoreDelta = latestScore != null && previousScore != null ? latestScore - previousScore : null
  const bestRecentScore = scoredRuns.length ? Math.max(...scoredRuns.slice(0, 10).map((j) => j.score)) : null

  let score = latestScore
  let level: string | null = latestScore != null ? scoreLabel(latestScore) : null
  let primaryTip: CoachingTip | null = null

  const recentCompleted = completedRuns.slice(0, 3)
  const recentTipSets: CoachingTip[][] = []

  const summaries = await Promise.all(
    recentCompleted.map((run) => fetchSummary(service, run))
  )

  for (let i = 0; i < recentCompleted.length; i++) {
    const run = recentCompleted[i]
    const summary = summaries[i]
    if (!summary) continue

    const tips = summary.coaching_tips ?? []
    if (tips.length) recentTipSets.push(tips)

    if (run.id === latestCompleted?.id) {
      if (score == null) {
        const dashboard = buildTechniqueDashboard(summary)
        score = dashboard.overview.overallScore
        level = scoreLabel(score)
        if (dashboard.focusCards.length) {
          primaryTip = dashboard.focusCards[0]
        } else if (tips.length) {
          primaryTip = tips[0]
        }
        if (Number.isFinite(score)) {
          await service.from('jobs').update({ score }).eq('id', run.id)
        }
      } else {
        const dashboard = buildTechniqueDashboard(summary)
        if (dashboard.focusCards.length) {
          primaryTip = dashboard.focusCards[0]
        } else if (tips.length) {
          primaryTip = tips[0]
        }
      }
    }
  }

  const nextSession = buildNextSessionCard(recentTipSets)
  const recentRuns = runs.slice(0, 5)
  const displayName = user?.email?.split('@')[0] ?? 'there'

  return (
    <>
      <div className="route-bg route-bg--dashboard" />
      <div className="space-y-6">

        {/* ══ ROW 1: Welcome | Upload | Preflight ══════════ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Welcome */}
          <section className="surface-card p-8">
            <h1 style={{ fontSize: 'clamp(1.5rem, 2.4vw, 2.2rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', color: 'var(--ink-strong)' }}>
              Welcome back, <span style={{ color: 'var(--accent)' }}>{displayName}</span>.
            </h1>
            <p className="section-copy mt-2">
              {completedRuns.length > 0
                ? 'Your coaching hub is ready. Review your latest recap or upload a new run.'
                : 'Ready for your first session?'}
            </p>
          </section>

          {/* Upload */}
          <Link href="/upload" className="upload-card">
            <div className="upload-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            <h3>Upload Your {completedRuns.length > 0 ? 'Next' : 'First'} Run</h3>
            <p>Supported formats: MP4, MOV (Up to 4K)</p>
          </Link>

          {/* Preflight checklist */}
          <section className="surface-card-strong p-6">
            <p className="section-label">Preflight Checklist</p>
            <div className="mt-4 space-y-3">
              <div className="preflight-item">
                <span className="preflight-number">01</span>
                <div>
                  <h4>One skier in frame</h4>
                  <p>AI tracking requires a clear focus on a single subject.</p>
                </div>
              </div>
              <div className="preflight-item">
                <span className="preflight-number">02</span>
                <div>
                  <h4>One continuous run</h4>
                  <p>Avoid cuts or montage editing for accurate telemetry.</p>
                </div>
              </div>
              <div className="preflight-item">
                <span className="preflight-number">03</span>
                <div>
                  <h4>Side or behind angle</h4>
                  <p>Optimal for detecting hip placement and edge angles.</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ══ ROW 2: Metrics+Runs | Coaching Insight | Practice ══ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Metric tiles + Recent runs */}
          <div className="space-y-6">
            {/* Metric tiles */}
            <div className="grid gap-3 grid-cols-3">
              <div className="metric-tile">
                <p className="metric-value">{score ?? '—'}</p>
                <p className="metric-label">Technique score</p>
              </div>
              <div className="metric-tile">
                <p className="metric-value">{scoredRuns.length > 0 ? scoredRuns.length : '—'}</p>
                <p className="metric-label">Scored runs</p>
              </div>
              <div className="metric-tile">
                <p className="metric-value">{bestRecentScore ?? '—'}</p>
                <p className="metric-label">Best recent</p>
              </div>
            </div>

            {/* Recent runs */}
            <section className="surface-card p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="section-label">Recent Runs</p>
                <Link href="/jobs" className="cta-secondary text-sm" style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}>
                  View all
                </Link>
              </div>

              {!recentRuns.length ? (
                <div className="surface-card-muted p-6 text-center mt-4">
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                    Your runs will appear here after your first upload.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2 mt-4">
                  {recentRuns.map((job: Job) => {
                    const filename =
                      String(job.config?.original_filename ?? '') ||
                      job.video_object_path?.split('/').pop() ||
                      job.id.slice(0, 8)
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
                          </div>
                          {job.score != null && (
                            <span className="text-xs font-bold shrink-0" style={{ color: 'var(--accent)' }}>
                              {job.score}
                            </span>
                          )}
                          <span className="text-xs shrink-0" style={{ color: 'var(--ink-muted)' }}>
                            {STATUS_LABEL[job.status as JobStatus]}
                          </span>
                          <span className="text-xs shrink-0" style={{ color: 'var(--ink-muted)' }}>
                            {new Date(job.created_at).toLocaleDateString()}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Middle: Latest coaching insight */}
          <section className="surface-card p-6">
            <p className="section-label">Latest Coaching Insight</p>
            <h2 className="mt-3" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
              {primaryTip
                ? primaryTip.title
                : completedRuns.length > 0
                  ? 'Your latest analysis is ready.'
                  : 'Upload a run to get started.'}
            </h2>
            {primaryTip && (
              <p className="mt-3 text-sm leading-6" style={{ color: 'var(--ink-soft)' }}>
                {primaryTip.explanation}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/upload" className="cta-primary" style={{ padding: '0.75rem 1.2rem', fontSize: '0.88rem' }}>
                Analyse a new run
              </Link>
              {latestCompleted && (
                <Link href={`/jobs/${latestCompleted.id}`} className="cta-secondary" style={{ padding: '0.75rem 1.2rem', fontSize: '0.88rem' }}>
                  Open full run recap
                </Link>
              )}
            </div>
          </section>

          {/* Right: Practice focus */}
          <div className="space-y-6">
            {(nextSession.drills.length > 0 || primaryTip) && (
              <section className="surface-card p-6">
                <p className="section-label">Practice Focus</p>
                <div className="mt-4 space-y-3">
                  {nextSession.drills.slice(0, 3).map((drill) => (
                    <div key={drill.id} className={`coaching-card coaching-accent-${drill.category}`}>
                      <p className="text-sm font-bold pl-3" style={{ color: 'var(--ink-strong)' }}>
                        {drill.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 pl-3" style={{ color: 'var(--ink-soft)' }}>
                        {drill.description}
                      </p>
                      <div className="mt-3 pl-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[drill.category] ?? 'category-badge-general'}`}
                        >
                          {CATEGORY_ICON[drill.category] ?? drill.category}
                        </span>
                      </div>
                    </div>
                  ))}
                  {primaryTip && nextSession.drills.length === 0 && (
                    <div className="coaching-card">
                      <p className="text-sm font-bold pl-3" style={{ color: 'var(--ink-strong)' }}>
                        {primaryTip.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 pl-3" style={{ color: 'var(--ink-soft)' }}>
                        {primaryTip.explanation}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Main page component ──────────────────────────────── */
export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <LandingPage />
  }

  return <Dashboard />
}
