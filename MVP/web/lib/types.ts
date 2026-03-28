export type JobStatus = 'created' | 'uploaded' | 'queued' | 'running' | 'done' | 'error'

export interface JobConfig extends Record<string, unknown> {
  original_filename?: string
  display_name?: string
  user_note?: string
  video_storage_provider?: 'supabase' | 'r2'
  video_content_type?: string
  video_file_size_bytes?: number
  camera_perspective?: string
  session_type?: string
  progress_note?: string
  progress_stage?: string
  progress_step?: number
  progress_total?: number
  heartbeat_at?: string
}

export interface Job {
  id: string
  user_id: string
  status: JobStatus
  video_object_path: string | null
  result_prefix: string | null
  config: JobConfig
  score: number | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: string
  job_id: string
  kind: string
  object_path: string
  meta: {
    turn_idx?: number
    side?: string
    timestamp_s?: number
    storage_provider?: 'supabase' | 'r2'
    storage_bucket?: string
    [key: string]: unknown
  }
  created_at: string
}

export interface ArtifactWithUrl extends Artifact {
  url: string
}
