import type { Job, JobStatus } from '@/lib/types'

const SESSION_LABELS: Record<string, string> = {
  free_skiing: 'Free skiing',
  slalom: 'Slalom',
  giant_slalom: 'Giant slalom',
  super_g: 'Super-G',
  training_drill: 'Training drill',
  other: 'Other',
}

const STALE_CREATED_MS = 15 * 60 * 1000
const STALE_ACTIVE_MS = 10 * 60 * 1000

export type JobSurfaceState =
  | 'created'
  | 'uploaded'
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'upload_incomplete'
  | 'needs_attention'

export interface JobStatusPresentation {
  state: JobSurfaceState
  label: string
  dot: string
  pill: string
  helper: string
  retryable: boolean
}

function readString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function stemFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getJobOriginalFilename(job: Job) {
  return (
    readString(job.config?.original_filename) ||
    readString(job.video_object_path?.split('/').pop()) ||
    job.id.slice(0, 8)
  )
}

export function displayNameFromFilename(filename: string) {
  return stemFromFilename(filename.trim()) || filename.trim() || 'Untitled run'
}

export function getJobDisplayName(job: Job) {
  return (
    readString(job.config?.display_name) ||
    displayNameFromFilename(getJobOriginalFilename(job)) ||
    job.id.slice(0, 8)
  )
}

export function getJobUserNote(job: Job) {
  return readString(job.config?.user_note)
}

export function getJobSearchText(job: Job) {
  return [
    getJobDisplayName(job),
    getJobOriginalFilename(job),
    getJobUserNote(job),
    getJobSessionType(job),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
}

export function getJobSessionType(job: Job) {
  const value = readString(job.config?.session_type)
  if (!value) return null
  return SESSION_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function getJobRecencyDate(job: Job) {
  return parseDate(job.updated_at)
    ?? parseDate(job.config?.heartbeat_at)
    ?? parseDate(job.created_at)
}

export function getJobStatusPresentation(job: Job, now = new Date()): JobStatusPresentation {
  const updatedAt = getJobRecencyDate(job)
  const createdAt = parseDate(job.created_at)
  const ageMs = updatedAt ? now.getTime() - updatedAt.getTime() : 0
  const createdAgeMs = createdAt ? now.getTime() - createdAt.getTime() : 0

  if (job.status === 'created' && createdAgeMs >= STALE_CREATED_MS) {
    return {
      state: 'upload_incomplete',
      label: 'Upload incomplete',
      dot: 'var(--gold)',
      pill: 'var(--gold-dim)',
      helper: 'This draft never finished uploading. Start a fresh upload or resume analysis if the video already exists.',
      retryable: true,
    }
  }

  if ((job.status === 'uploaded' || job.status === 'queued' || job.status === 'running') && ageMs >= STALE_ACTIVE_MS) {
    return {
      state: 'needs_attention',
      label: 'Needs attention',
      dot: 'var(--gold)',
      pill: 'var(--gold-dim)',
      helper: 'This analysis looks stalled. Retry it to get the run moving again.',
      retryable: true,
    }
  }

  const defaults: Record<JobStatus, JobStatusPresentation> = {
    created: {
      state: 'created',
      label: 'Created',
      dot: 'var(--ink-muted)',
      pill: 'rgba(0,0,0,0.04)',
      helper: 'Your upload draft is ready to receive a video.',
      retryable: false,
    },
    uploaded: {
      state: 'uploaded',
      label: 'Uploaded',
      dot: 'var(--accent)',
      pill: 'var(--accent-dim)',
      helper: 'Your video is ready. Analysis will begin shortly.',
      retryable: false,
    },
    queued: {
      state: 'queued',
      label: 'Queued',
      dot: 'var(--gold)',
      pill: 'var(--gold-dim)',
      helper: 'Your run is waiting for analysis to start.',
      retryable: false,
    },
    running: {
      state: 'running',
      label: 'Analysing',
      dot: 'var(--accent)',
      pill: 'var(--accent-dim)',
      helper: 'We are reviewing your technique and preparing your recap.',
      retryable: false,
    },
    done: {
      state: 'done',
      label: 'Done',
      dot: 'var(--success)',
      pill: 'var(--success-dim)',
      helper: 'Your run recap is ready to review.',
      retryable: false,
    },
    error: {
      state: 'error',
      label: 'Error',
      dot: 'var(--danger)',
      pill: 'var(--danger-dim)',
      helper: 'This run did not complete. Retry analysis if the upload finished cleanly.',
      retryable: true,
    },
  }

  return defaults[job.status]
}

export function updateJobConfig(job: Job, patch: Record<string, unknown>) {
  const nextConfig = { ...(job.config ?? {}) }

  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === '') {
      delete nextConfig[key]
    } else {
      nextConfig[key] = value
    }
  }

  return nextConfig
}
