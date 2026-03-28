import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const workerEnvPath = path.resolve(repoRoot, '..', '.env.worker')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnvFile(workerEnvPath)

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

function round(value, digits = 0) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function smallerIsBetter(value, best, worst) {
  if (value <= best) return 100
  if (value >= worst) return 0
  return clamp(100 - ((value - best) / (worst - best)) * 100, 0, 100)
}

function closenessScore(value, target, spread) {
  return clamp(100 - (Math.abs(value - target) / spread) * 100, 0, 100)
}

function positiveScore(value, floor, ceiling) {
  if (value <= floor) return 0
  if (value >= ceiling) return 100
  return clamp(((value - floor) / (ceiling - floor)) * 100, 0, 100)
}

function computeSummaryScore(summary) {
  const turns = Array.isArray(summary?.turns) ? summary.turns : []
  if (!turns.length) return null

  const qualityScores = turns.map((turn) => turn.quality_score).filter(Number.isFinite)
  const smoothnessScores = turns.map((turn) => turn.smoothness_score).filter(Number.isFinite)
  const edgeAngles = turns.map((turn) => turn.avg_edge_angle).filter(Number.isFinite)
  const stanceWidths = turns.map((turn) => turn.avg_stance_width_ratio).filter(Number.isFinite)
  const asymmetry = turns.map((turn) => Math.abs(turn.avg_knee_flexion_diff)).filter(Number.isFinite)
  const leanAngles = turns.map((turn) => turn.avg_lean_angle).filter(Number.isFinite)
  const quietness = turns.map((turn) => turn.avg_upper_body_quietness).filter(Number.isFinite)
  const comShift = turns.map((turn) => turn.avg_com_shift_3d).filter(Number.isFinite)
  const durations = turns.map((turn) => turn.duration_s).filter(Number.isFinite)

  const overallScore = round(mean(qualityScores), 0)
  const smoothnessScore = smoothnessScores.length ? round(mean(smoothnessScores), 0) : null
  const edgeAngle = round(mean(edgeAngles), 1)
  const stanceWidth = round(mean(stanceWidths), 2)
  const kneeAsymmetry = round(mean(asymmetry), 1)
  const leanAngle = round(mean(leanAngles), 1)
  const quietnessMean = mean(quietness)
  const poseConfidence = round((summary?.quality?.overall_pose_confidence_mean ?? 0) * 100, 0)
  const comShiftMean = round(mean(comShift), 2)
  const durationDrift = round(stddev(durations), 2)
  const bestTurnScore = round(Math.max(...qualityScores, 0), 0)

  const balanceScore = round(
    mean([
      smallerIsBetter(kneeAsymmetry, 6, 28),
      closenessScore(stanceWidth, 1.45, 1.35),
      closenessScore(leanAngle, 24, 18),
    ]),
    0,
  )

  const edgingScore = round(
    mean([
      closenessScore(edgeAngle, 47, 24),
      closenessScore(comShiftMean, 0.28, 0.26),
      positiveScore(poseConfidence, 55, 92),
    ]),
    0,
  )

  const rhythmScore = round(
    mean([
      smoothnessScore ?? overallScore,
      smallerIsBetter(durationDrift, 0.1, 1.7),
      closenessScore(mean(durations), 1.7, 1.4),
    ]),
    0,
  )

  const movementScore = round(
    mean([
      smallerIsBetter(quietnessMean, 0.002, 0.02),
      overallScore,
      positiveScore(bestTurnScore, 35, 82),
    ]),
    0,
  )

  return round(mean([balanceScore, edgingScore, rhythmScore, movementScore]), 0)
}

async function main() {
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, status, score')
    .eq('status', 'done')
    .is('score', null)

  if (jobsError) throw jobsError
  if (!jobs?.length) {
    console.log('No completed jobs with missing scores found.')
    return
  }

  const jobIds = jobs.map((job) => job.id)
  const { data: artifacts, error: artifactsError } = await supabase
    .from('artifacts')
    .select('job_id, object_path')
    .in('job_id', jobIds)
    .eq('kind', 'summary_json')

  if (artifactsError) throw artifactsError

  const artifactByJob = new Map((artifacts ?? []).map((artifact) => [artifact.job_id, artifact.object_path]))

  let fixed = 0
  let skipped = 0

  for (const job of jobs) {
    const objectPath = artifactByJob.get(job.id)
    if (!objectPath) {
      skipped += 1
      console.log(`Skipped ${job.id}: no summary_json artifact`)
      continue
    }

    const { data, error } = await supabase.storage.from('artifacts').download(objectPath)
    if (error || !data) {
      skipped += 1
      console.log(`Skipped ${job.id}: failed to download summary`)
      continue
    }

    let summary
    try {
      summary = JSON.parse(await data.text())
    } catch {
      skipped += 1
      console.log(`Skipped ${job.id}: invalid summary JSON`)
      continue
    }

    const score = computeSummaryScore(summary)
    if (!Number.isFinite(score)) {
      skipped += 1
      console.log(`Skipped ${job.id}: could not derive a score`)
      continue
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ score })
      .eq('id', job.id)

    if (updateError) {
      skipped += 1
      console.log(`Skipped ${job.id}: failed to update score`)
      continue
    }

    fixed += 1
    console.log(`Updated ${job.id}: score ${score}`)
  }

  console.log(`Backfill complete. Fixed ${fixed}, skipped ${skipped}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
