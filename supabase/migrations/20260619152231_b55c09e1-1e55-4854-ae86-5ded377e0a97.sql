
ALTER TABLE public.marketing_video_jobs
  ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.marketing_video_jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS segment_index int,
  ADD COLUMN IF NOT EXISTS segment_total int,
  ADD COLUMN IF NOT EXISTS segment_url text;

CREATE INDEX IF NOT EXISTS marketing_video_jobs_parent_idx
  ON public.marketing_video_jobs(parent_job_id);
