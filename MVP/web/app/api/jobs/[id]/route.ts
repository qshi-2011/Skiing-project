import { NextRequest, NextResponse } from 'next/server'
import { type TechniqueRunSummary, type AiCoaching } from '@/lib/analysis-summary'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createArtifactDownloadUrl, getDefaultR2ArtifactsBucket } from '@/lib/r2'
import { computeSummaryScore, loadSummaryFromObjectPath } from '@/lib/server-job-data'

function artifactStorageProvider(artifact: { meta?: Record<string, unknown> }) {
  return artifact.meta?.storage_provider === 'r2' ? 'r2' : 'supabase'
}

function artifactStorageBucket(artifact: { meta?: Record<string, unknown> }) {
  const metaBucket = artifact.meta?.storage_bucket
  return typeof metaBucket === 'string' && metaBucket ? metaBucket : getDefaultR2ArtifactsBucket()
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const jobId = params.id

  // Fetch job using the session client — RLS scopes to the authenticated user
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Fetch artifacts — use service client for storage signing
  const { data: artifacts } = await service
    .from('artifacts')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at')

  // Generate 1-hour signed download URLs for each artifact
  const artifactsWithUrls = await Promise.all(
    (artifacts ?? []).map(async (artifact) => {
      if (artifactStorageProvider(artifact as { meta?: Record<string, unknown> }) === 'r2') {
        const url = await createArtifactDownloadUrl(
          artifact.object_path,
          artifactStorageBucket(artifact as { meta?: Record<string, unknown> })
        )
        return { ...artifact, url }
      }

      const { data } = await service.storage
        .from('artifacts')
        .createSignedUrl(artifact.object_path, 3600)
      return { ...artifact, url: data?.signedUrl ?? '' }
    })
  )

  let summary: TechniqueRunSummary | null = null
  const summaryArtifact = (artifacts ?? []).find((artifact) => artifact.kind === 'summary_json')

  if (summaryArtifact) {
    summary = await loadSummaryFromObjectPath(service, summaryArtifact.object_path)
  }

  // Fetch current AI coaching JSON if available, with legacy fallback.
  let aiCoaching: AiCoaching | null = null
  const coachingArtifact = (artifacts ?? []).find((artifact) => artifact.kind === 'ai_coaching')
    ?? (artifacts ?? []).find((artifact) => artifact.kind === 'claude_coaching')
    ?? (artifacts ?? []).find((artifact) => artifact.kind === 'gemini_coaching')
  if (coachingArtifact) {
    const { data: coachingFile } = await service.storage
      .from('artifacts')
      .download(coachingArtifact.object_path)
    if (coachingFile) {
      try {
        aiCoaching = JSON.parse(await coachingFile.text()) as AiCoaching
      } catch (error) {
        console.error('ai coaching parse error:', error)
      }
    }
  }

  // Persist score if summary exists and job.score is not yet set
  if (summary && job.score == null && job.status === 'done') {
    const computedScore = computeSummaryScore(summary)
    if (Number.isFinite(computedScore)) {
      await service
        .from('jobs')
        .update({ score: computedScore })
        .eq('id', jobId)
      job.score = computedScore
    }
  }

  // Find previous completed run's score for delta
  let previousScore: number | null = null
  if (job.status === 'done') {
    const { data: prevJobs } = await service
      .from('jobs')
      .select('score')
      .eq('user_id', user.id)
      .eq('status', 'done')
      .lt('created_at', job.created_at)
      .not('score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (prevJobs?.length && prevJobs[0].score != null) {
      previousScore = prevJobs[0].score
    }
  }

  return NextResponse.json({ job, artifacts: artifactsWithUrls, summary, previousScore, aiCoaching })
}
