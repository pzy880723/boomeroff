CREATE OR REPLACE FUNCTION public.can_create_shop()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT
    -- ERP 治理路径：必须有效 HQ 范围 + 明确 shop.write 动作权限
    (
      COALESCE((public.current_user_erp_scope() ->> 'scope') = 'hq', false)
      AND public.erp_has_action('shop.write')
    )
    -- 过渡路径：仅从未 ERP 治理且未停用的老管理员
    OR public.legacy_transition_admin()
$function$;

GRANT EXECUTE ON FUNCTION public.can_create_shop() TO authenticated, service_role;

DROP POLICY IF EXISTS "shops write by access scope" ON public.shops;
CREATE POLICY "shops write by access scope" ON public.shops FOR INSERT TO authenticated
  WITH CHECK (public.can_create_shop());