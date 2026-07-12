
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS min_followers int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'xiaohongshu';

ALTER TABLE public.activity_applications
  ADD COLUMN IF NOT EXISTS xhs_note_url text,
  ADD COLUMN IF NOT EXISTS xhs_note_id text,
  ADD COLUMN IF NOT EXISTS xhs_verify_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS xhs_verify_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS xhs_verify_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xhs_verify_result jsonb;

CREATE INDEX IF NOT EXISTS idx_activity_applications_xhs_verify_status
  ON public.activity_applications (xhs_verify_status)
  WHERE xhs_note_url IS NOT NULL;
