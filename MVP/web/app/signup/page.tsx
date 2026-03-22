'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ text: string; kind: 'error' | 'info' } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      setMessage({ text: 'Check your email for a confirmation link.', kind: 'info' })
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'An error occurred',
        kind: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="route-bg route-bg--login" />
      <div className="mx-auto max-w-lg space-y-6">
        {/* Header */}
        <section className="surface-card-strong p-8 lg:p-10">
          <span className="eyebrow">New athlete</span>
          <h1 className="mt-5 section-title">Start your first analysis.</h1>
          <p className="section-copy mt-3">
            Create an account to upload runs, track your progress, and get personalised coaching feedback.
          </p>

          {/* What you get */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>AI</p>
              <p className="metric-label">Personalised coaching for every run</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>9</p>
              <p className="metric-label">Practice drills with video guides</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>17+</p>
              <p className="metric-label">Biomechanical markers tracked</p>
            </div>
          </div>
        </section>

        {/* Signup form */}
        <section className="surface-card-strong p-6 lg:p-8">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--ink-strong)' }}>
            Create your account
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-input"
              />
            </div>

            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-input"
              />
            </div>

            {message && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: message.kind === 'error' ? 'var(--danger-dim)' : 'var(--success-dim)',
                  color: message.kind === 'error' ? 'var(--danger)' : 'var(--success)',
                  border: `1px solid ${message.kind === 'error' ? 'rgba(209,67,67,0.2)' : 'rgba(46,139,87,0.2)'}`,
                }}
              >
                {message.text}
              </div>
            )}

            <button type="submit" disabled={loading} className="cta-primary w-full">
              {loading ? 'Creating account…' : 'Get Started'}
            </button>
          </form>

          <p className="mt-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
