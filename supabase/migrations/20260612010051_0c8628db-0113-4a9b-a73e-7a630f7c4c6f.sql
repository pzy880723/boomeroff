CREATE OR REPLACE FUNCTION public.delete_voucher_safe(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  blocking int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(uid, 'voucher.manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO blocking
  FROM public.voucher_claims
  WHERE voucher_id = _id
    AND status IN ('unclaimed','claimed')
    AND (expires_at IS NULL OR expires_at > now());

  IF blocking > 0 THEN
    RAISE EXCEPTION '还有 % 张未到期且未核销的券，无法删除', blocking;
  END IF;

  DELETE FROM public.voucher_claims WHERE voucher_id = _id;
  DELETE FROM public.vouchers WHERE id = _id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_voucher_safe(uuid) TO authenticated;