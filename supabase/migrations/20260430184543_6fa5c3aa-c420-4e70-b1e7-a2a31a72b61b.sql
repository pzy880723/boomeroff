-- 1. 新增字段
ALTER TABLE public.official_knowledge
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS importance_score integer NOT NULL DEFAULT 0;

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_ok_hotness
  ON public.official_knowledge ((favorite_count * 3 + view_count) DESC);
CREATE INDEX IF NOT EXISTS idx_ok_importance
  ON public.official_knowledge (importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_ok_updated_at
  ON public.official_knowledge (updated_at DESC);

-- 3. 浏览数自增 RPC（绕过 admin-only UPDATE 策略）
CREATE OR REPLACE FUNCTION public.increment_official_view(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.official_knowledge
  SET view_count = view_count + 1
  WHERE id = _id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_official_view(uuid) TO authenticated;

-- 4. 收藏数同步触发器
CREATE OR REPLACE FUNCTION public.sync_official_favorite_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source_type = 'official' THEN
    UPDATE public.official_knowledge
       SET favorite_count = favorite_count + 1
     WHERE id = NEW.source_id;
  ELSIF TG_OP = 'DELETE' AND OLD.source_type = 'official' THEN
    UPDATE public.official_knowledge
       SET favorite_count = GREATEST(favorite_count - 1, 0)
     WHERE id = OLD.source_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_official_fav ON public.user_favorites;
CREATE TRIGGER trg_sync_official_fav
AFTER INSERT OR DELETE ON public.user_favorites
FOR EACH ROW EXECUTE FUNCTION public.sync_official_favorite_count();

-- 5. 历史回填收藏数
UPDATE public.official_knowledge ok
SET favorite_count = sub.cnt
FROM (
  SELECT source_id, COUNT(*)::int AS cnt
    FROM public.user_favorites
   WHERE source_type = 'official'
   GROUP BY source_id
) sub
WHERE ok.id = sub.source_id;