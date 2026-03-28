import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { displayNameFromFilename } from '@/lib/job-ui'
import { createMultipartVideoUpload, VIDEO_STORAGE_PROVIDER } from '@/lib/r2'

const MIN_MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024
const DEFAULT_MULTIPART_PART_SIZE_BYTES = 24 * 1024 * 1024
const MAX_MULTIPART_PARTS = 10_000
const DEFAULT_UPLOAD_CONCURRENCY = 3

function safeUploadFilename(original: string) {
  const parts = original.split('.')
  const rawExt = parts.length > 1 ? parts[parts.length - 1] : ''
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : ''
  return `video${ext || '.mp4'}`
}

function safeContentType(value: unknown) {
  if (typeof value !== 'string') {
    return 'application/octet-stream'
  }

  const normalized = value.trim()
  return normalized || 'application/octet-stream'
}

function safeFileSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.floor(value)
}

function chooseMultipartPartSize(fileSizeBytes: number) {
  const minSizeForPartLimit = Math.ceil(fileSizeBytes / MAX_MULTIPART_PARTS)
  const rawPartSize = Math.max(DEFAULT_MULTIPART_PART_SIZE_BYTES, MIN_MULTIPART_PART_SIZE_BYTES, minSizeForPartLimit)
  const roundedToMegabyte = Math.ceil(rawPartSize / (1024 * 1024)) * 1024 * 1024
  return roundedToMegabyte
}

export async function POST(req: NextRequest) {
  // 1. Verify the caller is authenticated
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { filename, contentType, fileSize, cameraPerspective, sessionType } = body
  if (!filename || typeof filename !== 'string') {
    return NextResponse.json({ error: '`filename` is required' }, { status: 400 })
  }
  const normalizedFileSize = safeFileSize(fileSize)
  if (normalizedFileSize == null) {
    return NextResponse.json({ error: '`fileSize` is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // 2. Pre-generate job ID so video_object_path is known at insert time
  const jobId = randomUUID()
  const safeFilename = safeUploadFilename(filename)
  const storagePath = `${user.id}/${jobId}/${safeFilename}`
  const normalizedContentType = safeContentType(contentType)

  const config: Record<string, unknown> = {
    original_filename: filename,
    display_name: displayNameFromFilename(filename),
    video_storage_provider: VIDEO_STORAGE_PROVIDER,
    video_content_type: normalizedContentType,
    video_file_size_bytes: normalizedFileSize,
  }
  if (typeof cameraPerspective === 'string' && cameraPerspective) {
    config.camera_perspective = cameraPerspective
  }
  if (typeof sessionType === 'string' && sessionType) {
    config.session_type = sessionType
  }

  const { data: job, error: jobError } = await service
    .from('jobs')
    .insert({
      id: jobId,
      user_id: user.id,
      status: 'created',
      video_object_path: storagePath,
      config,
    })
    .select()
    .single()

  if (jobError || !job) {
    console.error('jobs insert error:', jobError)
    return NextResponse.json(
      { error: jobError?.message ?? 'Failed to create job' },
      { status: 500 }
    )
  }

  // 3. Start an R2 multipart upload session for <bucket>/<user_id>/<job_id>/<safe_filename>
  try {
    const { uploadId } = await createMultipartVideoUpload(storagePath, normalizedContentType)
    const partSizeBytes = chooseMultipartPartSize(normalizedFileSize)
    const totalParts = Math.ceil(normalizedFileSize / partSizeBytes)

    return NextResponse.json({
      jobId: job.id,
      path: storagePath,
      uploadId,
      contentType: normalizedContentType,
      partSizeBytes,
      totalParts,
      maxConcurrency: DEFAULT_UPLOAD_CONCURRENCY,
    })
  } catch (error) {
    console.error('signed upload URL error:', error)
    // Clean up the orphaned job row so no row remains without a valid upload path
    await service.from('jobs').delete().eq('id', jobId)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    )
  }
}
