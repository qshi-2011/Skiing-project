'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'

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

export default function UploadPage() {
  const router = useRouter()
  const { lang, dict } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [cameraPerspective, setCameraPerspective] = useState('')
  const [sessionType, setSessionType] = useState('')
  const [uploadProgressPct, setUploadProgressPct] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [showQualityInfo, setShowQualityInfo] = useState(false)

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
      throw new Error('Upload setup did not finish correctly. Please try again.')
    }

    let res: Response
    try {
      res = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk,
      })
    } catch (error) {
      void error
      throw new Error('We lost the connection while uploading your video. Please try again. If this keeps happening, contact support.')
    }

    if (!res.ok) {
      throw new Error('Part of the upload failed. Please try again.')
    }

    const eTag = res.headers.get('etag')
    if (!eTag) {
      throw new Error('The upload finished with missing confirmation data. Please try again.')
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
      : new Error('The upload did not finish after several attempts. Please try again.')
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
      setUploadedBytes(uploadedBytes)
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
    setUploadedBytes(0)

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
        throw new Error('We could not start this upload. Please try again.')
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
        throw new Error('Your video uploaded, but we could not start the recap. Please try again.')
      }

      setStep('done')
      setTimeout(() => router.push(`/jobs/${upload.jobId}?fromUpload=1`), 800)
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
    setUploadedBytes(0)
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'error'
  const labels: Record<Step, string> = {
    idle: '',
    creating: dict.upload.creating,
    uploading: dict.upload.uploading,
    finalizing: dict.upload.finalizing,
    done: dict.upload.done,
    error: '',
  }
  const cameraOptions = [
    { value: '', label: dict.upload.startPerspective },
    { value: 'side', label: dict.upload.sideView },
    { value: 'behind', label: dict.upload.behindView },
    { value: 'front', label: dict.upload.frontView },
    { value: 'above', label: dict.upload.overheadView },
    { value: 'other', label: dict.upload.other },
  ]
  const sessionOptions = [
    { value: '', label: dict.upload.selectSession },
    { value: 'free_skiing', label: dict.upload.freeSkiing },
    { value: 'slalom', label: dict.upload.slalom },
    { value: 'giant_slalom', label: dict.upload.giantSlalom },
    { value: 'super_g', label: dict.upload.superG },
    { value: 'training_drill', label: dict.upload.trainingDrill },
    { value: 'other', label: dict.upload.other },
  ]

  const progressWidth = step === 'uploading'
    ? Math.max(PROGRESS.creating, Math.min(85, 15 + uploadProgressPct * 0.7))
    : PROGRESS[step]
  const uploadSizeLabel = file
    ? `${(uploadedBytes / 1024 / 1024).toFixed(1)} / ${(file.size / 1024 / 1024).toFixed(1)} MB`
    : null
  const progressLabel = step === 'uploading'
    ? `${labels.uploading} ${uploadProgressPct}%${uploadSizeLabel ? ` · ${uploadSizeLabel}` : ''}`
    : labels[step]

  return (
    <>
      <div className="space-y-6">
        {/* ── Preflight checklist (top) ──────────────── */}
        <section className="surface-card-strong p-6 lg:p-8">
          <p className="section-label">{dict.upload.preflightTitle}</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {dict.upload.preflightBody}
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-base)' }}>
            {dict.upload.eta}
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="preflight-item">
              <span className="preflight-number">01</span>
              <div>
                <h4>{dict.upload.oneSkierTitle}</h4>
                <p>{dict.upload.oneSkierBody}</p>
              </div>
            </div>
            <div className="preflight-item">
              <span className="preflight-number">02</span>
              <div>
                <h4>{dict.upload.oneRunTitle}</h4>
                <p>{dict.upload.oneRunBody}</p>
              </div>
            </div>
            <div className="preflight-item">
              <span className="preflight-number">03</span>
              <div>
                <h4>{dict.upload.angleTitle}</h4>
                <p>{dict.upload.angleBody}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Upload form ────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Drop zone + form */}
          <section className="surface-card-strong p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="eyebrow">{dict.upload.uploadEyebrow}</span>
                <h1 className="mt-3" style={{ fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink-strong)' }}>
                  {dict.upload.uploadTitle}
                </h1>
              </div>
              <span className="status-pill" style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}>
                {dict.upload.uploadReady}
              </span>
            </div>

            <form onSubmit={handleUpload} className="mt-6 space-y-5">
              {(busy || step === 'done') && (
                <div className="space-y-2">
                  <div className="progress-track">
                    <div className="progress-fill transition-all duration-500" style={{ width: `${progressWidth}%` }} />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{progressLabel}</p>
                  {busy && (
                    <p className="text-sm" style={{ color: 'var(--ink-base)' }}>
                      {dict.upload.eta}
                    </p>
                  )}
                </div>
              )}

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
                      {(file.size / 1024 / 1024).toFixed(1)} {dict.upload.selectedSuffix}
                    </p>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setFile(null); setStep('idle'); if (fileRef.current) fileRef.current.value = '' }}
                      className="cta-secondary mt-2"
                    >
                      {dict.upload.changeFile}
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
                      <p className="text-base font-bold" style={{ color: 'var(--ink-strong)' }}>{dict.upload.dropTitle}</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
                        {dict.upload.dropBody}
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
                  <label className="field-label">{dict.upload.camera}</label>
                  <select
                    value={cameraPerspective}
                    onChange={e => setCameraPerspective(e.target.value)}
                    className="select-input"
                    disabled={busy}
                  >
                    {cameraOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">{dict.upload.session}</label>
                  <select
                    value={sessionType}
                    onChange={e => setSessionType(e.target.value)}
                    className="select-input"
                    disabled={busy}
                  >
                    {sessionOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

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
                {busy ? labels[step] : dict.upload.submit}
              </button>
            </form>
          </section>

          {/* Info panel */}
          <section className="surface-card p-6 lg:p-8 self-start space-y-6">
            <div>
              <h2 className="section-title" style={{ fontSize: 'clamp(1.3rem, 2.2vw, 1.6rem)' }}>
                {dict.upload.infoTitle}
              </h2>
              <p className="section-copy mt-3">
                {dict.upload.infoBody}
              </p>
              <p className="mt-3 text-sm" style={{ color: 'var(--ink-base)', lineHeight: 1.65 }}>
                {dict.upload.eta}
              </p>
            </div>

            {/* What you get */}
            <div className="grid gap-3">
              <div className="surface-card-muted px-4 py-3 flex items-start gap-4">
                <span className="step-number">01</span>
                <p className="text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                  {dict.upload.step1}
                </p>
              </div>
              <div className="surface-card-muted px-4 py-3 flex items-start gap-4">
                <span className="step-number">02</span>
                <p className="text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                  {dict.upload.step2}
                </p>
              </div>
              <div className="surface-card-muted px-4 py-3 flex items-start gap-4">
                <span className="step-number">03</span>
                <p className="text-sm leading-6" style={{ color: 'var(--ink-base)' }}>
                  {dict.upload.step3}
                </p>
              </div>
            </div>

            {/* Clip quality explainer */}
            <div>
              <button
                type="button"
                onClick={() => setShowQualityInfo(!showQualityInfo)}
                className="clip-quality-toggle"
              >
                {showQualityInfo ? dict.upload.qualityClose : dict.upload.qualityOpen}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
              </button>
              {showQualityInfo && (
                <div
                  className="mt-3 rounded-[var(--radius-lg)] px-4 py-4 text-sm leading-6"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', color: 'var(--ink-base)' }}
                >
                  <p>{dict.upload.qualityPoint1}</p>
                  <p className="mt-2">{dict.upload.qualityPoint2}</p>
                  <p className="mt-2">{dict.upload.qualityPoint3}</p>
                  <p className="mt-2">{dict.upload.qualityPoint4}</p>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="metric-value">1</p>
                <p className="metric-label">{lang === 'zh' ? '连续视频' : 'Continuous clip'}</p>
              </div>
              <div className="metric-tile">
                <p className="metric-value">Fast</p>
                <p className="metric-label">{lang === 'zh' ? '安全上传' : 'Secure upload'}</p>
              </div>
              <div className="metric-tile">
                <p className="metric-value">3</p>
                <p className="metric-label">{lang === 'zh' ? '复盘阶段' : 'Review steps'}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
