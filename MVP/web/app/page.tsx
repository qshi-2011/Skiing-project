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
      <div className="space-y-12">
        {/* Hero section */}
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
          {/* Left: headline + CTAs */}
          <div className="surface-card p-8 lg:p-10">
            <span className="eyebrow">V2.0 Core Engine Live</span>
            <h1 className="landing-hero-title mt-6">
              Elite analysis<br />for every run.
            </h1>
            <p className="section-copy mt-4 max-w-lg">
              Stop guessing your progress. See exactly what to fix with AI-powered technique analysis used by national teams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sample-analysis" className="cta-primary">
                See Sample Analysis
              </Link>
              <Link href="/login" className="cta-secondary">
                Get Started
              </Link>
            </div>
          </div>

          {/* Right: sample analysis preview card (placeholder) */}
          <div className="surface-card-strong p-6 lg:p-8">
            <p className="section-label">Sample Analysis Preview</p>

            {/* Video / overlay placeholder */}
            <div className="sample-placeholder mt-4" style={{ aspectRatio: '16 / 10' }}>
              <div className="sample-placeholder-label">
                <p>Sample overlay video</p>
                <p>Real analysis output will appear here</p>
              </div>
            </div>

            {/* Score + insight placeholder row */}
            <div className="mt-4 grid gap-3 grid-cols-2">
              <div className="metric-tile">
                <div className="sample-placeholder" style={{ width: '3rem', height: '2.5rem', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--ink-muted)' }}>Score</span>
                </div>
                <p className="metric-label">Performance score</p>
              </div>
              <div className="metric-tile">
                <div className="sample-placeholder" style={{ width: '3rem', height: '2.5rem', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--ink-muted)' }}>Tip</span>
                </div>
                <p className="metric-label">Coaching insight</p>
              </div>
            </div>

            {/* Technique marker placeholder */}
            <div className="mt-4 surface-card-muted p-4">
              <p className="section-label">Technique Markers</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--ink-soft)' }}>Edge Angle</span>
                  <span className="sample-placeholder" style={{ width: '3.5rem', height: '1rem', borderRadius: '0.25rem', border: '1px dashed rgba(0,0,0,0.08)' }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--ink-soft)' }}>Turn Rhythm</span>
                  <span className="sample-placeholder" style={{ width: '3.5rem', height: '1rem', borderRadius: '0.25rem', border: '1px dashed rgba(0,0,0,0.08)' }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--ink-soft)' }}>Balance</span>
                  <span className="sample-placeholder" style={{ width: '3.5rem', height: '1rem', borderRadius: '0.25rem', border: '1px dashed rgba(0,0,0,0.08)' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — 3-step strip */}
        <section className="surface-card p-8 lg:p-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="how-step">
              <span className="how-step-number">01</span>
              <h3>Record your run.</h3>
              <p>
                Use any smartphone to capture your technique from the side or behind. No specialized hardware required.
              </p>
            </div>
            <div className="how-step">
              <span className="how-step-number">02</span>
              <h3>Get instant feedback.</h3>
              <p>
                Our computer vision engine analyzes 34 biometric markers to identify inefficiencies in real-time.
              </p>
            </div>
            <div className="how-step">
              <span className="how-step-number">03</span>
              <h3>Track your progress.</h3>
              <p>
                Compare runs over time with our performance dashboard and watch your technique score climb.
              </p>
            </div>
          </div>
        </section>

        {/* CTA block */}
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

        {/* Footer */}
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
        {/* ── Welcome + Sample preview / Upload card ──── */}
        <section className="surface-card p-8 lg:p-10">
          <h1 style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', color: 'var(--ink-strong)' }}>
            Welcome back, <span style={{ color: 'var(--accent)' }}>{displayName}</span>.
          </h1>
          <p className="section-copy mt-2">
            {completedRuns.length > 0
              ? 'Your coaching hub is ready. Review your latest recap or upload a new run.'
              : 'Ready for your first session?'}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Left: main content area */}
          <div className="space-y-6">
            {/* Sample preview or latest insight */}
            <section className="surface-card p-6 lg:p-8">
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="section-label">
                  {completedRuns.length > 0 ? 'Latest Coaching Insight' : 'Preview: Initial Calibration'}
                </p>
                {completedRuns.length === 0 && (
                  <span className="eyebrow" style={{ fontSize: '0.62rem', padding: '0.3rem 0.6rem' }}>Sample Data</span>
                )}
              </div>

              {completedRuns.length > 0 ? (
                <>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                    {primaryTip
                      ? primaryTip.title
                      : 'Your latest analysis is ready.'}
                  </h2>
                  {primaryTip && (
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-soft)' }}>
                      {primaryTip.explanation}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* Placeholder for sample video/image */}
                  <div className="sample-placeholder" style={{ aspectRatio: '16 / 9' }}>
                    <div className="sample-placeholder-label">
                      <p>Sample analysis preview</p>
                      <p>This is what your analysis will look like. Upload a run to see real results.</p>
                    </div>
                  </div>
                </>
              )}

              {/* Metric tiles */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
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

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/upload" className="cta-primary">
                  Analyse a new run
                </Link>
                {latestCompleted && (
                  <Link href={`/jobs/${latestCompleted.id}`} className="cta-secondary">
                    Open full run recap
                  </Link>
                )}
              </div>
            </section>

            {/* Progression section */}
            {scoredRuns.length > 0 && (
              <section className="surface-card p-6">
                <div className="flex items-center gap-6">
                  <div className="score-ring" style={{ width: '7.5rem', height: '7.5rem', flexShrink: 0 }}>
                    <div className="score-ring-glow" />
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                      <circle
                        cx="60" cy="60" r="50"
                        fill="none"
                        stroke="url(#scoreGradHome)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="314.16"
                        strokeDashoffset={314.16 - ((score ?? 0) / 100) * 314.16}
                      />
                      <defs>
                        <linearGradient id="scoreGradHome" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#0084d4" />
                          <stop offset="100%" stopColor="#c79a44" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="score-ring-label">
                      <span className="font-extrabold tracking-tight" style={{ fontSize: '1.8rem', color: 'var(--ink-strong)' }}>
                        {score}
                      </span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--ink-soft)' }}>technique</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="section-label">Progression</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="metric-tile">
                        <p className="metric-value" style={{ fontSize: '1.5rem' }}>{latestScore}</p>
                        <p className="metric-label">Latest</p>
                      </div>
                      <div className="metric-tile">
                        <p className="metric-value" style={{ fontSize: '1.5rem', color: scoreDelta != null && scoreDelta >= 0 ? 'var(--success)' : scoreDelta != null ? 'var(--danger)' : 'var(--ink-strong)' }}>
                          {scoreDelta != null ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}` : '—'}
                        </p>
                        <p className="metric-label">Delta</p>
                      </div>
                      <div className="metric-tile">
                        <p className="metric-value" style={{ fontSize: '1.5rem' }}>{completedRuns.length}</p>
                        <p className="metric-label">Recaps</p>
                      </div>
                    </div>
                    {level && (
                      <div className="mt-3">
                        <span className={levelBadgeClass(level)}>{level}</span>
                        {scoreDelta != null && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full ml-2"
                            style={{
                              color: scoreDelta >= 0 ? 'var(--success)' : 'var(--danger)',
                              background: scoreDelta >= 0 ? 'var(--success-dim)' : 'var(--danger-dim)',
                            }}
                          >
                            {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

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

          {/* Right column: Preflight checklist + Upload card + Practice cards */}
          <div className="space-y-6 self-start">
            {/* Preflight checklist */}
            <section className="surface-card-strong p-6 lg:p-8">
              <p className="section-label">Preflight Checklist</p>
              <div className="mt-5 space-y-3">
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

            {/* Upload card */}
            <Link href="/upload" className="upload-card">
              <div className="upload-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <h3>Upload Your {completedRuns.length > 0 ? 'Next' : 'First'} Run</h3>
              <p>Supported formats: MP4, MOV (Up to 4K)</p>
            </Link>

            {/* Practice cards */}
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

            {/* Clip quality explainer */}
            <div className="text-center py-2">
              <Link
                href="/upload"
                className="clip-quality-toggle"
                style={{ display: 'inline-flex' }}
              >
                What happens with a low-quality clip?
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
              </Link>
            </div>
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
