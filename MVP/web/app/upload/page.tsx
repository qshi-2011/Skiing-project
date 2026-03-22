'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'idle' | 'creating' | 'uploading' | 'finalizing' | 'done' | 'error'
type UploadedPart = { ETag: string; PartNumber: number }
type CreateJobResponse = {
  jobId: string
  path: string
  uploadId: string
  contentType: string
  partSizeBytes: number
  totalParts: number
  maxConcurrency: number
}
type MultipartActionResponse = { uploadUrl?: string; ok?: boolean; error?: string }
const PART_UPLOAD_RETRIES = 3
const PART_RETRY_DELAY_MS = 1200

const PROGRESS: Record<Step, number> = {
  idle: 0,
  creating: 15,
  uploading: 60,
  finalizing: 90,
  done: 100,
  error: 0,
}

const LABEL: Record<Step, string> = {
  idle: '',
  creating: 'Creating job…',
  uploading: 'Uploading video…',
  finalizing: 'Queuing analysis…',
  done: 'Queued! Opening run…',
  error: '',
}

const CAMERA_OPTIONS = [
  { value: '', label: 'Select perspective…' },
  { value: 'side', label: 'Side view' },
  { value: 'behind', label: 'Behind / follow cam' },
  { value: 'front', label: 'Front facing' },
  { value: 'above', label: 'Overhead / drone' },
  { value: 'other', label: 'Other' },
]

const SESSION_OPTIONS = [
  { value: '', label: 'Select session type…' },
  { value: 'free_skiing', label: 'Free skiing' },
  { value: 'slalom', label: 'Slalom' },
  { value: 'giant_slalom', label: 'Giant slalom' },
  { value: 'super_g', label: 'Super-G' },
  { value: 'training_drill', label: 'Training drill' },
  { value: 'other', label: 'Other' },
]

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [cameraPerspective, setCameraPerspective] = useState('')
  const [sessionType, setSessionType] = useState('')
  const [uploadProgressPct, setUploadProgressPct] = useState(0)

  async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function postMultipartAction(body: Record<string, unknown>): Promise<MultipartActionResponse> {
    const response = await fetch('/api/jobs/upload-multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof json?.error === 'string' ? json.error : 'Multipart upload request failed'
      throw new Error(message)
    }

    return json as MultipartActionResponse
  }

  async function uploadPart(
    path: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
  ) {
    const { uploadUrl } = await postMultipartAction({
      action: 'sign-part',
      path,
      uploadId,
      partNumber,
    })

    if (!uploadUrl) {
      throw new Error('Missing signed upload URL for multipart part')
    }

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: chunk,
    })

    if (!res.ok) {
      throw new Error(`Part ${partNumber} upload failed with status ${res.status}`)
    }

    const eTag = res.headers.get('etag')
    if (!eTag) {
      throw new Error(`Part ${partNumber} upload succeeded but no ETag was returned`)
    }

    return eTag
  }

  async function uploadPartWithRetry(
    path: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
  ) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= PART_UPLOAD_RETRIES; attempt += 1) {
      try {
        return await uploadPart(path, uploadId, partNumber, chunk)
      } catch (error) {
        lastError = error
        if (attempt < PART_UPLOAD_RETRIES) {
          await wait(PART_RETRY_DELAY_MS * attempt)
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Part ${partNumber} upload failed after ${PART_UPLOAD_RETRIES} attempts`)
  }

  async function uploadMultipartFile(file: File, upload: CreateJobResponse) {
    const { path, uploadId, partSizeBytes } = upload
    const totalParts = Math.max(1, Math.ceil(file.size / partSizeBytes))
    const maxConcurrency = Math.max(1, Math.min(upload.maxConcurrency || 3, totalParts))
    const parts: UploadedPart[] = []
    let nextPartNumber = 1
    let uploadedBytes = 0

    const markChunkComplete = (chunkSize: number) => {
      uploadedBytes += chunkSize
      setUploadProgressPct(Math.min(100, Math.round((uploadedBytes / file.size) * 100)))
    }

    const runWorker = async () => {
      while (true) {
        const currentPartNumber = nextPartNumber
        nextPartNumber += 1
        if (currentPartNumber > totalParts) {
          return
        }

        const start = (currentPartNumber - 1) * partSizeBytes
        const end = Math.min(file.size, start + partSizeBytes)
        const chunk = file.slice(start, end)
        const eTag = await uploadPartWithRetry(path, uploadId, currentPartNumber, chunk)
        parts.push({ ETag: eTag, PartNumber: currentPartNumber })
        markChunkComplete(chunk.size)
      }
    }

    try {
      await Promise.all(Array.from({ length: maxConcurrency }, () => runWorker()))
      parts.sort((a, b) => a.PartNumber - b.PartNumber)
      await postMultipartAction({
        action: 'complete',
        path,
        uploadId,
        parts,
      })
      setUploadProgressPct(100)
    } catch (error) {
      await postMultipartAction({
        action: 'abort',
        path,
        uploadId,
      }).catch(() => {})
      throw error
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setError(null)
    setUploadProgressPct(0)

    try {
      setStep('creating')
      const contentType = file.type || 'application/octet-stream'
      const createRes = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          fileSize: file.size,
          cameraPerspective: cameraPerspective || undefined,
          sessionType: sessionType || undefined,
        }),
      })
      if (!createRes.ok) {
        const { error: msg } = await createRes.json()
        throw new Error(msg ?? 'Failed to create job')
      }
      const upload = await createRes.json() as CreateJobResponse

      setStep('uploading')
      await uploadMultipartFile(file, upload)

      setStep('finalizing')
      const markRes = await fetch('/api/jobs/mark-uploaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: upload.jobId }),
      })
      if (!markRes.ok) {
        const { error: msg } = await markRes.json()
        throw new Error(msg ?? 'Failed to queue job')
      }

      setStep('done')
      setTimeout(() => router.push(`/jobs/${upload.jobId}`), 800)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('error')
    }
  }

  function handleFilePick(f: File | null) {
    if (!f) return
    setFile(f)
    setStep('idle')
    setError(null)
    setUploadProgressPct(0)
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'error'
  const flow = [
    'Upload a clean clip from one continuous run.',
    'We queue overlay render, peak moments, and summary artifacts.',
    'Open the run recap to review feedback and next priorities.',
  ]

  const progressWidth = step === 'uploading'
    ? Math.max(PROGRESS.creating, Math.min(85, 15 + uploadProgressPct * 0.7))
    : PROGRESS[step]
  const progressLabel = step === 'uploading'
    ? `${LABEL.uploading} ${uploadProgressPct}%`
    : LABEL[step]

  return (
    <>
      <div className="route-bg route-bg--upload" />
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Info panel */}
        <section className="surface-card p-8 lg:p-10">
          <span className="eyebrow">Upload analysis</span>
          <h1 className="section-title mt-6">Turn a raw clip into a sharper practice session.</h1>
          <p className="section-copy mt-4 max-w-xl">
            One upload creates a job, queues the worker, and opens a run-detail page with overlay video, key moments, and recap-ready artifacts.
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/alpine/hero-powder.jpg"
            alt="Fresh powder tracks"
            className="hero-photo mt-6"
            style={{ height: '200px' }}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="metric-tile">
              <p className="metric-value">1</p>
              <p className="metric-label">Continuous clip for the cleanest recap.</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value">R2</p>
              <p className="metric-label">Direct cloud upload for longer training clips.</p>
            </div>
            <div className="metric-tile">
              <p className="metric-value">3</p>
              <p className="metric-label">Outputs to review: overlay, moments, and summary.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {flow.map((stepLabel, index) => (
              <div
                key={stepLabel}
                className="surface-card-muted px-4 py-4 flex items-start gap-4"
              >
                <span className="step-number">
                  0{index + 1}
                </span>
                <p className="text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                  {stepLabel}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Intake panel */}
        <section className="surface-card-strong p-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>Run intake</p>
              <h2 className="mt-1" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-strong)' }}>
                Drop your next video
              </h2>
            </div>
            <span className="status-pill" style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}>
              Worker queue
            </span>
          </div>

          <form onSubmit={handleUpload} className="mt-6 space-y-5">
            <div
              onClick={() => !busy && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                handleFilePick(e.dataTransfer.files?.[0] ?? null)
              }}
              className="relative rounded-[var(--radius-xl)] p-10 text-center cursor-pointer select-none"
              style={{
                border: dragOver
                  ? '2px solid var(--accent)'
                  : file
                    ? '2px dashed rgba(0,132,212,0.3)'
                    : '2px dashed rgba(0,0,0,0.12)',
                background: dragOver
                  ? 'rgba(0,132,212,0.06)'
                  : file
                    ? 'rgba(0,132,212,0.04)'
                    : 'rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease',
              }}
            >
              {file ? (
                <div className="space-y-2">
                  <div className="flex justify-center mb-2">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--accent-dim)' }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                      </svg>
                    </div>
                  </div>
                  <p className="text-base font-semibold px-4 break-all" style={{ color: 'var(--ink-strong)' }}>{file.name}</p>
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB selected
                  </p>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null); setStep('idle'); if (fileRef.current) fileRef.current.value = '' }}
                    className="cta-secondary mt-2"
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div
                      className={`w-16 h-16 rounded-[var(--radius-lg)] flex items-center justify-center ${dragOver ? 'drop-zone-icon-pulse' : ''}`}
                      style={{
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <svg
                        width="28" height="28" viewBox="0 0 24 24" fill="none"
                        stroke={dragOver ? 'var(--accent)' : 'var(--ink-muted)'}
                        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                        style={{ opacity: dragOver ? 1 : 0.5, transition: 'opacity 0.2s ease' }}
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                      </svg>
                    </div>
                  </div>
                  <div>
                    <p className="text-base font-bold" style={{ color: 'var(--ink-strong)' }}>Drop your video here</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
                      MP4, MOV, or AVI - best with one skier and one continuous run
                    </p>
                  </div>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => handleFilePick(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Camera perspective & session type */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Camera perspective</label>
                <select
                  value={cameraPerspective}
                  onChange={e => setCameraPerspective(e.target.value)}
                  className="select-input"
                  disabled={busy}
                >
                  {CAMERA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Session type</label>
                <select
                  value={sessionType}
                  onChange={e => setSessionType(e.target.value)}
                  className="select-input"
                  disabled={busy}
                >
                  {SESSION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {(busy || step === 'done') && (
              <div className="space-y-2">
                <div className="progress-track">
                  <div className="progress-fill transition-all duration-500" style={{ width: `${progressWidth}%` }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{progressLabel}</p>
              </div>
            )}

            {error && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(209,67,67,0.2)' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || busy || step === 'done'}
              className="cta-primary w-full"
            >
              {busy ? LABEL[step] : 'Start analysis'}
            </button>
          </form>
        </section>
      </div>
    </>
  )
}
