CREATE OR REPLACE FUNCTION public.erp_verify_current_scope_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  scope_ctx jsonb;
  verified_erp_user_id uuid := NULL;
  link_count int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'scope', 'unconfigured', 'erp_user_id', NULL);
  END IF;

  scope_ctx := public.current_user_erp_scope();

  -- 仅当映射唯一、状态 active、账号未停用（scope 判定 erp_linked=true）时才回报 erp_user_id
  IF COALESCE((scope_ctx ->> 'erp_linked')::boolean, false) AND NOT public.account_suspended() THEN
    SELECT count(*) INTO link_count
    FROM public.erp_user_links l
    WHERE l.aigc_user_id = uid AND COALESCE(l.link_status,'active') = 'active';

    IF link_count = 1 THEN
      SELECT l.erp_user_id INTO verified_erp_user_id
      FROM public.erp_user_links l
      WHERE l.aigc_user_id = uid AND COALESCE(l.link_status,'active') = 'active';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', uid,
    'erp_user_id', verified_erp_user_id,
    'is_erp_user', public.is_erp_user(),
    'scope_context', scope_ctx,
    'shop_context', public.current_shop_context_v1()
  );
END;
$function$;