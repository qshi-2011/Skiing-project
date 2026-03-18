-- Phase 2: Persist technique score on completed jobs
-- Run this in the Supabase SQL Editor or via supabase db push

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS score real;

COMMENT ON COLUMN public.jobs.score IS 'Technique score (0-100) computed from summary_json, persisted for efficient progress queries';
