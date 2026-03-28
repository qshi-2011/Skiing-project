'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { buildTechniqueDashboard, scoreLabel, scoreContext, computeReliability, buildReliabilityMessage, generateLimitations, type TechniqueRunSummary, type RecapReliability, type AiCoaching, type AiCoachingPoint } from '@/lib/analysis-summary'
import { getDrill } from '@/lib/drills'
import type { ArtifactWithUrl, Job, JobStatus } from '@/lib/types'

interface JobResponse {
  job: Job
  artifacts: ArtifactWithUrl[]
  summary: TechniqueRunSummary | null
  previousScore: number | null
  aiCoaching: AiCoaching | null
}

type Tab = 'recap' | 'metrics' | 'moments' | 'downloads'

const ACTIVE: Set<JobStatus> = new Set(['created', 'uploaded', 'queued', 'running'])

const STATUS_META: Record<JobStatus, { label: string; color: string; background: string; helper: string }> = {
  created: { label: 'Preparing upload', color: 'var(--ink-soft)', background: 'rgba(0,0,0,0.04)', helper: 'We are setting up your run.' },
  uploaded: { label: 'Upload complete', color: 'var(--accent)', background: 'var(--accent-dim)', helper: 'Your video is ready. Analysis will begin shortly.' },
  queued: { label: 'Starting soon', color: 'var(--gold)', background: 'var(--gold-dim)', helper: 'We are getting your analysis started.' },
  running: { label: 'Analyzing run', color: 'var(--accent)', background: 'var(--accent-dim)', helper: 'We are reviewing your technique and preparing your recap.' },
  done: { label: 'Recap ready', color: 'var(--success)', background: 'var(--success-dim)', helper: 'Your feedback is ready to review.' },
  error: { label: 'Analysis failed', color: 'var(--danger)', background: 'var(--danger-dim)', helper: 'Retry with a cleaner single-run clip.' },
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'recap', label: 'Recap' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'moments', label: 'Moments' },
  { id: 'downloads', label: 'Downloads' },
]

const CATEGORY_COLORS: Record<string, { accent: string; badge: string }> = {
  balance: { accent: 'coaching-accent-balance', badge: 'category-badge-balance' },
  edging: { accent: 'coaching-accent-edging', badge: 'category-badge-edging' },
  rhythm: { accent: 'coaching-accent-rhythm', badge: 'category-badge-rhythm' },
  movement: { accent: 'coaching-accent-movement', badge: 'category-badge-movement' },
  general: { accent: 'coaching-accent-general', badge: 'category-badge-general' },
}

function signedDownloads(artifacts: ArtifactWithUrl[]) {
  return [
    { label: 'Annotated recap video', artifact: artifacts.find((a) => a.kind === 'video_overlay') },
  ].filter((e): e is { label: string; artifact: ArtifactWithUrl } => Boolean(e.artifact?.url))
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

function coachingHeadline(job: Job, aiCoaching: AiCoaching | null, reliability: RecapReliability) {
  if (reliability === 'insufficient') {
    return 'Analysis quality is limited for this clip.'
  }
  if (aiCoaching?.coaching_points?.[0]?.title) return aiCoaching.coaching_points[0].title
  if (aiCoaching?.coach_summary) return aiCoaching.coach_summary
  if (job.status === 'done') return 'Your run recap is ready.'
  if (job.status === 'error') return 'This run did not complete. A cleaner single-athlete clip usually gets the recap back on track.'
  return 'We are finishing the coach feedback for this run.'
}

function metricDotColor(value: number, threshold: number): string {
  return value >= threshold ? 'var(--accent)' : 'var(--gold)'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function progressWindow(job: Job) {
  const step = typeof job.config?.progress_step === 'number' ? job.config.progress_step : null
  const total = typeof job.config?.progress_total === 'number' ? job.config.progress_total : null

  if (job.status === 'done') return { floor: 100, cap: 100 }
  if (job.status === 'error') return { floor: 100, cap: 100 }

  if (step != null && total && total > 0) {
    const safeStep = clamp(step, 1, total)
    const floor = clamp(Math.round(((safeStep - 1) / total) * 100) + 6, 6, 94)
    const cap = safeStep === total
      ? 96
      : clamp(Math.round((safeStep / total) * 100) + 10, floor + 8, 96)
    return { floor, cap }
  }

  switch (job.status) {
    case 'created':
      return { floor: 8, cap: 18 }
    case 'uploaded':
      return { floor: 16, cap: 30 }
    case 'queued':
      return { floor: 24, cap: 42 }
    case 'running':
      return { floor: 40, cap: 92 }
    default:
      return { floor: 8, cap: 16 }
  }
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()

  const [data, setData] = useState<JobResponse | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('recap')
  const [displayProgress, setDisplayProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function loadJob() {
      try {
        const response = await fetch(`/api/jobs/${id}`)
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'This run could not be found.' : 'We could not load this run right now.')
        }
        const json: JobResponse = await response.json()
        if (!cancelled) {
          setData(json)
          setFetchError(null)
        }
        return json.job.status
      } catch (error) {
        if (!cancelled) setFetchError(error instanceof Error ? error.message : 'We could not load this run right now.')
        return null
      }
    }

    async function poll() {
      const status = await loadJob()
      if (!cancelled && status && ACTIVE.has(status)) {
        timer = setTimeout(poll, 4000)
      }
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [id])

  useEffect(() => {
    if (!data) {
      setDisplayProgress(0)
      return
    }

    const job = data.job
    const isActive = ACTIVE.has(job.status)
    if (!isActive) {
      setDisplayProgress(job.status === 'done' ? 100 : 0)
      return
    }

    const { floor, cap } = progressWindow(job)
    setDisplayProgress((prev) => {
      const seeded = prev > 0 ? prev : floor
      return clamp(Math.max(seeded, floor), floor, cap)
    })

    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        const current = clamp(Math.max(prev, floor), floor, cap)
        if (current >= cap) return current
        const next = current + Math.max(0.8, (cap - current) * 0.12)
        return clamp(Math.round(next * 10) / 10, floor, cap)
      })
    }, 900)

    return () => clearInterval(timer)
  }, [data])

  if (fetchError && !data) {
    return (
      <>
        <div className="route-bg route-bg--detail" />
        <div className="space-y-4">
          <div className="surface-card-strong p-6" style={{ color: 'var(--danger)', background: 'var(--danger-dim)' }}>
            {fetchError}
          </div>
          <Link href="/jobs" className="cta-secondary">Back to archive</Link>
        </div>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <div className="route-bg route-bg--detail" />
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-36 rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }} />
          <div className="surface-card h-[24rem]" />
        </div>
      </>
    )
  }

  const { job, artifacts, summary, previousScore, aiCoaching } = data
  const statusMeta = STATUS_META[job.status]
  const dashboard = summary ? buildTechniqueDashboard(summary) : null
  const reliability: RecapReliability = dashboard?.reliability ?? (summary ? computeReliability(summary) : 'reliable')
  const reliabilityMessage = summary ? buildReliabilityMessage(summary) : null
  const isActive = ACTIVE.has(job.status)
  const fromUpload = searchParams.get('fromUpload') === '1'
  const progressNote = typeof job.config?.progress_note === 'string' ? job.config.progress_note : null
  const overlayArtifact = artifacts.find((artifact) => artifact.kind === 'video_overlay')
  const coolMomentPhotos = artifacts.filter((artifact) => artifact.kind === 'cool_moment_photo')
  const peakFrames = artifacts.filter((artifact) => artifact.kind === 'peak_pressure_frame' || artifact.kind === 'peak_pressure_frame_enhanced')
  const downloads = signedDownloads(artifacts)
  const headline = coachingHeadline(job, aiCoaching, reliability)
  const score = job.score ?? dashboard?.overview.overallScore ?? null
  const level = score != null ? scoreLabel(score) : null
  const scoreDelta = score != null && previousScore != null ? score - previousScore : null
  const breadcrumbName =
    String(job.config?.original_filename ?? '') ||
    job.video_object_path?.split('/').pop() ||
    job.id.slice(0, 8)

  return (
    <>
      <div className="route-bg route-bg--detail" />
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 px-1 sm:px-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <Link href="/jobs" className="hover:underline">Archive</Link>
          <span>/</span>
          <span className="font-mono" style={{ color: 'var(--ink-strong)' }}>{breadcrumbName}</span>
        </div>

        {fromUpload && isActive && (
          <section className="surface-card p-4" style={{ background: 'rgba(0,132,212,0.06)', border: '1px solid rgba(0,132,212,0.15)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-strong)' }}>
              Upload complete. We&apos;re analyzing your run now.
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
              Stay on this page to watch the recap fill in automatically.
            </p>
          </section>
        )}

        {/* ── Run Recap hero ──────────────────────────── */}
        <section className="surface-card p-6 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.16fr_0.84fr]">
            {/* Left: video + score */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="eyebrow">Run Recap</span>
                  {reliability !== 'reliable' && (
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        color: reliability === 'insufficient' ? 'var(--gold)' : 'var(--accent)',
                        background: reliability === 'insufficient' ? 'var(--gold-dim)' : 'var(--accent-dim)',
                      }}
                    >
                      {reliability === 'insufficient' ? 'Limited Review' : 'Tentative'}
                    </span>
                  )}
                </div>
                <span className="status-pill" style={{ color: statusMeta.color, background: statusMeta.background }}>
                  {statusMeta.label}
                </span>
              </div>

              {/* Score + headline row */}
              <div className="flex items-start gap-5">
                {score != null && reliability !== 'insufficient' && (
                  <div className="score-ring shrink-0" style={{ width: '6.5rem', height: '6.5rem' }}>
                    <div className="score-ring-glow" />
                    <svg width="104" height="104" viewBox="0 0 104 104">
                      <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                      <circle
                        cx="52" cy="52" r="44"
                        fill="none"
                        stroke="url(#scoreGradDetail)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="276.46"
                        strokeDashoffset={276.46 - (score / 100) * 276.46}
                      />
                      <defs>
                        <linearGradient id="scoreGradDetail" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#0084d4" />
                          <stop offset="100%" stopColor="#c79a44" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="score-ring-label">
                      <span className="font-extrabold tracking-tight" style={{ fontSize: '1.6rem', color: 'var(--ink-strong)' }}>
                        {score}
                      </span>
                    </div>
                  </div>
                )}
                {reliability === 'insufficient' && (
                  <div
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{ width: '6.5rem', height: '6.5rem', background: 'rgba(0,0,0,0.04)', border: '2px dashed rgba(0,0,0,0.12)' }}
                  >
                    <div className="text-center px-2">
                      <p className="text-xs font-bold" style={{ color: 'var(--ink-soft)' }}>No score</p>
                      <p style={{ fontSize: '0.62rem', color: 'var(--ink-muted)' }}>for this clip</p>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h1 style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, color: 'var(--ink-strong)' }}>
                    {reliability === 'insufficient'
                      ? (reliabilityMessage?.title ?? 'Score unavailable for this clip')
                      : score != null ? headline : 'Review how this run moved.'}
                  </h1>
                  {reliability === 'insufficient' && reliabilityMessage && (
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-soft)' }}>
                      {reliabilityMessage.hideScoreReason}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {level && reliability !== 'insufficient' && (
                      <span className={levelBadgeClass(level)}>
                        {reliability === 'limited' ? `${level} (tentative)` : level}
                      </span>
                    )}
                    {scoreDelta != null && reliability !== 'insufficient' && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          color: scoreDelta >= 0 ? 'var(--success)' : 'var(--danger)',
                          background: scoreDelta >= 0 ? 'var(--success-dim)' : 'var(--danger-dim)',
                        }}
                      >
                        {scoreDelta >= 0 ? '+' : ''}{scoreDelta} vs prev
                      </span>
                    )}
                    {score != null && reliability !== 'insufficient' && (
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {scoreContext(score)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Video */}
              {overlayArtifact?.url ? (
                <div
                  className="overflow-hidden"
                  style={{ borderRadius: 'var(--radius-xl)', background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <video src={overlayArtifact.url} controls playsInline className="w-full aspect-video bg-black" />
                </div>
              ) : (
                <div
                  className="aspect-video flex items-center justify-center text-center p-8"
                  style={{ borderRadius: 'var(--radius-xl)', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', color: 'var(--ink-soft)' }}
                >
                  The recap video will appear after the coach feedback finishes and the full recap is published.
                </div>
              )}
            </div>

            {/* Right sidebar: metrics + context */}
            <aside className="space-y-4">
              {/* Quick metrics */}
              <div className="surface-card-muted p-5">
                <p className="section-label">Technique Summary</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className={dashboard && dashboard.overview.overallScore > 60 ? 'metric-tile metric-tile--high' : dashboard ? 'metric-tile metric-tile--low' : 'metric-tile'}>
                    <div className="metric-tile-dot" style={{ background: dashboard ? metricDotColor(dashboard.overview.overallScore, 60) : 'var(--ink-muted)' }} />
                    <p className="metric-value" style={{ color: dashboard && dashboard.overview.overallScore > 60 ? 'var(--accent)' : 'var(--gold)' }}>
                      {dashboard ? dashboard.overview.overallScore : '—'}
                    </p>
                    <p className="metric-label">Technique score</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard ? dashboard.overview.turnsDetected : artifacts.length}</p>
                    <p className="metric-label">{dashboard ? 'Turns detected' : 'Files ready'}</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard ? `${dashboard.overview.edgeAngle.toFixed(0)}°` : '—'}</p>
                    <p className="metric-label">Edge angle</p>
                  </div>
                  <div className={dashboard && reliability === 'reliable' ? 'metric-tile metric-tile--high' : dashboard ? 'metric-tile metric-tile--low' : 'metric-tile'}>
                    <div className="metric-tile-dot" style={{ background: dashboard && reliability === 'reliable' ? 'var(--accent)' : 'var(--gold)' }} />
                    <p className="metric-value" style={{ color: dashboard && reliability === 'reliable' ? 'var(--accent)' : 'var(--gold)' }}>
                      {dashboard ? dashboard.overview.clipQualityLabel : '—'}
                    </p>
                    <p className="metric-label">Clip quality</p>
                  </div>
                </div>
              </div>

              {/* Run context */}
              <div className="surface-card-muted p-5">
                <p className="section-label">Run Context</p>
                <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--ink-base)' }}>
                  <p>
                    <span style={{ color: 'var(--ink-muted)' }}>Uploaded:</span>{' '}
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                  <p>
                    <span style={{ color: 'var(--ink-muted)' }}>Updated:</span>{' '}
                    {new Date(job.updated_at).toLocaleString()}
                  </p>
                  <p>
                    <span style={{ color: 'var(--ink-muted)' }}>Status:</span>{' '}
                    {progressNote ?? statusMeta.helper}
                  </p>
                </div>
              </div>

              {/* Processing progress */}
              {isActive && (() => {
                const stage = typeof job.config?.progress_stage === 'string' ? job.config.progress_stage : null
                const label = stage
                  ? stage
                  : progressNote ?? statusMeta.helper
                return (
                  <div className="surface-card-muted p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>Processing</p>
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Auto refresh</span>
                    </div>
                    <div className="mt-3 progress-track">
                      <div className="progress-fill transition-all duration-700" style={{ width: `${displayProgress}%` }} />
                    </div>
                    <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{label}</p>
                  </div>
                )
              })()}

              {job.error && (
                <div className="surface-card-muted p-5 text-sm" style={{ color: 'var(--danger)', background: 'var(--danger-dim)' }}>
                  {job.error}
                </div>
              )}
            </aside>
          </div>
        </section>

        {/* ── Tab navigation ──────────────────────────── */}
        <section className="surface-card-strong p-3 flex flex-wrap gap-2" style={{ position: 'sticky', top: 'var(--sticky-tabs-offset)', zIndex: 30 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: activeTab === tab.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: activeTab === tab.id ? 'var(--ink-strong)' : 'var(--ink-soft)',
                border: activeTab === tab.id ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </section>

        {/* ── Recap tab ───────────────────────────────── */}
        {activeTab === 'recap' && (
          <div className="space-y-6">
            {/* Reliability banners */}
            {reliability !== 'reliable' && reliabilityMessage && (
              <div className="surface-card p-5 flex items-start gap-3" style={{
                background: reliability === 'insufficient' ? 'var(--gold-dim)' : 'rgba(0,132,212,0.06)',
                border: reliability === 'insufficient' ? '1px solid rgba(199,154,68,0.25)' : '1px solid rgba(0,132,212,0.15)',
              }}>
                <span style={{ fontSize: '1.25rem' }}>{reliability === 'insufficient' ? '\u26A0' : '\u2139'}</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{reliabilityMessage.title}</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                    {reliabilityMessage.explanation}
                  </p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-soft)' }}>
                    {reliabilityMessage.nextStep}
                  </p>
                </div>
              </div>
            )}

            {/* ── Coach's Analysis ─────────────────────── */}
            {aiCoaching ? (
              <section className="surface-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="section-label" style={{ color: 'var(--accent)' }}>Coach&apos;s Analysis</p>
                    <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                      Personalised feedback for this run
                    </h2>
                  </div>
                  <span className="eyebrow">AI Coach</span>
                </div>

                {/* Coach summary */}
                <div className="mt-5 coach-summary">
                  <p className="text-base leading-7" style={{ color: 'var(--ink-base)' }}>
                    {aiCoaching.coach_summary}
                  </p>
                </div>

                {/* Coaching points */}
                <div className="mt-5 space-y-3">
                  {aiCoaching.coaching_points.map((point: AiCoachingPoint, idx: number) => {
                    const catColors = CATEGORY_COLORS[point.category] ?? CATEGORY_COLORS.general
                    const CATEGORY_LABELS: Record<string, string> = {
                      movement: 'Movement', edging: 'Edging', rhythm: 'Rhythm', balance: 'Balance', general: 'General',
                    }
                    const drill = point.recommended_drill_id ? getDrill(point.recommended_drill_id) : null
                    return (
                      <div key={`${point.title}-${idx}`} className={`coaching-card ${catColors.accent}`}>
                        <div className="flex items-center gap-3 pl-3">
                          <span className="preflight-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.62rem' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{point.title}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${catColors.badge}`}>
                            {CATEGORY_LABELS[point.category] ?? point.category}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 pl-3" style={{ color: 'var(--ink-base)' }}>
                          {point.feedback}
                        </p>
                        {drill && (
                          <div className="mt-3 pl-3">
                            <div className="drill-card inline-flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Recommended Drill</p>
                                <p className="mt-1 text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{drill.title}</p>
                                <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{drill.description}</p>
                              </div>
                              {drill.videoUrl && (
                                <a
                                  href={drill.videoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cta-primary shrink-0"
                                  style={{ padding: '0.5rem 1rem', fontSize: '0.78rem' }}
                                >
                                  Watch Drill
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Additional observations */}
                {aiCoaching.additional_observations?.length > 0 && (
                  <div className="mt-5">
                    <p className="section-label">Additional Observations</p>
                    <ul className="mt-3 space-y-2">
                      {aiCoaching.additional_observations.map((obs: string, idx: number) => (
                        <li key={idx} className="text-sm leading-6 pl-3" style={{ color: 'var(--ink-base)', borderLeft: '2px solid rgba(0,0,0,0.08)', paddingLeft: '0.75rem' }}>
                          {obs}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              <section className="surface-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="section-label" style={{ color: 'var(--accent)' }}>Coach&apos;s Analysis</p>
                    <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                      {isActive ? 'Your coach is still writing this recap' : 'Coach feedback is not ready yet'}
                    </h2>
                  </div>
                  <span className="eyebrow">AI Coach</span>
                </div>
                <p className="mt-5 text-base leading-7" style={{ color: 'var(--ink-base)' }}>
                  {isActive
                    ? 'We only publish the coaching section once the local LLM finishes writing it. The page will refresh automatically as soon as that feedback is ready.'
                    : 'This run does not have LLM coach feedback attached yet. Re-run the analysis if you want a complete coach-written recap.'}
                </p>
              </section>
            )}

            {/* ── Recommended Practice (drill summary) ─── */}
            {aiCoaching && (() => {
              const recommendedDrills = aiCoaching.coaching_points
                .map((p: AiCoachingPoint) => p.recommended_drill_id)
                .filter((id): id is string => id != null)
                .map((id) => getDrill(id))
                .filter((d): d is NonNullable<typeof d> => d != null)
              const uniqueDrills = [...new Map(recommendedDrills.map((d) => [d.id, d])).values()]
              if (!uniqueDrills.length) return null
              return (
                <section className="surface-card p-6">
                  <p className="section-label">Recommended Practice</p>
                  <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                    Drills for your next session
                  </h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {uniqueDrills.map((drill) => (
                      <div key={drill.id} className="drill-card p-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          CATEGORY_COLORS[drill.category]?.badge ?? 'category-badge-general'
                        }`}>
                          {drill.category.charAt(0).toUpperCase() + drill.category.slice(1)}
                        </span>
                        <h3 className="mt-3 text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{drill.title}</h3>
                        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ink-soft)' }}>{drill.description}</p>
                              {drill.videoUrl && (
                          <a
                            href={drill.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cta-primary mt-3 w-full"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.78rem' }}
                          >
                            Watch Drill
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })()}

            {/* ── Model Limitations ────────────────────── */}
            {summary && (() => {
              const limitations = generateLimitations(summary)
              if (!limitations.length) return null
              return (
                <section className="surface-card p-6">
                  <p className="section-label" style={{ color: 'var(--gold)' }}>Keep in mind</p>
                  <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                    Limits of this review
                  </h2>
                  <div className="mt-5 space-y-3">
                    {limitations.map((lim, idx) => (
                      <div key={idx} className="limitations-card">
                        <h4>{lim.title}</h4>
                        <p>{lim.explanation}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })()}
          </div>
        )}

        {/* ── Metrics tab (Technique Markers) ─────────── */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-2">
              {dashboard?.categories.map((category) => (
                <article key={category.id} className="surface-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="section-label">{category.title}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                        These checks roll up the strongest movement patterns from your run.
                      </p>
                    </div>
                    <div className="text-center">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-extrabold"
                        style={{ background: 'var(--accent-dim)', color: 'var(--ink-strong)' }}
                      >
                        {category.score}
                      </div>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-muted)' }}>
                        {category.status}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {category.metrics.map((metric) => (
                      <div key={`${category.id}-${metric.label}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{metric.label}</p>
                          <p className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{metric.value}</p>
                        </div>
                        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{metric.helper}</p>
                        <div className="mt-3 metric-rail">
                          <span style={{ width: `${metric.fill}%` }}>
                            <span className="metric-rail-dot" />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                          <span>{metric.leftLabel}</span>
                          <span>{metric.rightLabel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )) ?? (
                <article className="surface-card p-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  Detailed metrics will appear here once your recap is ready.
                </article>
              )}
            </section>

            {!!dashboard?.turnHighlights.length && (
              <section className="surface-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="section-label">Turn Highlights</p>
                    <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                      Best turns in this pass
                    </h2>
                  </div>
                  <span className="status-pill" style={{ color: 'var(--success)', background: 'var(--success-dim)' }}>
                    Technique scores
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {dashboard.turnHighlights.map((turn) => (
                    <div key={turn.title} className="surface-card-muted p-4">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{turn.title}</p>
                      <p className="mt-3 text-3xl font-extrabold tracking-tight" style={{ color: 'var(--ink-strong)', fontVariantNumeric: 'tabular-nums' }}>
                        {turn.score}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{turn.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── Moments tab ─────────────────────────────── */}
        {activeTab === 'moments' && (
          <div className="space-y-6">
            <section className="surface-card p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="section-label">Key Moments</p>
                  <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                    Review the strongest still frames
                  </h2>
                </div>
                <span className="status-pill" style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}>
                  {coolMomentPhotos.length} photos
                </span>
              </div>

              {coolMomentPhotos.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {coolMomentPhotos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="moment-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={`Turn ${(photo.meta.turn_idx ?? 0) + 1}`} className="w-full aspect-[4/3] object-cover" />
                      <div className="moment-card-overlay">
                        <p className="text-xs font-mono text-white">
                          Turn {(photo.meta.turn_idx ?? 0) + 1}
                          {photo.meta.side ? ` · ${photo.meta.side}` : ''}
                          {photo.meta.timestamp_s != null ? ` · ${Number(photo.meta.timestamp_s).toFixed(1)}s` : ''}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-5 surface-card-muted p-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  No cool-moment photos were attached to this run.
                </div>
              )}
            </section>

            <section className="surface-card p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="section-label">Peak Pressure Frames</p>
                  <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                    Pressure snapshots across turns
                  </h2>
                </div>
                <span className="status-pill" style={{ color: 'var(--gold)', background: 'var(--gold-dim)' }}>
                  {peakFrames.length} frames
                </span>
              </div>

              {peakFrames.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {peakFrames.map((frame) => (
                    <a key={frame.id} href={frame.url} target="_blank" rel="noopener noreferrer" className="moment-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frame.url} alt={`Turn ${(frame.meta.turn_idx ?? 0) + 1}`} className="w-full aspect-[4/3] object-cover" />
                      <div className="moment-card-overlay">
                        <p className="text-xs font-mono text-white">
                          Turn {(frame.meta.turn_idx ?? 0) + 1}
                          {frame.meta.side ? ` · ${frame.meta.side}` : ''}
                          {frame.meta.timestamp_s != null ? ` · ${Number(frame.meta.timestamp_s).toFixed(1)}s` : ''}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-5 surface-card-muted p-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  Peak pressure frames have not been attached to this run yet.
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Downloads tab ───────────────────────────── */}
        {activeTab === 'downloads' && (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="surface-card p-6">
              <p className="section-label">Exports</p>
              <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                Files you can keep
              </h2>

              <div className="mt-5 space-y-3">
                {downloads.length ? downloads.map(({ label, artifact }) => (
                  <a
                    key={`${label}-${artifact.id}`}
                    href={artifact.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="surface-card-muted px-4 py-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{label}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        Open this file in a new tab.
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-soft)' }}>
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )) : (
                  <div className="surface-card-muted p-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
                    No export files are ready yet.
                  </div>
                )}
              </div>
            </section>

            <section className="surface-card p-6">
              <p className="section-label">Run Assets</p>
              <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                What is included
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="metric-tile">
                  <p className="metric-value">{overlayArtifact ? 1 : 0}</p>
                  <p className="metric-label">Video recap</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{downloads.length}</p>
                  <p className="metric-label">Downloads ready</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{coolMomentPhotos.length}</p>
                  <p className="metric-label">Highlight photos</p>
                </div>
                <div className="metric-tile">
                  <p className="metric-value">{peakFrames.length}</p>
                  <p className="metric-label">Action stills</p>
                </div>
              </div>

              {aiCoaching?.coach_summary ? (
                <div className="mt-6 surface-card-muted p-4">
                  <p className="section-label">Coach Note</p>
                  <p className="mt-3 text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                    {aiCoaching.coach_summary}
                  </p>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
