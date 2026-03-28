'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function RunMetadataEditor({
  jobId,
  initialDisplayName,
  initialUserNote,
  defaultEditing = false,
}: {
  jobId: string
  initialDisplayName: string
  initialUserNote: string | null
  defaultEditing?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(defaultEditing)
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [userNote, setUserNote] = useState(initialUserNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!editing) {
    return (
      <button
        type="button"
        className="cta-secondary"
        onClick={() => {
          setSaved(false)
          setError(null)
          setEditing(true)
        }}
        style={{ padding: '0.6rem 0.95rem', fontSize: '0.82rem' }}
      >
        Edit run details
      </button>
    )
  }

  return (
    <div className="surface-card-muted p-4 space-y-3">
      <div>
        <label className="field-label">Run title</label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="text-input"
          maxLength={80}
          placeholder="Name this run"
        />
      </div>
      <div>
        <label className="field-label">Note</label>
        <textarea
          value={userNote}
          onChange={(event) => setUserNote(event.target.value)}
          maxLength={240}
          placeholder="Conditions, intent, or what to compare next time"
          className="text-input"
          rows={3}
          style={{ resize: 'vertical', minHeight: '5.5rem' }}
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          className="cta-primary"
          disabled={isPending}
          onClick={() => {
            setError(null)
            setSaved(false)
            startTransition(async () => {
              const response = await fetch(`/api/jobs/${jobId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  displayName,
                  userNote,
                }),
              })

              if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                setError(typeof payload?.error === 'string' ? payload.error : 'We could not save those changes.')
                return
              }

              setSaved(true)
              setEditing(false)
              router.refresh()
            })
          }}
          style={{ padding: '0.65rem 1rem', fontSize: '0.82rem' }}
        >
          {isPending ? 'Saving…' : 'Save details'}
        </button>
        <button
          type="button"
          className="cta-secondary"
          disabled={isPending}
          onClick={() => {
            setDisplayName(initialDisplayName)
            setUserNote(initialUserNote ?? '')
            setSaved(false)
            setError(null)
            setEditing(false)
          }}
          style={{ padding: '0.65rem 1rem', fontSize: '0.82rem' }}
        >
          Cancel
        </button>
        {saved && (
          <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
            Saved
          </span>
        )}
      </div>
      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
