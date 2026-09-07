
CREATE OR REPLACE FUNCTION public.erp_scope_sync_receipt_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cnt int;
  _rec record;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'user_id', NULL,
      'erp_user_id', NULL,
      'scope_version', NULL,
      'link_status', NULL,
      'scope_synced_at', NULL,
      'code', 'unauthenticated'
    );
  END IF;

  SELECT count(*) INTO _cnt FROM public.erp_user_links WHERE aigc_user_id = _uid;

  IF _cnt = 0 THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'user_id', _uid,
      'erp_user_id', NULL,
      'scope_version', NULL,
      'link_status', NULL,
      'scope_synced_at', NULL,
      'code', 'no_erp_mapping'
    );
  END IF;

  IF _cnt > 1 THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'user_id', _uid,
      'erp_user_id', NULL,
      'scope_version', NULL,
      'link_status', NULL,
      'scope_synced_at', NULL,
      'code', 'ambiguous_mapping'
    );
  END IF;

  SELECT erp_user_id, scope_version, link_status, scope_synced_at
    INTO _rec
  FROM public.erp_user_links
  WHERE aigc_user_id = _uid;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', _uid,
    'erp_user_id', _rec.erp_user_id,
    'scope_version', _rec.scope_version,
    'link_status', _rec.link_status,
    'scope_synced_at', _rec.scope_synced_at,
    'code', 'ok'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erp_scope_sync_receipt_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_scope_sync_receipt_v1() FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_scope_sync_receipt_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_scope_sync_receipt_v1() TO service_role;
