'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { groupBySeason } from '@/lib/seasons'
import { scoreLabel } from '@/lib/analysis-summary'
import type { JobStatus } from '@/lib/types'

export interface ArchiveRunItem {
  id: string
  created_at: string
  status: JobStatus
  statusLabel: string
  statusDot: string
  statusPill: string
  title: string
  subtitle: string
  score: number | null
  previewUrl: string | null
  sessionType: string | null
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

function fallbackIcon(statusDot: string) {
  return (
    <div
      className="w-16 h-16 rounded-[var(--radius-lg)] flex items-center justify-center shrink-0"
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}
    >
      <div className="w-3 h-3 rounded-full" style={{ background: statusDot }} />
    </div>
  )
}

export function ArchiveRunsClient({ runs }: { runs: ArchiveRunItem[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'best'>('newest')

  const sessionOptions = useMemo(() => {
    const values = Array.from(new Set(runs.map((run) => run.sessionType).filter((value): value is string => Boolean(value))))
    return values.sort((left, right) => left.localeCompare(right))
  }, [runs])

  const filteredRuns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const nextRuns = runs.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      if (sessionFilter !== 'all' && run.sessionType !== sessionFilter) return false
      if (!normalizedSearch) return true
      return `${run.title} ${run.subtitle}`.toLowerCase().includes(normalizedSearch)
    })

    nextRuns.sort((left, right) => {
      if (sortBy === 'best') {
        const leftScore = left.score ?? -1
        const rightScore = right.score ?? -1
        if (rightScore !== leftScore) return rightScore - leftScore
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    })

    return nextRuns
  }, [runs, search, sessionFilter, sortBy, statusFilter])

  const groups = groupBySeason(filteredRuns)

  return (
    <div className="space-y-6">
      <section className="surface-card p-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.8fr]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by filename"
            className="select-input"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | JobStatus)} className="select-input">
            <option value="all">All statuses</option>
            <option value="done">Completed</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="uploaded">Uploaded</option>
            <option value="created">Created</option>
            <option value="error">Error</option>
          </select>
          <select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)} className="select-input">
            <option value="all">All session types</option>
            {sessionOptions.map((sessionType) => (
              <option key={sessionType} value={sessionType}>{sessionType}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'newest' | 'best')} className="select-input">
            <option value="newest">Newest first</option>
            <option value="best">Best score</option>
          </select>
        </div>
      </section>

      {!filteredRuns.length ? (
        <section className="surface-card p-6">
          <div className="surface-card-muted p-10 text-center">
            <p className="text-base font-bold" style={{ color: 'var(--ink-strong)' }}>No runs match these filters</p>
            <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>
              Try a broader search or clear one of the filters above.
            </p>
          </div>
        </section>
      ) : (
        groups.map((group) => {
          const groupRuns = group.runs as ArchiveRunItem[]
          const groupScored = groupRuns.filter((run): run is ArchiveRunItem & { score: number } => run.score != null)
          const groupAvg = groupScored.length
            ? Math.round(groupScored.reduce((sum, run) => sum + run.score, 0) / groupScored.length)
            : null
          const groupBest = groupScored.length ? Math.max(...groupScored.map((run) => run.score)) : null

          return (
            <section key={group.label} className="surface-card p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
                      {groupRuns.length} {groupRuns.length === 1 ? 'run' : 'runs'}
                    </p>
                    <h2 className="mt-1" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                      {group.label}
                    </h2>
                  </div>
                  {groupAvg != null && (
                    <span className={levelBadgeClass(scoreLabel(groupAvg))} style={{ marginLeft: '0.5rem' }}>
                      {scoreLabel(groupAvg)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {groupAvg != null && (
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                      Avg <span className="font-bold" style={{ color: 'var(--accent)' }}>{groupAvg}</span>
                    </span>
                  )}
                  {groupBest != null && (
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                      Best <span className="font-bold" style={{ color: 'var(--success)' }}>{groupBest}</span>
                    </span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 mt-5">
                {groupRuns.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/jobs/${run.id}`}
                      className="surface-card-muted flex items-center gap-4 px-4 py-4 group hover:-translate-y-0.5"
                      style={{ display: 'flex', transition: 'transform 150ms ease, background 0.15s ease, border-color 0.15s ease' }}
                    >
                      {run.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={run.previewUrl}
                          alt={run.title}
                          className="w-16 h-16 rounded-[var(--radius-lg)] object-cover shrink-0"
                        />
                      ) : fallbackIcon(run.statusDot)}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink-strong)' }}>{run.title}</p>
                          {run.sessionType && (
                            <span
                              className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink-soft)' }}
                            >
                              {run.sessionType}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                          {run.subtitle}
                        </p>
                      </div>

                      {run.score != null && (
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold" style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                            {run.score}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                            {scoreLabel(run.score)}
                          </p>
                        </div>
                      )}

                      <span
                        className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: run.statusPill, color: run.statusDot }}
                      >
                        {run.statusLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
