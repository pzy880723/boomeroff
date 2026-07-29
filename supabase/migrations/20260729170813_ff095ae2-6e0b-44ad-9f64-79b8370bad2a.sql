-- ERP → AIGC SSO 用户映射表
CREATE TABLE IF NOT EXISTS public.erp_user_links (
  erp_user_id uuid PRIMARY KEY,
  aigc_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  display_name text,
  roles text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  shops jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_login_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.erp_user_links FROM anon, authenticated;
GRANT ALL ON public.erp_user_links TO service_role;

ALTER TABLE public.erp_user_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS erp_user_links_aigc_user_id_idx
  ON public.erp_user_links (aigc_user_id);

-- updated_at 触发器函数（仅 service_role 可执行）
CREATE OR REPLACE FUNCTION public.erp_user_links_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_user_links_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_user_links_set_updated_at() TO service_role;

DROP TRIGGER IF EXISTS trg_erp_user_links_updated_at ON public.erp_user_links;
CREATE TRIGGER trg_erp_user_links_updated_at
BEFORE UPDATE ON public.erp_user_links
FOR EACH ROW EXECUTE FUNCTION public.erp_user_links_set_updated_at();