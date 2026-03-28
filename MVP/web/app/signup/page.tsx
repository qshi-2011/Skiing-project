'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/components/language-provider'

export default function SignupPage() {
  const { dict } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ text: string; kind: 'error' | 'info' } | null>(null)
  const [loadingMode, setLoadingMode] = useState<'signup' | 'guest' | null>(null)
  const [isAnonymousSession, setIsAnonymousSession] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (active) {
        setIsAnonymousSession(user?.is_anonymous === true)
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setLoadingMode('signup')
    try {
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      if (currentUser?.is_anonymous) {
        // Link anonymous session to a permanent account — preserves any
        // jobs uploaded during the guest session.
        const { error } = await supabase.auth.updateUser({ email, password })
        if (error) throw error
        setMessage({ text: dict.auth.checkEmail, kind: 'info' })
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage({ text: dict.auth.checkEmail, kind: 'info' })
      }
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : dict.auth.genericError,
        kind: 'error',
      })
    } finally {
      setLoadingMode(null)
    }
  }

  return (
    <>
      <div className="route-bg route-bg--login" />
      <div className="mx-auto max-w-lg space-y-6">
        {/* Header */}
        <section className="surface-card-strong p-8 lg:p-10">
          <span className="eyebrow">{dict.auth.signupEyebrow}</span>
          <h1 className="mt-5 section-title">{dict.auth.signupTitle}</h1>
          <p className="section-copy mt-3">
            {dict.auth.signupBody}
          </p>

          {/* What you get */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>AI</p>
              <p className="metric-label">{dict.auth.personalisedCoaching}</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>9</p>
              <p className="metric-label">{dict.auth.practiceDrills}</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value" style={{ fontSize: '1.4rem' }}>17+</p>
              <p className="metric-label">{dict.auth.markersTracked}</p>
            </div>
          </div>
        </section>

        {/* Signup form */}
        <section className="surface-card-strong p-6 lg:p-8">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--ink-strong)' }}>
            {dict.auth.createAccount}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
                placeholder={dict.auth.passwordHint}
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

            <button type="submit" disabled={loadingMode !== null} className="cta-primary w-full">
              {loadingMode === 'signup' ? dict.auth.creating : dict.nav.getStarted}
            </button>
          </form>

          {!isAnonymousSession && (
            <>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>
                  {dict.auth.guestDivider}
                </span>
                <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
              </div>

              <button
                type="button"
                disabled={loadingMode !== null}
                onClick={async () => {
                  setMessage(null)
                  setLoadingMode('guest')
                  try {
                    const supabase = createClient()
                    const { error } = await supabase.auth.signInAnonymously()
                    if (error) throw error
                    window.location.href = '/upload'
                  } catch (err: unknown) {
                    setMessage({
                      text: err instanceof Error ? err.message : dict.auth.genericError,
                      kind: 'error',
                    })
                  } finally {
                    setLoadingMode(null)
                  }
                }}
                className="mt-3 w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-strong)' }}
              >
                {loadingMode === 'guest' ? dict.auth.guestLoading : dict.auth.guestButton}
              </button>
            </>
          )}

          <p className="mt-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {dict.auth.alreadyHave}{' '}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              {dict.auth.signInLink}
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
