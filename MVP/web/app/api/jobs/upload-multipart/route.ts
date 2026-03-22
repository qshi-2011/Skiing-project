import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  abortMultipartVideoUpload,
  completeMultipartVideoUpload,
  createMultipartVideoPartUploadUrl,
} from '@/lib/r2'

type MultipartPart = {
  ETag: string
  PartNumber: number
}

function isValidUploadPath(path: unknown, userId: string) {
  return typeof path === 'string' && path.startsWith(`${userId}/`)
}

function normalizePartNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

function normalizeParts(value: unknown): MultipartPart[] | null {
  if (!Array.isArray(value) || !value.length) {
    return null
  }

  const parts: MultipartPart[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null
    }

    const eTag = (item as { ETag?: unknown }).ETag
    const partNumber = normalizePartNumber((item as { PartNumber?: unknown }).PartNumber)
    if (typeof eTag !== 'string' || !eTag || partNumber == null) {
      return null
    }

    parts.push({ ETag: eTag, PartNumber: partNumber })
  }

  parts.sort((a, b) => a.PartNumber - b.PartNumber)
  return parts
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { action, path, uploadId } = body

  if (!isValidUploadPath(path, user.id)) {
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
  }
  if (!uploadId || typeof uploadId !== 'string') {
    return NextResponse.json({ error: '`uploadId` is required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'sign-part': {
        const partNumber = normalizePartNumber(body.partNumber)
        if (partNumber == null) {
          return NextResponse.json({ error: '`partNumber` must be a positive integer' }, { status: 400 })
        }

        const uploadUrl = await createMultipartVideoPartUploadUrl(path, uploadId, partNumber)
        return NextResponse.json({ uploadUrl })
      }

      case 'complete': {
        const parts = normalizeParts(body.parts)
        if (!parts) {
          return NextResponse.json({ error: '`parts` is required' }, { status: 400 })
        }

        await completeMultipartVideoUpload(path, uploadId, parts)
        return NextResponse.json({ ok: true })
      }

      case 'abort': {
        await abortMultipartVideoUpload(path, uploadId)
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unsupported multipart action' }, { status: 400 })
    }
  } catch (error) {
    console.error('multipart upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Multipart upload failed' },
      { status: 500 }
    )
  }
}
