DROP POLICY IF EXISTS "Profiles viewable by anon" ON public.profiles;

DROP POLICY IF EXISTS "schedules read all" ON public.shift_schedules;
CREATE POLICY "schedules read own or staff"
  ON public.shift_schedules
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_permission(auth.uid(), 'staff.read')
    OR public.user_has_permission(auth.uid(), 'schedule.write')
  );

DROP POLICY IF EXISTS "voucher_types public read" ON public.voucher_types;
CREATE POLICY "voucher_types authenticated read"
  ON public.voucher_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "vouchers creator insert" ON public.vouchers;
CREATE POLICY "vouchers manager insert"
  ON public.vouchers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_permission(auth.uid(), 'voucher.manage')
    AND created_by = auth.uid()
  );

CREATE POLICY "claim_otp no client access"
  ON public.claim_otp
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.spirit_bump_conv() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_comment_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_favorite_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_like_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_post_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_product_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_product_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_test_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exp_on_test_pass() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_experience(uuid, integer) FROM PUBLIC, anon, authenticated;