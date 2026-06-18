
ALTER TABLE public.marketing_assets
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_assets_shop ON public.marketing_assets(shop_id, kind, created_at DESC);

ALTER TABLE public.marketing_video_jobs
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_shop ON public.marketing_video_jobs(shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop_marketing_profiles (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  tagline text,
  description text,
  selling_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone text,
  target_audience text,
  brand_keywords text[] NOT NULL DEFAULT '{}',
  cover_image_url text,
  default_hashtags text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_marketing_profiles TO authenticated;
GRANT ALL ON public.shop_marketing_profiles TO service_role;

ALTER TABLE public.shop_marketing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop marketing profiles read"
  ON public.shop_marketing_profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "shop marketing profiles write"
  ON public.shop_marketing_profiles FOR INSERT
  TO authenticated WITH CHECK (public.user_has_permission(auth.uid(), 'shop.write'));

CREATE POLICY "shop marketing profiles update"
  ON public.shop_marketing_profiles FOR UPDATE
  TO authenticated
  USING (public.user_has_permission(auth.uid(), 'shop.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'shop.write'));

CREATE POLICY "shop marketing profiles delete"
  ON public.shop_marketing_profiles FOR DELETE
  TO authenticated USING (public.user_has_permission(auth.uid(), 'shop.write'));

CREATE TRIGGER update_shop_marketing_profiles_updated_at
  BEFORE UPDATE ON public.shop_marketing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
