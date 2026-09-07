CREATE OR REPLACE FUNCTION public.erp_verify_current_scope_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  scope_ctx jsonb;
  verified_erp_user_id uuid := NULL;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'scope', 'unconfigured',
      'erp_user_id', NULL
    );
  END IF;

  scope_ctx := public.current_user_erp_scope();

  -- 仅当映射唯一、有效且账号未停用（scope 上下文判定 erp_linked=true）时，
  -- 才从 erp_user_links 读取本人的 erp_user_id。
  IF COALESCE((scope_ctx ->> 'erp_linked')::boolean, false) THEN
    SELECT l.erp_user_id INTO verified_erp_user_id
    FROM public.erp_user_links l
    WHERE l.aigc_user_id = uid;
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
$$;

REVOKE ALL ON FUNCTION public.erp_verify_current_scope_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_verify_current_scope_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_verify_current_scope_v1() TO service_role;