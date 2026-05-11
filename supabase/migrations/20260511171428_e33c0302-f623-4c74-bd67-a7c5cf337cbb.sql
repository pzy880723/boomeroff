ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS rarity int,
  ADD COLUMN IF NOT EXISTS collection_value text,
  ADD COLUMN IF NOT EXISTS market_value text,
  ADD COLUMN IF NOT EXISTS buy_reason text;