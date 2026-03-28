import 'server-only'

import { createServiceClient } from '@/lib/supabase/server'
import { buildTechniqueDashboard, type TechniqueRunSummary } from '@/lib/analysis-summary'
import type { Job } from '@/lib/types'

type ServiceClient = ReturnType<typeof createServiceClient>

interface SummaryArtifactRow {
  job_id: string
  object_path: string
}

export function computeSummaryScore(summary: TechniqueRunSummary): number | null {
  const score = buildTechniqueDashboard(summary).overview.overallScore
  return Number.isFinite(score) ? score : null
}

export async function loadSummaryFromObjectPath(
  service: ServiceClient,
  objectPath: string,
): Promise<TechniqueRunSummary | null> {
  const { data: file } = await service.storage
    .from('artifacts')
    .download(objectPath)

  if (!file) return null

  try {
    return JSON.parse(await file.text()) as TechniqueRunSummary
  } catch {
    return null
  }
}

export async function loadSummariesForJobIds(
  service: ServiceClient,
  jobIds: string[],
): Promise<Map<string, TechniqueRunSummary>> {
  const summaryByJob = new Map<string, TechniqueRunSummary>()
  if (!jobIds.length) return summaryByJob

  const { data: artifacts } = await service
    .from('artifacts')
    .select('job_id, object_path')
    .in('job_id', jobIds)
    .eq('kind', 'summary_json')

  const rows = (artifacts ?? []) as SummaryArtifactRow[]
  await Promise.all(rows.map(async (artifact) => {
    const summary = await loadSummaryFromObjectPath(service, artifact.object_path)
    if (summary) {
      summaryByJob.set(artifact.job_id, summary)
    }
  }))

  return summaryByJob
}

export async function backfillMissingScores(
  service: ServiceClient,
  jobs: Job[],
): Promise<Map<string, number>> {
  const missingScoreJobs = jobs.filter((job) => job.status === 'done' && job.score == null)
  const derivedScores = new Map<string, number>()
  if (!missingScoreJobs.length) return derivedScores

  const summaries = await loadSummariesForJobIds(service, missingScoreJobs.map((job) => job.id))

  await Promise.all(missingScoreJobs.map(async (job) => {
    const summary = summaries.get(job.id)
    if (!summary) return

    const score = computeSummaryScore(summary)
    if (score == null) return

    derivedScores.set(job.id, score)
    job.score = score

    await service
      .from('jobs')
      .update({ score })
      .eq('id', job.id)
  }))

  return derivedScores
}
