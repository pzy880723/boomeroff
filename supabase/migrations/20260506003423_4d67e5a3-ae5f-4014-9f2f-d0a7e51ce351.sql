ALTER TABLE public.official_knowledge
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS body text;