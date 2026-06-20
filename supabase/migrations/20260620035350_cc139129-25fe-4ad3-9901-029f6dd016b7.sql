ALTER TABLE public.activity_applications
ADD COLUMN IF NOT EXISTS publish_screenshots text[] NOT NULL DEFAULT '{}'::text[];