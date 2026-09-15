DROP POLICY IF EXISTS "staff read self admin or same shop staff reader" ON public.staff_profiles;
CREATE POLICY "staff read self admin or same shop staff reader" ON public.staff_profiles
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.erp_authorized_shop_ids())
    AND (public.is_hq_user() OR public.scoped_has_action('staff.read'))
  )
  OR public.legacy_transition_admin()
  OR (
    shop_id IS NOT NULL
    AND shop_id = public.legacy_transition_shop_id()
    AND public.legacy_transition_active()
    AND public.user_has_permission(auth.uid(), 'staff.read')
  )
);