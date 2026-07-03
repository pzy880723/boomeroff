
-- 1) activity_apply_otp: explicit deny on client SELECT (fail-closed already, but make explicit)
REVOKE SELECT ON public.activity_apply_otp FROM anon, authenticated;

-- 2) operation_okrs: restrict staff read to authenticated users only
DROP POLICY IF EXISTS "okrs staff read" ON public.operation_okrs;
CREATE POLICY "okrs staff read"
ON public.operation_okrs
FOR SELECT
TO authenticated
USING (
  (scope = 'brand'::text)
  OR (shop_id IS NULL)
  OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = operation_okrs.shop_id
  )
);

-- 3) staff_profiles: restrict cross-user reads to same-shop viewers with staff.read
DROP POLICY IF EXISTS "staff read self or has perm" ON public.staff_profiles;
CREATE POLICY "staff read self or same shop manager"
ON public.staff_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    public.user_has_permission(auth.uid(), 'staff.read'::text)
    AND (
      shop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles me
        WHERE me.user_id = auth.uid() AND me.shop_id = staff_profiles.shop_id
      )
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

-- 4) voucher_claims: restrict broad SELECT to voucher.manage; provide RPC for redeem lookup by code
DROP POLICY IF EXISTS "voucher_claims read by staff" ON public.voucher_claims;
CREATE POLICY "voucher_claims read by manager"
ON public.voucher_claims
FOR SELECT
TO authenticated
USING (public.user_has_permission(auth.uid(), 'voucher.manage'::text));

CREATE OR REPLACE FUNCTION public.get_claim_for_redeem(_code text)
RETURNS TABLE (
  id uuid,
  code text,
  status text,
  recipient_name text,
  recipient_phone text,
  claimed_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  voucher_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.user_has_permission(auth.uid(), 'voucher.redeem') OR public.user_has_permission(auth.uid(), 'voucher.manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT vc.id, vc.code, vc.status, vc.recipient_name, vc.recipient_phone,
         vc.claimed_at, vc.expires_at, vc.redeemed_at, vc.voucher_id
  FROM public.voucher_claims vc
  WHERE vc.code = upper(_code)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_claim_for_redeem(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claim_for_redeem(text) TO authenticated;
