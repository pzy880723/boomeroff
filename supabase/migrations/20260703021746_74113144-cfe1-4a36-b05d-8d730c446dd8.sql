
-- 1. kb_documents: restrict public policies to authenticated
DROP POLICY IF EXISTS "kb_documents staff read by shop" ON public.kb_documents;
DROP POLICY IF EXISTS "kb_documents admin all" ON public.kb_documents;

CREATE POLICY "kb_documents staff read by shop"
ON public.kb_documents
FOR SELECT
TO authenticated
USING (
  shop_id IS NULL OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = kb_documents.shop_id
  )
);

CREATE POLICY "kb_documents admin all"
ON public.kb_documents
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. invitations: split ALL policy; SELECT limited to creator/admin so codes aren't harvestable
DROP POLICY IF EXISTS "invitations manage by perm" ON public.invitations;

CREATE POLICY "invitations insert by perm"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission(auth.uid(), 'user.create'::text));

CREATE POLICY "invitations update by perm"
ON public.invitations
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'user.create'::text))
WITH CHECK (public.user_has_permission(auth.uid(), 'user.create'::text));

CREATE POLICY "invitations delete by perm"
ON public.invitations
FOR DELETE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'user.create'::text));

CREATE POLICY "invitations select own or admin"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. social_accounts: hide worker_account_key from column-level SELECT
REVOKE SELECT (worker_account_key) ON public.social_accounts FROM authenticated;
REVOKE SELECT (worker_account_key) ON public.social_accounts FROM anon;

CREATE OR REPLACE FUNCTION public.get_social_account_worker_key(_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  key text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_role(uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT worker_account_key INTO key FROM public.social_accounts WHERE id = _id;
  RETURN key;
END; $$;

REVOKE ALL ON FUNCTION public.get_social_account_worker_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_social_account_worker_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_account_worker_key(uuid) TO service_role;

-- 4. vouchers: hide applicant PII from column-level SELECT (no client reads them)
REVOKE SELECT (applicant_name, applicant_phone) ON public.vouchers FROM authenticated;
REVOKE SELECT (applicant_name, applicant_phone) ON public.vouchers FROM anon;

-- 5. activity_applications: hide PII columns; expose via SECURITY DEFINER RPCs
REVOKE SELECT (applicant_name, applicant_phone) ON public.activity_applications FROM authenticated;
REVOKE SELECT (applicant_name, applicant_phone) ON public.activity_applications FROM anon;

CREATE OR REPLACE FUNCTION public.list_activity_applications(_activity_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(auth.uid(), 'voucher.manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT to_jsonb(a) || jsonb_build_object(
    'voucher_claim',
    (SELECT to_jsonb(vc) FROM (
      SELECT status, short_code, redeemed_at FROM public.voucher_claims WHERE id = a.voucher_claim_id
    ) vc)
  )
  FROM public.activity_applications a
  WHERE a.activity_id = _activity_id
  ORDER BY a.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.list_activity_applications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_activity_applications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_activity_applications(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.list_pending_activity_applications()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(auth.uid(), 'voucher.manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT to_jsonb(a) || jsonb_build_object(
    'activity',
    (SELECT to_jsonb(act) FROM (
      SELECT id, name FROM public.activities WHERE id = a.activity_id
    ) act)
  )
  FROM public.activity_applications a
  WHERE a.status = 'pending'
  ORDER BY a.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.list_pending_activity_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_activity_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_activity_applications() TO service_role;

-- 6. voucher_claims: hide recipient PII; expose via RPC
REVOKE SELECT (recipient_name, recipient_phone) ON public.voucher_claims FROM authenticated;
REVOKE SELECT (recipient_name, recipient_phone) ON public.voucher_claims FROM anon;

CREATE OR REPLACE FUNCTION public.list_voucher_claims_with_pii(_voucher_id uuid, _limit int DEFAULT 50)
RETURNS SETOF public.voucher_claims
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.user_has_permission(auth.uid(), 'voucher.manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT * FROM public.voucher_claims
  WHERE voucher_id = _voucher_id
  ORDER BY created_at DESC
  LIMIT GREATEST(_limit, 1);
END; $$;

REVOKE ALL ON FUNCTION public.list_voucher_claims_with_pii(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_voucher_claims_with_pii(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_voucher_claims_with_pii(uuid, int) TO service_role;
