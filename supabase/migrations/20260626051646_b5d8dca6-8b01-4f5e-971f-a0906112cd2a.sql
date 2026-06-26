
ALTER TABLE public.social_publish_jobs DROP CONSTRAINT IF EXISTS social_publish_jobs_status_check;
ALTER TABLE public.social_publish_jobs ADD CONSTRAINT social_publish_jobs_status_check
  CHECK (status = ANY (ARRAY['queued','scheduled','running','done','partial','failed','cancelled']));

ALTER TABLE public.social_publish_targets DROP CONSTRAINT IF EXISTS social_publish_targets_status_check;
ALTER TABLE public.social_publish_targets ADD CONSTRAINT social_publish_targets_status_check
  CHECK (status = ANY (ARRAY['queued','scheduled','running','success','failed','cancelled']));

ALTER TABLE public.social_publish_targets
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;
