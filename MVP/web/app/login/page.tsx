'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/components/language-provider'

export default function LoginPage() {
  const { dict } = useLanguage()
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
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      window.location.href = '/'
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : dict.auth.genericError,
        kind: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="route-bg route-bg--login" />
      <div className="mx-auto max-w-md space-y-6">
        {/* Auth panel */}
        <section className="surface-card-strong p-6 lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>
                {dict.auth.loginEyebrow}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--ink-strong)' }}>
                {dict.auth.loginTitle}
              </h1>
            </div>
            <span className="status-pill" style={{ color: 'var(--amber)', background: 'var(--amber-dim)' }}>
              {dict.auth.loginBadge}
            </span>
          </div>

          <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {dict.auth.loginBody}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="field-label">{dict.auth.email}</label>
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
              <label className="field-label">{dict.auth.password}</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                autoComplete="current-password"
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
              {loading ? dict.auth.signingIn : dict.auth.signIn}
            </button>
          </form>

          <p className="mt-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {dict.auth.noAccount}{' '}
            <Link href="/signup" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              {dict.auth.getStarted}
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
