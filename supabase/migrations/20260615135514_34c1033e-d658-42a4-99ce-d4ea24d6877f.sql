
-- 1) Tighten voucher_claims SELECT: remove created_by self-read branch (PII leak)
DROP POLICY IF EXISTS "voucher_claims read by staff" ON public.voucher_claims;
CREATE POLICY "voucher_claims read by staff"
ON public.voucher_claims
FOR SELECT
TO authenticated
USING (
  public.user_has_permission(auth.uid(), 'voucher.manage')
  OR public.user_has_permission(auth.uid(), 'voucher.redeem')
);

-- 2) Replace fuzzy LIKE storage policy on voucher-screenshots with strict permission check
DROP POLICY IF EXISTS "voucher screenshots admin/creator read" ON storage.objects;
CREATE POLICY "voucher screenshots managers read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voucher-screenshots'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_has_permission(auth.uid(), 'voucher.manage')
    OR public.user_has_permission(auth.uid(), 'voucher.redeem')
  )
);

-- 3) Realtime: enforce channel-level authorization on realtime.messages.
--    Restrict private/user-scoped topics to the matching auth.uid().
--    Topic patterns used by the app:
--      level-up-<uid>            -> private, restrict to owner
--      everything else           -> allow authenticated (public broadcast / postgres_changes still bound by source-table RLS)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated realtime topic access" ON realtime.messages;
CREATE POLICY "Authenticated realtime topic access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'level-up-%'
      THEN realtime.topic() = 'level-up-' || auth.uid()::text
    ELSE true
  END
);
