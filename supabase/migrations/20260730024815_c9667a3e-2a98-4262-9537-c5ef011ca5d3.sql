CREATE OR REPLACE FUNCTION public.is_erp_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH current_user_email AS (
    SELECT lower(u.email) AS email
    FROM auth.users u
    WHERE u.id = auth.uid()
    LIMIT 1
  ), deterministic_erp AS (
    SELECT (regexp_match(
      email,
      '^erp\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@aigc\.boomeroff\.local$'
    ))[1]::uuid AS erp_user_id
    FROM current_user_email
  )
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'auth_source') = 'erp', false)
      OR EXISTS (
        SELECT 1
        FROM public.erp_user_links l
        WHERE l.aigc_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM deterministic_erp d
        JOIN public.erp_user_links l
          ON l.erp_user_id = d.erp_user_id
      )
$function$;

REVOKE ALL ON FUNCTION public.is_erp_user() FROM public;
GRANT EXECUTE ON FUNCTION public.is_erp_user() TO authenticated, service_role;