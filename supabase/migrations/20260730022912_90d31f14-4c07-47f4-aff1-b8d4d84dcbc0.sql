CREATE OR REPLACE FUNCTION public.is_erp_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'auth_source') = 'erp', false)
      OR EXISTS (
        SELECT 1 FROM public.erp_user_links l
        WHERE l.aigc_user_id = auth.uid()
      )
$$;

REVOKE ALL ON FUNCTION public.is_erp_user() FROM public;
GRANT EXECUTE ON FUNCTION public.is_erp_user() TO authenticated, service_role;