ALTER TABLE public.marketing_video_jobs DROP CONSTRAINT IF EXISTS marketing_video_jobs_status_check;
ALTER TABLE public.marketing_video_jobs ADD CONSTRAINT marketing_video_jobs_status_check
  CHECK (status = ANY (ARRAY['queued','running','rendering','ready_to_stitch','stitching','done','succeeded','failed','cancelled']));