-- 1. 软删字段
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. 升级历史 unclaimed claim 到 claimed
UPDATE public.voucher_claims
   SET status = 'claimed',
       claimed_at = COALESCE(claimed_at, created_at)
 WHERE status = 'unclaimed';

-- 3. 重写 delete_voucher_safe: 仅管理员 + 软删
CREATE OR REPLACE FUNCTION public.delete_voucher_safe(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.vouchers
     SET deleted_at = now(),
         active = false
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_voucher_safe(uuid) TO authenticated;