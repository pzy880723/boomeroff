-- 拆分 FOR ALL 策略（会顺带放开 SELECT）为仅写入策略，并要求 ERP 授权门店
REVOKE ALL ON FUNCTION public.erp_governed_users_track() FROM PUBLIC, anon;

-- shops
DROP POLICY IF EXISTS "shops write by access scope" ON public.shops;
CREATE POLICY "shops write by access scope" ON public.shops
FOR INSERT TO authenticated
WITH CHECK (id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.write')));
CREATE POLICY "shops update by access scope" ON public.shops
FOR UPDATE TO authenticated
USING (id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.write')))
WITH CHECK (id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "shops delete by access scope" ON public.shops
FOR DELETE TO authenticated
USING (id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.write')));

-- shop_shifts
DROP POLICY IF EXISTS "shifts write by store" ON public.shop_shifts;
CREATE POLICY "shifts insert by store" ON public.shop_shifts
FOR INSERT TO authenticated
WITH CHECK ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shift.write')));
CREATE POLICY "shifts update by store" ON public.shop_shifts
FOR UPDATE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shift.write')))
WITH CHECK (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "shifts delete by store" ON public.shop_shifts
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shift.write')));

-- shift_schedules
DROP POLICY IF EXISTS "schedules write by store" ON public.shift_schedules;
CREATE POLICY "schedules insert by store" ON public.shift_schedules
FOR INSERT TO authenticated
WITH CHECK (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'schedule.write')));
CREATE POLICY "schedules update by store" ON public.shift_schedules
FOR UPDATE TO authenticated
USING (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'schedule.write')))
WITH CHECK (shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "schedules delete by store" ON public.shift_schedules
FOR DELETE TO authenticated
USING (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'schedule.write')));

-- shop_kb_entries
DROP POLICY IF EXISTS "kb entries write by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries insert by store" ON public.shop_kb_entries
FOR INSERT TO authenticated
WITH CHECK ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.write')));
CREATE POLICY "kb entries update by store" ON public.shop_kb_entries
FOR UPDATE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.write')))
WITH CHECK (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "kb entries delete by store" ON public.shop_kb_entries
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.write')));

-- shop_kb_categories
DROP POLICY IF EXISTS "kb cats write by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats insert by store" ON public.shop_kb_categories
FOR INSERT TO authenticated
WITH CHECK ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.category')));
CREATE POLICY "kb cats update by store" ON public.shop_kb_categories
FOR UPDATE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.category')))
WITH CHECK (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "kb cats delete by store" ON public.shop_kb_categories
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'shop.kb.category')));

-- shop_holidays
DROP POLICY IF EXISTS "holidays write by store" ON public.shop_holidays;
CREATE POLICY "holidays insert by store" ON public.shop_holidays
FOR INSERT TO authenticated
WITH CHECK ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'holiday.write')));
CREATE POLICY "holidays update by store" ON public.shop_holidays
FOR UPDATE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'holiday.write')))
WITH CHECK (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "holidays delete by store" ON public.shop_holidays
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'holiday.write')));

-- staff_day_offs
DROP POLICY IF EXISTS "day offs write by store" ON public.staff_day_offs;
CREATE POLICY "day offs insert by store" ON public.staff_day_offs
FOR INSERT TO authenticated
WITH CHECK (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'dayoff.write')));
CREATE POLICY "day offs update by store" ON public.staff_day_offs
FOR UPDATE TO authenticated
USING (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'dayoff.write')))
WITH CHECK (shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "day offs delete by store" ON public.staff_day_offs
FOR DELETE TO authenticated
USING (shop_id = ANY(public.erp_authorized_shop_ids())
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'dayoff.write')));

-- staff_profiles
DROP POLICY IF EXISTS "staff write by access scope" ON public.staff_profiles;
CREATE POLICY "staff insert by access scope" ON public.staff_profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id
  OR ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
      AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'staff.write'))));
CREATE POLICY "staff update by access scope" ON public.staff_profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id
  OR ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
      AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'staff.write'))))
WITH CHECK (auth.uid() = user_id
  OR shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "staff delete by access scope" ON public.staff_profiles
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'staff.write')));

-- operation_okrs
DROP POLICY IF EXISTS "okrs admin all" ON public.operation_okrs;
CREATE POLICY "okrs insert by scope" ON public.operation_okrs
FOR INSERT TO authenticated
WITH CHECK ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'okr.write')));
CREATE POLICY "okrs update by scope" ON public.operation_okrs
FOR UPDATE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'okr.write')))
WITH CHECK (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));
CREATE POLICY "okrs delete by scope" ON public.operation_okrs
FOR DELETE TO authenticated
USING ((shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()))
  AND (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'okr.write')));
