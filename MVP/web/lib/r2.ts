import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGNED_UPLOAD_TTL_SECONDS = 15 * 60
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60
const PRESIGNED_PART_UPLOAD_TTL_SECONDS = 60 * 60

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID')

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })
}

export const VIDEO_STORAGE_PROVIDER = 'r2'

function getRequiredBucket(name: string) {
  return requireEnv(name)
}

function getOptionalBucket(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback
}

function getR2VideosBucket() {
  return getRequiredBucket('R2_VIDEOS_BUCKET')
}

function getR2ArtifactsBucket() {
  return getOptionalBucket('R2_ARTIFACTS_BUCKET', getR2VideosBucket())
}

export async function createVideoUploadUrl(key: string, contentType: string) {
  const r2 = createR2Client()
  const command = new PutObjectCommand({
    Bucket: getR2VideosBucket(),
    Key: key,
    ContentType: contentType,
  })

  return {
    uploadUrl: await getSignedUrl(r2, command, { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS }),
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
  }
}

export async function createMultipartVideoUpload(key: string, contentType: string) {
  const r2 = createR2Client()
  const response = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: getR2VideosBucket(),
      Key: key,
      ContentType: contentType,
    })
  )

  if (!response.UploadId) {
    throw new Error('R2 did not return an upload ID for multipart upload')
  }

  return { uploadId: response.UploadId }
}

export async function createMultipartVideoPartUploadUrl(
  key: string,
  uploadId: string,
  partNumber: number
) {
  const r2 = createR2Client()
  const command = new UploadPartCommand({
    Bucket: getR2VideosBucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })

  return getSignedUrl(r2, command, { expiresIn: PRESIGNED_PART_UPLOAD_TTL_SECONDS })
}

export async function completeMultipartVideoUpload(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
) {
  const r2 = createR2Client()

  await r2.send(
    new CompleteMultipartUploadCommand({
      Bucket: getR2VideosBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    })
  )
}

export async function abortMultipartVideoUpload(key: string, uploadId: string) {
  const r2 = createR2Client()

  await r2.send(
    new AbortMultipartUploadCommand({
      Bucket: getR2VideosBucket(),
      Key: key,
      UploadId: uploadId,
    })
  )
}

export async function videoObjectExists(key: string) {
  return objectExists(getR2VideosBucket(), key)
}

export async function createArtifactDownloadUrl(key: string, bucket = getR2ArtifactsBucket()) {
  const r2 = createR2Client()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  return getSignedUrl(r2, command, { expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS })
}

export function getDefaultR2ArtifactsBucket() {
  return getR2ArtifactsBucket()
}

async function objectExists(bucket: string, key: string) {
  const r2 = createR2Client()

  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    return true
  } catch (error: unknown) {
    const statusCode = (
      error as { $metadata?: { httpStatusCode?: number } }
    ).$metadata?.httpStatusCode

    if (statusCode === 404) {
      return false
    }

    throw error
  }
}
