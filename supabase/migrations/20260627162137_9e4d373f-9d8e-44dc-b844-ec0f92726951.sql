
-- 1) marketing_characters 增加认证字段
ALTER TABLE public.marketing_characters
  ADD COLUMN IF NOT EXISTS verified_asset_id text,
  ADD COLUMN IF NOT EXISTS verified_asset_uri text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 2) 认证会话/资产表
CREATE TABLE IF NOT EXISTS public.marketing_character_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.marketing_characters(id) ON DELETE CASCADE,
  shop_id uuid,
  created_by uuid,
  session_id text,
  h5_url text,
  status text NOT NULL DEFAULT 'pending', -- pending | verified | failed | revoked
  asset_id text,
  asset_uri text,
  expire_at timestamptz,
  error_reason text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_character_assets TO authenticated;
GRANT ALL ON public.marketing_character_assets TO service_role;

ALTER TABLE public.marketing_character_assets ENABLE ROW LEVEL SECURITY;

-- 同店成员可读
CREATE POLICY "character_assets_select_same_shop"
  ON public.marketing_character_assets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketing_characters c
      WHERE c.id = character_id
        AND (
          c.created_by = auth.uid()
          OR c.shop_id IN (SELECT shop_id FROM public.staff_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- 创建人可写
CREATE POLICY "character_assets_insert_owner"
  ON public.marketing_character_assets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "character_assets_update_owner"
  ON public.marketing_character_assets FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_character_assets_character ON public.marketing_character_assets(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_assets_session ON public.marketing_character_assets(session_id);

CREATE TRIGGER trg_character_assets_updated
  BEFORE UPDATE ON public.marketing_character_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
