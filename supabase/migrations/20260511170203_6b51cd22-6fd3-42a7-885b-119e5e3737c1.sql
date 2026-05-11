ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS story text,
  ADD COLUMN IF NOT EXISTS appreciation text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS care_tips text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS craft text,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS confidence numeric;