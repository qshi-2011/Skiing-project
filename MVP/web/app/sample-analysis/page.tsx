'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  buildTechniqueDashboard,
  clipQualityLabel,
  scoreLabel,
  scoreContext,
  type TechniqueRunSummary,
  type CoachingTip,
} from '@/lib/analysis-summary'
import { SiteFooter } from '@/components/site-footer'

// ── Hardcoded analysis results from the sample video ─────────
const SAMPLE_SUMMARY: TechniqueRunSummary = {
  quality: {
    overall_pose_confidence_mean: 0.939,
    low_confidence_fraction: 0.0,
    warnings: [],
  },
  turns: [
    {
      turn_idx: 0, side: 'right', duration_s: 1.068,
      avg_knee_flexion_diff: 39.21, avg_stance_width_ratio: 1.53,
      avg_upper_body_quietness: 0.0105, avg_lean_angle: 39.79,
      avg_edge_angle: 58.63, avg_com_shift_3d: 0.381,
      quality_score: 65.2, smoothness_score: 76.2,
    },
    {
      turn_idx: 1, side: 'left', duration_s: 1.401,
      avg_knee_flexion_diff: 9.15, avg_stance_width_ratio: 1.23,
      avg_upper_body_quietness: 0.0074, avg_lean_angle: 30.85,
      avg_edge_angle: 40.02, avg_com_shift_3d: 0.386,
      quality_score: 79.5, smoothness_score: 80.3,
    },
    {
      turn_idx: 2, side: 'right', duration_s: 1.468,
      avg_knee_flexion_diff: 25.88, avg_stance_width_ratio: 1.21,
      avg_upper_body_quietness: 0.0086, avg_lean_angle: 34.63,
      avg_edge_angle: 47.47, avg_com_shift_3d: 0.353,
      quality_score: 69.8, smoothness_score: 77.9,
    },
    {
      turn_idx: 3, side: 'left', duration_s: 1.735,
      avg_knee_flexion_diff: 12.28, avg_stance_width_ratio: 1.27,
      avg_upper_body_quietness: 0.008, avg_lean_angle: 26.93,
      avg_edge_angle: 37.28, avg_com_shift_3d: 0.38,
      quality_score: 78.0, smoothness_score: 84.6,
    },
  ],
  coaching_tips: [
    {
      title: 'Work on symmetric knee flexion',
      explanation: 'Average left-right knee flexion asymmetry is 20.8\u00b0. Aim for <10\u00b0 symmetry to distribute load evenly and improve edge control.',
      evidence: 'Asymmetry 21\u00b0 \u2014 target is under 10\u00b0',
      severity: 'action',
      time_ranges: [[0.0, 1.07], [2.47, 3.94]],
    },
    {
      title: 'Significant technique improvements needed',
      explanation: 'Average technique score is 40/100. Multiple mechanics need attention \u2014 focus on knee flexion, balance, and body alignment before adding speed.',
      evidence: 'Technique score: 40/100',
      severity: 'action',
      time_ranges: [[2.47, 3.94], [0.0, 1.07]],
    },
    {
      title: 'Quiet your upper body rotation',
      explanation: 'Shoulder tilt varies by 14\u00b0 across the run. Excessive upper body rotation wastes energy; focus on separating hip and shoulder movement.',
      evidence: 'Shoulder variation 14\u00b0 \u2014 aim for under 8\u00b0',
      severity: 'warn',
      time_ranges: [[0.0, 1.07], [2.47, 3.94]],
    },
    {
      title: 'Drive your knees forward over your toes',
      explanation: 'Hip-knee-ankle stack is off-center. Pressing knees forward improves edge engagement and fore-aft balance.',
      evidence: 'Alignment offset: Needs work (0.36, ideal is 0)',
      severity: 'warn',
      time_ranges: [[2.47, 3.94], [0.0, 1.07]],
    },
    {
      title: 'Reduce excessive body lean',
      explanation: 'Average full-body lean is 33\u00b0 from vertical. Leaning beyond 20\u201325\u00b0 risks losing balance. Lead with your hips and keep your upper body more upright.',
      evidence: 'Lean angle: 33\u00b0 \u2014 target under 25\u00b0',
      severity: 'warn',
      time_ranges: [[0.0, 1.07], [2.47, 3.94]],
    },
    {
      title: 'Stabilise your upper body',
      explanation: 'Notable head and torso movement detected across the run. Focus on keeping your core still while hips drive turns.',
      evidence: 'Upper-body motion: Needs work',
      severity: 'info',
      time_ranges: [[0.0, 1.07], [2.47, 3.94]],
    },
  ],
  segments: [
    { idx: 0, start_s: 0.0, end_s: 5.74, n_confident_frames: 86, mean_confidence: 0.939, n_turns: 4, is_primary: true },
  ],
}

const dashboard = buildTechniqueDashboard(SAMPLE_SUMMARY)
const score = dashboard.overview.overallScore
const level = scoreLabel(score)

const CATEGORY_COLORS: Record<string, { accent: string; badge: string }> = {
  balance: { accent: 'coaching-accent-balance', badge: 'category-badge-balance' },
  edging: { accent: 'coaching-accent-edging', badge: 'category-badge-edging' },
  rhythm: { accent: 'coaching-accent-rhythm', badge: 'category-badge-rhythm' },
  movement: { accent: 'coaching-accent-movement', badge: 'category-badge-movement' },
  general: { accent: 'coaching-accent-general', badge: 'category-badge-general' },
}

const CATEGORY_LABELS: Record<string, string> = {
  movement: 'Movement', edging: 'Edging', rhythm: 'Rhythm', balance: 'Balance', general: 'General',
}

function tipCategory(tip: CoachingTip): string {
  const text = `${tip.title} ${tip.explanation}`.toLowerCase()
  if (text.includes('rotat') || text.includes('upper body') || text.includes('quiet') || text.includes('counter')) return 'movement'
  if (text.includes('edge') || text.includes('carv') || text.includes('angulat') || text.includes('tilt')) return 'edging'
  if (text.includes('rhythm') || text.includes('tempo') || text.includes('timing') || text.includes('flow') || text.includes('pace')) return 'rhythm'
  if (text.includes('stance') || text.includes('balance') || text.includes('center') || text.includes('weight') || text.includes('narrow') || text.includes('wide')) return 'balance'
  return 'movement'
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

function metricDotColor(value: number, threshold: number): string {
  return value >= threshold ? 'var(--accent)' : 'var(--gold)'
}

type Tab = 'recap' | 'metrics'

export default function SampleAnalysisPage() {
  const [activeTab, setActiveTab] = useState<Tab>('recap')
  const [showAllTips, setShowAllTips] = useState(false)

  const headline = dashboard.focusCards[0]?.explanation ?? ''

  return (
    <>
      <div className="route-bg route-bg--detail" />
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 px-1 sm:px-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <Link href="/" className="hover:underline">Home</Link>
          <span>/</span>
          <span style={{ color: 'var(--ink-strong)' }}>Sample Analysis</span>
        </div>

        {/* ── Hero: video + score column ──────────────── */}
        <section className="surface-card p-6 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.16fr_0.84fr]">
            {/* Left: video + score */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="eyebrow">Run Recap</span>
                <span className="eyebrow eyebrow--warm" style={{ fontSize: '0.62rem', padding: '0.3rem 0.6rem' }}>
                  Sample Run
                </span>
              </div>

              {/* Score + headline row */}
              <div className="flex items-start gap-5">
                <div className="score-ring shrink-0" style={{ width: '6.5rem', height: '6.5rem' }}>
                  <div className="score-ring-glow" />
                  <svg width="104" height="104" viewBox="0 0 104 104">
                    <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                    <circle
                      cx="52" cy="52" r="44"
                      fill="none"
                      stroke="url(#scoreGradSample)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="276.46"
                      strokeDashoffset={276.46 - (score / 100) * 276.46}
                    />
                    <defs>
                      <linearGradient id="scoreGradSample" x1="0" y1="0" x2="1" y2="1">
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
                <div className="flex-1 min-w-0">
                  <h1 style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, color: 'var(--ink-strong)' }}>
                    {headline}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={levelBadgeClass(level)}>{level}</span>
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {scoreContext(score)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Overlay video */}
              <div
                className="overflow-hidden"
                style={{ borderRadius: 'var(--radius-xl)', background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <video src="/sample/overlay.mp4" autoPlay loop muted playsInline controls className="w-full aspect-video bg-black" />
              </div>
            </div>

            {/* Right sidebar */}
            <aside className="space-y-4">
              {/* Quick metrics */}
              <div className="surface-card-muted p-5">
                <p className="section-label">Technique Summary</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className={dashboard.overview.overallScore > 60 ? 'metric-tile metric-tile--high' : 'metric-tile metric-tile--low'}>
                    <div className="metric-tile-dot" style={{ background: metricDotColor(dashboard.overview.overallScore, 60) }} />
                    <p className="metric-value" style={{ color: dashboard.overview.overallScore > 60 ? 'var(--accent)' : 'var(--gold)' }}>
                      {dashboard.overview.overallScore}
                    </p>
                    <p className="metric-label">Technique score</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard.overview.turnsDetected}</p>
                    <p className="metric-label">Turns detected</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard.overview.edgeAngle.toFixed(0)}&deg;</p>
                    <p className="metric-label">Edge angle</p>
                  </div>
                  <div className="metric-tile metric-tile--high">
                    <div className="metric-tile-dot" style={{ background: 'var(--accent)' }} />
                    <p className="metric-value" style={{ color: 'var(--accent)' }}>
                      {clipQualityLabel(dashboard.reliability)}
                    </p>
                    <p className="metric-label">Clip quality</p>
                  </div>
                </div>
              </div>

              {/* Run context (sample-specific) */}
              <div className="surface-card-muted p-5">
                <p className="section-label">About This Sample</p>
                <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--ink-base)' }}>
                  <p>
                    This analysis was generated from a real ski run and turned into a full recap automatically.
                    The scores, coaching tips, and overlays all come from the same review flow used on uploaded runs.
                  </p>
                  <p style={{ color: 'var(--ink-muted)' }}>
                    Upload your own run to get a personalised breakdown.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* ── Tab navigation ──────────────────────────── */}
        <section className="surface-card-strong p-3 flex flex-wrap gap-2" style={{ position: 'sticky', top: 'var(--sticky-tabs-offset)', zIndex: 30 }}>
          {([{ id: 'recap' as Tab, label: 'Recap' }, { id: 'metrics' as Tab, label: 'Metrics' }]).map((tab) => (
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
            <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
              {/* Run summary */}
              <section className="surface-card p-6">
                <p className="section-label">Run Summary</p>
                <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                  What stands out first
                </h2>
                <p className="mt-4 text-base leading-7" style={{ color: 'var(--ink-base)' }}>
                  {headline}
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard.overview.bestTurnScore}</p>
                    <p className="metric-label">Best turn quality</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-value">{dashboard.overview.turnsDetected}</p>
                    <p className="metric-label">Turns in coaching pass</p>
                  </div>
                      <div className="metric-tile">
                        <p className="metric-value">{dashboard.focusCards.length}</p>
                        <p className="metric-label">Top priorities</p>
                      </div>
                      <div className="metric-tile">
                        <p className="metric-value">{dashboard.overview.smoothnessScore ?? '—'}</p>
                        <p className="metric-label">Turn flow</p>
                      </div>
                </div>
              </section>

              {/* Coaching insights */}
              <section className="surface-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="section-label" style={{ color: 'var(--amber)' }}>Coaching Insights</p>
                    <h2 className="mt-2" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                      Top priorities
                    </h2>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {(() => {
                    const allTips = dashboard.allTips
                    const visibleTips = showAllTips ? allTips : allTips.slice(0, 2)
                    return (
                      <>
                        {visibleTips.map((tip, idx) => {
                          const category = tipCategory(tip)
                          const catColors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general
                          const timeLabel = tip.time_ranges?.length
                            ? `Most visible around ${tip.time_ranges.map(([s]) => `${s.toFixed(1)}s`).join(' and ')}`
                            : null
                          return (
                            <div key={`${tip.title}-${tip.evidence}`} className={`coaching-card ${catColors.accent}`}>
                              <div className="flex items-center gap-3 pl-3">
                                <span className="preflight-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.62rem' }}>
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold" style={{ color: 'var(--ink-strong)' }}>{tip.title}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${catColors.badge}`}>
                                  {CATEGORY_LABELS[category]}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 pl-3" style={{ color: 'var(--ink-base)' }}>
                                {tip.explanation}
                              </p>
                              <p className="mt-2 text-xs pl-3" style={{ color: 'var(--ink-muted)' }}>
                                {tip.evidence}
                              </p>
                              {timeLabel && (
                                <p className="mt-1 text-xs font-medium pl-3" style={{ color: 'var(--accent)' }}>
                                  {timeLabel}
                                </p>
                              )}
                            </div>
                          )
                        })}
                        {allTips.length > 2 && !showAllTips && (
                          <button
                            type="button"
                            onClick={() => setShowAllTips(true)}
                            className="text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
                            style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
                          >
                            Show all {allTips.length} areas
                          </button>
                        )}
                        {showAllTips && allTips.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setShowAllTips(false)}
                            className="text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
                            style={{ color: 'var(--ink-soft)', background: 'rgba(0,0,0,0.04)' }}
                          >
                            Show top 2 only
                          </button>
                        )}
                      </>
                    )
                  })()}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── Metrics tab ───────────────────────────────── */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-2">
              {dashboard.categories.map((category) => (
                <article key={category.id} className="surface-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="section-label">{category.title}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                        These checks roll up the strongest movement patterns from the run.
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
              ))}
            </section>

            {!!dashboard.turnHighlights.length && (
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

        {/* CTA bar */}
        <section className="surface-card-strong p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-strong)' }}>
              Ready to analyze your own run?
            </p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Upload a video and get the same detailed breakdown in minutes.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="cta-secondary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}>
              View Pricing
            </Link>
            <Link href="/login" className="cta-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}>
              Sign Up Free
            </Link>
          </div>
        </section>

        {/* Footer */}
        <SiteFooter />
      </div>
    </>
  )
}
