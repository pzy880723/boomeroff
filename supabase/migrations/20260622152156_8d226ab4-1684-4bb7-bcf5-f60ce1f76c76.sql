
ALTER TABLE public.marketing_assets
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS sha256 text;

UPDATE public.marketing_assets
   SET sha256 = meta->>'sha256'
 WHERE sha256 IS NULL AND meta ? 'sha256';

CREATE INDEX IF NOT EXISTS idx_ma_shop_sha  ON public.marketing_assets(shop_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ma_user_sha  ON public.marketing_assets(user_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ma_tags_gin  ON public.marketing_assets USING GIN (tags);

DROP POLICY IF EXISTS "own assets read"   ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets write"  ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets update" ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets delete" ON public.marketing_assets;

CREATE POLICY "shop members read" ON public.marketing_assets FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR (shop_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = marketing_assets.shop_id
  ))
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "self insert" ON public.marketing_assets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own update" ON public.marketing_assets FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own delete" ON public.marketing_assets FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.marketing_assets REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'marketing_assets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_assets';
  END IF;
END $$;
