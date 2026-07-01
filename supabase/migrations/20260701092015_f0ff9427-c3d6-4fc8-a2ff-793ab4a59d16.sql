CREATE INDEX IF NOT EXISTS official_knowledge_updated_idx
  ON public.official_knowledge (updated_at DESC);
CREATE INDEX IF NOT EXISTS official_knowledge_cat_updated_idx
  ON public.official_knowledge (category, updated_at DESC);
CREATE INDEX IF NOT EXISTS user_favorites_user_type_idx
  ON public.user_favorites (user_id, source_type);