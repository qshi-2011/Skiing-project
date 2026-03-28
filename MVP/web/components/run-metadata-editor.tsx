'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'

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
  const { dict } = useLanguage()
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
        {dict.editor.edit}
      </button>
    )
  }

  return (
    <div className="surface-card-muted p-4 space-y-3">
      <div>
        <label className="field-label">{dict.editor.title}</label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="text-input"
          maxLength={80}
          placeholder={dict.editor.titlePlaceholder}
        />
      </div>
      <div>
        <label className="field-label">{dict.editor.note}</label>
        <textarea
          value={userNote}
          onChange={(event) => setUserNote(event.target.value)}
          maxLength={240}
          placeholder={dict.editor.notePlaceholder}
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
                setError(typeof payload?.error === 'string' ? payload.error : dict.editor.saveError)
                return
              }

              setSaved(true)
              setEditing(false)
              router.refresh()
            })
          }}
          style={{ padding: '0.65rem 1rem', fontSize: '0.82rem' }}
        >
          {isPending ? dict.editor.saving : dict.editor.save}
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
          {dict.editor.cancel}
        </button>
        {saved && (
          <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
            {dict.editor.saved}
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
