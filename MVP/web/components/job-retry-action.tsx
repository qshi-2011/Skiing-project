'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function JobRetryAction({
  jobId,
  canRetry,
  actionLabel,
  uploadHref = '/upload',
  compact = false,
}: {
  jobId: string
  canRetry: boolean
  actionLabel: string | null
  uploadHref?: string
  compact?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!actionLabel) return null

  if (!canRetry) {
    return (
      <Link
        href={uploadHref}
        className={compact ? 'cta-secondary' : 'cta-secondary'}
        style={compact ? { padding: '0.5rem 0.85rem', fontSize: '0.78rem' } : { padding: '0.65rem 1rem', fontSize: '0.82rem' }}
      >
        {actionLabel}
      </Link>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="cta-secondary"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const response = await fetch(`/api/jobs/${jobId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'retry' }),
            })

            if (!response.ok) {
              const payload = await response.json().catch(() => ({}))
              setError(typeof payload?.error === 'string' ? payload.error : 'We could not retry this run.')
              return
            }

            router.refresh()
          })
        }}
        style={compact ? { padding: '0.5rem 0.85rem', fontSize: '0.78rem' } : { padding: '0.65rem 1rem', fontSize: '0.82rem' }}
      >
        {isPending ? 'Retrying…' : actionLabel}
      </button>
      {error && (
        <p className="text-xs max-w-[15rem] text-right" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
