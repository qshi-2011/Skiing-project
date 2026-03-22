import Link from 'next/link'

export const metadata = {
  title: 'Sample Analysis — SkiCoach AI',
  description: 'See what a real technique analysis looks like before uploading your own run.',
}

export default function SampleAnalysisPage() {
  return (
    <>
      <div className="route-bg route-bg--detail" />
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <Link href="/" className="hover:underline">Home</Link>
          <span>/</span>
          <span style={{ color: 'var(--ink-strong)' }}>Sample Analysis</span>
        </div>

        {/* ── Hero: video + score column ──────────────── */}
        <section className="surface-card p-6 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.16fr_0.84fr]">
            {/* Left: video area */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="eyebrow">Live Analysis</span>
                <span className="eyebrow eyebrow--warm" style={{ fontSize: '0.62rem', padding: '0.3rem 0.6rem' }}>
                  Sample Run
                </span>
              </div>

              {/* Video placeholder */}
              <div
                className="sample-placeholder"
                style={{ aspectRatio: '16 / 9' }}
              >
                <div className="sample-placeholder-label">
                  <p>Sample overlay video</p>
                  <p>A real analysis overlay will be placed here</p>
                </div>
              </div>

              {/* Key moment timeline placeholders */}
              <div className="grid gap-3 grid-cols-3">
                <div className="surface-card-muted p-3 text-center">
                  <div className="sample-placeholder" style={{ width: '100%', height: '3rem', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--ink-muted)' }}>Moment</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--ink-strong)' }}>Initial Engagement</p>
                </div>
                <div className="surface-card-muted p-3 text-center">
                  <div className="sample-placeholder" style={{ width: '100%', height: '3rem', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--ink-muted)' }}>Moment</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--ink-strong)' }}>Transition Phase</p>
                </div>
                <div className="surface-card-muted p-3 text-center">
                  <div className="sample-placeholder" style={{ width: '100%', height: '3rem', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--ink-muted)' }}>Moment</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--ink-strong)' }}>Weight Transfer</p>
                </div>
              </div>
            </div>

            {/* Right: score + coaching insights + technique markers */}
            <aside className="space-y-4">
              {/* Performance score */}
              <div className="surface-card-strong p-5">
                <p className="section-label" style={{ color: 'var(--amber)' }}>Performance Score</p>
                <div className="mt-3 flex items-center gap-4">
                  {/* Score placeholder */}
                  <div className="score-ring" style={{ width: '7rem', height: '7rem' }}>
                    <div className="score-ring-glow" />
                    <svg width="112" height="112" viewBox="0 0 112 112">
                      <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                      <circle
                        cx="56" cy="56" r="46"
                        fill="none"
                        stroke="url(#scoreGradSample)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="289.03"
                        strokeDashoffset="60"
                      />
                      <defs>
                        <linearGradient id="scoreGradSample" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#0084d4" />
                          <stop offset="100%" stopColor="#c79a44" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="score-ring-label">
                      <span className="sample-placeholder" style={{ width: '2.5rem', height: '1.8rem', borderRadius: 'var(--radius-sm)', border: 'none', background: 'rgba(0,0,0,0.04)' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--ink-muted)' }}>Score</span>
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="sample-placeholder" style={{ width: '5rem', height: '1rem', borderRadius: '0.25rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Percentile</span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      Score and ranking from real analysis
                    </p>
                  </div>
                </div>
              </div>

              {/* Coaching insights */}
              <div className="surface-card-muted p-5">
                <p className="section-label" style={{ color: 'var(--amber)' }}>Coaching Insights</p>
                <div className="mt-4 space-y-3">
                  <div className="coaching-card coaching-accent-edging">
                    <div className="pl-3">
                      <div className="flex items-center gap-2">
                        <span className="preflight-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.62rem' }}>01</span>
                        <div className="sample-placeholder" style={{ width: '10rem', height: '0.9rem', borderRadius: '0.25rem' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Tip title</span>
                        </div>
                      </div>
                      <div className="sample-placeholder mt-2" style={{ width: '100%', height: '2rem', borderRadius: '0.25rem' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Coaching explanation</span>
                      </div>
                    </div>
                  </div>
                  <div className="coaching-card coaching-accent-movement">
                    <div className="pl-3">
                      <div className="flex items-center gap-2">
                        <span className="preflight-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.62rem' }}>02</span>
                        <div className="sample-placeholder" style={{ width: '10rem', height: '0.9rem', borderRadius: '0.25rem' }}>
                          <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Tip title</span>
                        </div>
                      </div>
                      <div className="sample-placeholder mt-2" style={{ width: '100%', height: '2rem', borderRadius: '0.25rem' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Coaching explanation</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technique markers */}
              <div className="surface-card-muted p-5">
                <p className="section-label">Technique Markers</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--ink-strong)' }}>Edge Angle</span>
                      <span className="sample-placeholder" style={{ width: '4rem', height: '0.9rem', borderRadius: '0.25rem' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Value</span>
                      </span>
                    </div>
                    <div className="mt-2 metric-rail">
                      <span style={{ width: '65%' }}>
                        <span className="metric-rail-dot" />
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--ink-strong)' }}>Turn Rhythm</span>
                      <span className="sample-placeholder" style={{ width: '4rem', height: '0.9rem', borderRadius: '0.25rem' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Value</span>
                      </span>
                    </div>
                    <div className="mt-2 metric-rail">
                      <span style={{ width: '80%' }}>
                        <span className="metric-rail-dot" />
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--ink-strong)' }}>Balance</span>
                      <span className="sample-placeholder" style={{ width: '4rem', height: '0.9rem', borderRadius: '0.25rem' }}>
                        <span style={{ fontSize: '0.55rem', color: 'var(--ink-muted)' }}>Value</span>
                      </span>
                    </div>
                    <div className="mt-2 metric-rail">
                      <span style={{ width: '55%' }}>
                        <span className="metric-rail-dot" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* CTA bar */}
        <section className="surface-card-strong p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-strong)' }}>
              Ready to analyze your own run?
            </p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Join athletes using precision motion tracking.
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
