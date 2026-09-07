-- ===== 过渡兼容：仅限「从未被 ERP 管辖」的旧账号 =====
CREATE OR REPLACE FUNCTION public.legacy_transition_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT public.erp_is_governed()
     AND NOT EXISTS (SELECT 1 FROM public.erp_user_links l WHERE l.aigc_user_id = auth.uid())
     AND NOT public.account_suspended()
$$;

CREATE OR REPLACE FUNCTION public.legacy_transition_shop_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.legacy_transition_active()
              THEN public.current_user_shop_id() END
$$;

CREATE OR REPLACE FUNCTION public.legacy_transition_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.legacy_transition_active()
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

REVOKE ALL ON FUNCTION public.legacy_transition_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.legacy_transition_shop_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.legacy_transition_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legacy_transition_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legacy_transition_shop_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legacy_transition_admin() TO authenticated, service_role;

-- ===== shops =====
DROP POLICY IF EXISTS "shops read by access scope" ON public.shops;
CREATE POLICY "shops read by access scope" ON public.shops FOR SELECT TO authenticated
USING (
  id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR id = public.legacy_transition_shop_id()
);

-- ===== shop_shifts =====
DROP POLICY IF EXISTS "shifts read by store" ON public.shop_shifts;
CREATE POLICY "shifts read by store" ON public.shop_shifts FOR SELECT TO authenticated
USING (
  shop_id IS NULL
  OR shop_id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "shifts insert by store" ON public.shop_shifts;
CREATE POLICY "shifts insert by store" ON public.shop_shifts FOR INSERT TO authenticated
WITH CHECK (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shift.write')))
  OR (public.legacy_transition_admin())
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.legacy_transition_active()
      AND public.user_has_permission(auth.uid(),'shift.write'))
);
DROP POLICY IF EXISTS "shifts update by store" ON public.shop_shifts;
CREATE POLICY "shifts update by store" ON public.shop_shifts FOR UPDATE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shift.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shift.write'))
)
WITH CHECK (
  (shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "shifts delete by store" ON public.shop_shifts;
CREATE POLICY "shifts delete by store" ON public.shop_shifts FOR DELETE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shift.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shift.write'))
);

-- ===== shop_holidays =====
DROP POLICY IF EXISTS "holidays read by store" ON public.shop_holidays;
CREATE POLICY "holidays read by store" ON public.shop_holidays FOR SELECT TO authenticated
USING (
  shop_id IS NULL
  OR shop_id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "holidays insert by store" ON public.shop_holidays;
CREATE POLICY "holidays insert by store" ON public.shop_holidays FOR INSERT TO authenticated
WITH CHECK (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'holiday.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'holiday.write'))
);
DROP POLICY IF EXISTS "holidays update by store" ON public.shop_holidays;
CREATE POLICY "holidays update by store" ON public.shop_holidays FOR UPDATE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'holiday.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'holiday.write'))
)
WITH CHECK (
  (shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "holidays delete by store" ON public.shop_holidays;
CREATE POLICY "holidays delete by store" ON public.shop_holidays FOR DELETE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'holiday.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'holiday.write'))
);

-- ===== shop_kb_categories =====
DROP POLICY IF EXISTS "kb cats read by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats read by store" ON public.shop_kb_categories FOR SELECT TO authenticated
USING (
  shop_id IS NULL
  OR shop_id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "kb cats insert by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats insert by store" ON public.shop_kb_categories FOR INSERT TO authenticated
WITH CHECK (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.category')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.category'))
);
DROP POLICY IF EXISTS "kb cats update by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats update by store" ON public.shop_kb_categories FOR UPDATE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.category')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.category'))
)
WITH CHECK (
  (shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "kb cats delete by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats delete by store" ON public.shop_kb_categories FOR DELETE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.category')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.category'))
);

-- ===== shop_kb_entries =====
DROP POLICY IF EXISTS "kb entries read by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries read by store" ON public.shop_kb_entries FOR SELECT TO authenticated
USING (
  shop_id IS NULL
  OR shop_id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "kb entries insert by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries insert by store" ON public.shop_kb_entries FOR INSERT TO authenticated
WITH CHECK (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.write'))
);
DROP POLICY IF EXISTS "kb entries update by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries update by store" ON public.shop_kb_entries FOR UPDATE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.write'))
)
WITH CHECK (
  (shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "kb entries delete by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries delete by store" ON public.shop_kb_entries FOR DELETE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'shop.kb.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'shop.kb.write'))
);

-- ===== operation_okrs =====
DROP POLICY IF EXISTS "okrs staff read" ON public.operation_okrs;
CREATE POLICY "okrs staff read" ON public.operation_okrs FOR SELECT TO authenticated
USING (
  scope = 'brand'
  OR shop_id IS NULL
  OR shop_id = ANY (public.erp_authorized_shop_ids())
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "okrs insert by scope" ON public.operation_okrs;
CREATE POLICY "okrs insert by scope" ON public.operation_okrs FOR INSERT TO authenticated
WITH CHECK (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'okr.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'okr.write'))
);
DROP POLICY IF EXISTS "okrs update by scope" ON public.operation_okrs;
CREATE POLICY "okrs update by scope" ON public.operation_okrs FOR UPDATE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'okr.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'okr.write'))
)
WITH CHECK (
  (shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "okrs delete by scope" ON public.operation_okrs;
CREATE POLICY "okrs delete by scope" ON public.operation_okrs FOR DELETE TO authenticated
USING (
  (((shop_id IS NULL) OR (shop_id = ANY (public.erp_authorized_shop_ids())))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'okr.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'okr.write'))
);

-- ===== shift_schedules =====
DROP POLICY IF EXISTS "schedules read by store" ON public.shift_schedules;
CREATE POLICY "schedules read by store" ON public.shift_schedules FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR ((shop_id = ANY (public.erp_authorized_shop_ids()))
      AND (public.is_hq_user()
           OR public.user_has_permission(auth.uid(),'schedule.view_shop')
           OR public.user_has_permission(auth.uid(),'staff.read')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'staff.read'))
);
DROP POLICY IF EXISTS "schedules insert by store" ON public.shift_schedules;
CREATE POLICY "schedules insert by store" ON public.shift_schedules FOR INSERT TO authenticated
WITH CHECK (
  ((shop_id = ANY (public.erp_authorized_shop_ids()))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'schedule.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'schedule.write'))
);
DROP POLICY IF EXISTS "schedules update by store" ON public.shift_schedules;
CREATE POLICY "schedules update by store" ON public.shift_schedules FOR UPDATE TO authenticated
USING (
  ((shop_id = ANY (public.erp_authorized_shop_ids()))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'schedule.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'schedule.write'))
)
WITH CHECK (
  (shop_id = ANY (public.erp_authorized_shop_ids()))
  OR public.legacy_transition_admin()
  OR shop_id = public.legacy_transition_shop_id()
);
DROP POLICY IF EXISTS "schedules delete by store" ON public.shift_schedules;
CREATE POLICY "schedules delete by store" ON public.shift_schedules FOR DELETE TO authenticated
USING (
  ((shop_id = ANY (public.erp_authorized_shop_ids()))
   AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_permission(auth.uid(),'schedule.write')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'schedule.write'))
);

-- ===== staff_day_offs =====
DROP POLICY IF EXISTS "day offs read by store" ON public.staff_day_offs;
CREATE POLICY "day offs read by store" ON public.staff_day_offs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR ((shop_id = ANY (public.erp_authorized_shop_ids()))
      AND (public.is_hq_user() OR public.user_has_permission(auth.uid(),'staff.read')))
  OR public.legacy_transition_admin()
  OR ((shop_id = public.legacy_transition_shop_id()) AND public.user_has_permission(auth.uid(),'staff.read'))
);

-- ===== staff_profiles =====
DROP POLICY IF EXISTS "staff read self admin or same shop staff reader" ON public.staff_profiles;
CREATE POLICY "staff read self admin or same shop staff reader" ON public.staff_profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR ((shop_id IS NOT NULL) AND (shop_id = ANY (public.erp_authorized_shop_ids()))
      AND (public.is_hq_user() OR public.user_has_permission(auth.uid(),'staff.read')))
  OR public.legacy_transition_admin()
  OR ((shop_id IS NOT NULL) AND (shop_id = public.legacy_transition_shop_id())
      AND public.user_has_permission(auth.uid(),'staff.read'))
);