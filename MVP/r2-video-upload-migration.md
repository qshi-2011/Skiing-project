# R2 Video Upload Migration

This repo now supports a split setup:

- Supabase for auth, jobs, and artifacts metadata
- Cloudflare R2 for original uploaded videos and large overlay artifacts

## 1. Create the R2 bucket

In Cloudflare:

1. Open `R2`.
2. Create a bucket, for example `ski-videos`.
3. Keep the bucket private.

## 2. Create R2 API credentials

In Cloudflare:

1. Go to `R2` -> `Manage R2 API tokens`.
2. Create an access key with read/write access to the uploads bucket.
3. Save:
   - `Account ID`
   - `Access Key ID`
   - `Secret Access Key`

## 3. Configure bucket CORS

Add a CORS policy for your web origins so the browser can `PUT` directly to the presigned URL.

Example policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-production-domain.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Update the production origin before going live.

## 4. Fill in environment variables

Web app: `MVP/web/.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_VIDEOS_BUCKET=ski-videos
# Optional: defaults to R2_VIDEOS_BUCKET when omitted
# R2_ARTIFACTS_BUCKET=ski-artifacts
```

Worker: `MVP/.env.worker`

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_VIDEOS_BUCKET=ski-videos
# Optional: defaults to R2_VIDEOS_BUCKET when omitted
# R2_ARTIFACTS_BUCKET=ski-artifacts
```

## 5. What changed in code

- `/api/jobs/create` now starts an R2 multipart upload session for the source video.
- `/api/jobs/upload-multipart` signs individual part uploads and completes/aborts the multipart upload.
- `/upload` now uploads large videos to R2 in parallel chunks with per-part retries.
- `/api/jobs/mark-uploaded` verifies the uploaded object in R2.
- `MVP/worker.py` downloads the source video from R2 for new jobs.
- `MVP/worker.py` uploads large overlay artifacts to R2 and stores provider metadata in Supabase.
- `/api/jobs/[id]` signs R2 download URLs for overlay artifacts.
- Older jobs without `config.video_storage_provider = "r2"` still fall back to Supabase Storage.

## 6. Local verification

1. Start the web app.
2. Start the worker.
3. Upload a video larger than `50 MB`.
4. Confirm the job transitions from `created` -> `queued` -> `running` -> `done`.
5. Confirm the source object appears in your R2 bucket.

## 7. Optional next step

Small artifacts like `summary.json`, `metrics.csv`, and cool-moment photos still stay in Supabase Storage. If those also become large later, you can extend the same R2 pattern to them.
