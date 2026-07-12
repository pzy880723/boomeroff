
ALTER TABLE public.video_generation_jobs
  ADD COLUMN IF NOT EXISTS compose_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS compose_worker_id text,
  ADD COLUMN IF NOT EXISTS compose_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS compose_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS compose_error text;

CREATE INDEX IF NOT EXISTS idx_vgj_compose_queued
  ON public.video_generation_jobs (compose_status, created_at)
  WHERE compose_status IN ('queued','claimed');
