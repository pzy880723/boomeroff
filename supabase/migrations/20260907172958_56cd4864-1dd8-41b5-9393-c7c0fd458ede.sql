-- 1) shops JSON/UUID 严格安全解析，异常 fail-closed
CREATE OR REPLACE FUNCTION public.current_user_erp_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  match_count int := 0;
  link_roles text[];
  link_shops jsonb;
  scope_value text := 'unconfigured';
  shop_ids uuid[] := ARRAY[]::uuid[];
  governed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,
      'erp_linked',false,'erp_governed',false,'reason','no_session');
  END IF;

  governed := public.erp_is_governed();

  IF public.account_suspended() THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,
      'erp_linked',false,'erp_governed',governed,'reason','suspended');
  END IF;

  SELECT count(*)::int INTO match_count
  FROM public.erp_user_links l WHERE l.aigc_user_id = uid;

  IF match_count > 1 THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,
      'erp_linked',false,'erp_governed',true,'reason','ambiguous_mapping');
  END IF;

  IF match_count = 0 THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,
      'erp_linked',false,'erp_governed',governed,
      'reason', CASE WHEN governed THEN 'mapping_revoked' ELSE 'no_erp_mapping' END);
  END IF;

  SELECT l.roles, l.shops INTO link_roles, link_shops
  FROM public.erp_user_links l WHERE l.aigc_user_id = uid;

  IF COALESCE(link_roles,'{}'::text[]) && ARRAY['super_admin','hq','headquarter'] THEN
    scope_value := 'hq';
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
    FROM public.shops s WHERE s.active = true;
  ELSE
    -- 严格解析：非数组 / 非法 UUID / 任意异常 => fail closed
    BEGIN
      IF link_shops IS NULL OR jsonb_typeof(link_shops) <> 'array' THEN
        RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
          'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
          'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
      END IF;

      SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
      FROM public.shops s
      WHERE s.id IN (
        SELECT (e ->> 'id')::uuid
        FROM jsonb_array_elements(link_shops) e
        WHERE jsonb_typeof(e) = 'object'
          AND (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
    END;

    IF array_length(shop_ids,1) IS NULL THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','no_authorized_shop');
    END IF;
    scope_value := 'store';
  END IF;

  RETURN jsonb_build_object(
    'scope', scope_value,
    'shop_ids', to_jsonb(shop_ids),
    'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
    'erp_linked', true,
    'erp_governed', true
  );
END;
$function$;

-- 2) 休息判定：仅本人明确休息 或 全公司停业 或 本人当天实际所在门店停业
CREATE OR REPLACE FUNCTION public.current_shop_context_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  local_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  scope_row jsonb := public.current_user_erp_scope();
  scope_value text := scope_row ->> 'scope';
  shop_ids uuid[] := public.erp_authorized_shop_ids();
  authorized jsonb := '[]'::jsonb;
  eff_shop jsonb := NULL;
  self_sched jsonb := NULL;
  status_value text;
  sched_count int := 0;
  sched_shop uuid;
  is_rest boolean := false;
BEGIN
  IF uid IS NULL OR scope_value = 'unconfigured' THEN
    RETURN jsonb_build_object(
      'date', local_today, 'scope', 'unconfigured', 'status', 'unconfigured',
      'effective_shop', NULL, 'authorized_shops', '[]'::jsonb,
      'self_schedule', NULL,
      'reason', scope_row ->> 'reason'
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::jsonb)
  INTO authorized
  FROM public.shops s WHERE s.id = ANY(shop_ids);

  SELECT count(*)::int INTO sched_count
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid AND ss.work_date = local_today AND ss.shop_id = ANY(shop_ids);

  SELECT ss.shop_id INTO sched_shop
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid AND ss.work_date = local_today AND ss.shop_id = ANY(shop_ids)
  ORDER BY ss.shop_id
  LIMIT 1;

  IF sched_count > 0 AND sched_shop IS NOT NULL THEN
    SELECT jsonb_build_object('id', s.id, 'name', s.name) INTO self_sched
    FROM public.shops s WHERE s.id = sched_shop;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staff_day_offs d
    WHERE d.user_id = uid AND d.off_date = local_today
  ) OR EXISTS (
    SELECT 1 FROM public.shop_holidays h
    WHERE h.date = local_today AND h.full_staff_off = true
      AND (h.shop_id IS NULL OR (sched_shop IS NOT NULL AND h.shop_id = sched_shop))
  ) INTO is_rest;

  IF scope_value = 'hq' THEN
    status_value := 'hq';
    eff_shop := NULL;
  ELSIF sched_count > 0 AND sched_shop IS NOT NULL THEN
    status_value := 'scheduled';
    eff_shop := self_sched;
  ELSIF is_rest THEN
    status_value := 'rest';
  ELSE
    status_value := 'unscheduled';
  END IF;

  RETURN jsonb_build_object(
    'date', local_today,
    'scope', scope_value,
    'status', status_value,
    'effective_shop', eff_shop,
    'authorized_shops', authorized,
    'self_schedule', self_sched
  );
END;
$function$;

-- 3) 修复 list_shift_schedules_v1：CTE 作用域 + 恢复 date / can_view_shop
CREATE OR REPLACE FUNCTION public.list_shift_schedules_v1(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _shop_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  d_from date := COALESCE(_from, (now() AT TIME ZONE 'Asia/Shanghai')::date);
  d_to date := COALESCE(_to, COALESCE(_from, (now() AT TIME ZONE 'Asia/Shanghai')::date));
  scope_row jsonb;
  scope_value text;
  shop_ids uuid[];
  can_view_shop boolean := false;
  rows_json jsonb := '[]'::jsonb;
  conflicts_json jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF d_to < d_from THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  IF (d_to - d_from) > 30 THEN
    RAISE EXCEPTION 'range exceeds 31 days' USING ERRCODE = '22023';
  END IF;

  scope_row := public.current_user_erp_scope();
  scope_value := scope_row ->> 'scope';
  shop_ids := public.erp_authorized_shop_ids();

  IF scope_value = 'unconfigured' THEN
    RAISE EXCEPTION 'erp mapping required: %', COALESCE(scope_row ->> 'reason','unconfigured')
      USING ERRCODE = '42501';
  END IF;

  can_view_shop := (scope_value = 'hq')
    OR public.user_has_permission(uid, 'schedule.view_shop')
    OR public.user_has_permission(uid, 'staff.read');

  IF _shop_id IS NOT NULL AND NOT (_shop_id = ANY(shop_ids)) THEN
    RAISE EXCEPTION 'shop not authorized' USING ERRCODE = '42501';
  END IF;

  WITH work AS (
    SELECT
      ss.work_date,
      ss.shop_id,
      sh.name AS shop_name,
      ss.user_id,
      COALESCE(sp.real_name, pr.display_name, '同事') AS display_name,
      ss.shift_code,
      sd.name AS shift_name,
      sd.start_time,
      sd.end_time,
      ss.source,
      false AS is_rest
    FROM public.shift_schedules ss
    LEFT JOIN public.shops sh ON sh.id = ss.shop_id
    LEFT JOIN public.staff_profiles sp ON sp.user_id = ss.user_id
    LEFT JOIN public.profiles pr ON pr.user_id = ss.user_id
    LEFT JOIN public.shop_shifts sd ON sd.code = ss.shift_code AND sd.shop_id = ss.shop_id
    WHERE ss.work_date BETWEEN d_from AND d_to
      AND (_shop_id IS NULL OR ss.shop_id = _shop_id)
      AND (
        ss.user_id = uid
        OR (can_view_shop AND ss.shop_id = ANY(shop_ids))
      )
  ),
  rest AS (
    SELECT
      d.off_date AS work_date,
      d.shop_id,
      sh.name AS shop_name,
      d.user_id,
      COALESCE(sp.real_name, pr.display_name, '同事') AS display_name,
      NULL::text AS shift_code,
      NULL::text AS shift_name,
      NULL::time AS start_time,
      NULL::time AS end_time,
      'day_off'::text AS source,
      true AS is_rest
    FROM public.staff_day_offs d
    LEFT JOIN public.shops sh ON sh.id = d.shop_id
    LEFT JOIN public.staff_profiles sp ON sp.user_id = d.user_id
    LEFT JOIN public.profiles pr ON pr.user_id = d.user_id
    WHERE d.off_date BETWEEN d_from AND d_to
      AND (_shop_id IS NULL OR d.shop_id = _shop_id)
      AND (
        d.user_id = uid
        OR (can_view_shop AND d.shop_id = ANY(shop_ids))
      )
      AND NOT EXISTS (
        SELECT 1 FROM work w WHERE w.user_id = d.user_id AND w.work_date = d.off_date
      )
  ),
  merged AS (
    SELECT * FROM work
    UNION ALL
    SELECT * FROM rest
  ),
  deduped AS (
    SELECT DISTINCT ON (work_date, user_id) *
    FROM merged
    ORDER BY work_date, user_id, is_rest ASC, shop_name NULLS LAST
  ),
  rows_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'work_date', work_date,
      'shop_id', shop_id,
      'shop_name', shop_name,
      'user_id', user_id,
      'display_name', display_name,
      'shift_code', shift_code,
      'shift_name', shift_name,
      'start_time', start_time,
      'end_time', end_time,
      'source', source,
      'is_rest', is_rest,
      'is_self', (user_id = uid)
    ) ORDER BY work_date, user_id, shop_name NULLS LAST), '[]'::jsonb) AS j
    FROM deduped
  ),
  conflicts_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('work_date', work_date, 'user_id', user_id, 'count', c)
      ORDER BY work_date, user_id), '[]'::jsonb) AS j
    FROM (
      SELECT work_date, user_id, count(*) AS c
      FROM merged
      GROUP BY work_date, user_id
      HAVING count(*) > 1
    ) x
  )
  SELECT rows_agg.j, conflicts_agg.j
  INTO rows_json, conflicts_json
  FROM rows_agg, conflicts_agg;

  RETURN jsonb_build_object(
    'date', d_from,
    'from', d_from,
    'to', d_to,
    'scope', scope_value,
    'can_view_shop', can_view_shop,
    'shop_id', _shop_id,
    'rows', COALESCE(rows_json, '[]'::jsonb),
    'conflicts', COALESCE(conflicts_json, '[]'::jsonb)
  );
END;
$function$;

-- 4) 统一写入授权原语：全局(shop_id IS NULL)写入同样要求有效 ERP 范围；不再用 legacy has_role 提权
CREATE OR REPLACE FUNCTION public.erp_scope_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT COALESCE((public.current_user_erp_scope() ->> 'scope') IN ('hq','store'), false)
$function$;

CREATE OR REPLACE FUNCTION public.can_write_scoped(_shop uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT
    -- ERP 治理路径：必须有效范围 + 明确动作权限（不依赖旧 has_role）
    (
      public.erp_scope_active()
      AND (_shop IS NULL OR _shop = ANY(public.erp_authorized_shop_ids()))
      AND public.user_has_permission(auth.uid(), _perm)
    )
    -- 过渡路径：仅从未 ERP 治理且未停用的老账号，保留原有旧权限
    OR (
      public.legacy_transition_active()
      AND (
        public.legacy_transition_admin()
        OR (
          (_shop IS NULL OR _shop = public.legacy_transition_shop_id())
          AND public.user_has_permission(auth.uid(), _perm)
        )
      )
    )
$function$;

GRANT EXECUTE ON FUNCTION public.erp_scope_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_scoped(uuid, text) TO authenticated, service_role;

-- operation_okrs
DROP POLICY IF EXISTS "okrs insert by scope" ON public.operation_okrs;
DROP POLICY IF EXISTS "okrs update by scope" ON public.operation_okrs;
DROP POLICY IF EXISTS "okrs delete by scope" ON public.operation_okrs;
CREATE POLICY "okrs insert by scope" ON public.operation_okrs FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(shop_id, 'okr.write'));
CREATE POLICY "okrs update by scope" ON public.operation_okrs FOR UPDATE TO authenticated
  USING (public.can_write_scoped(shop_id, 'okr.write'))
  WITH CHECK (public.can_write_scoped(shop_id, 'okr.write'));
CREATE POLICY "okrs delete by scope" ON public.operation_okrs FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'okr.write'));

-- shift_schedules
DROP POLICY IF EXISTS "schedules insert by store" ON public.shift_schedules;
DROP POLICY IF EXISTS "schedules update by store" ON public.shift_schedules;
DROP POLICY IF EXISTS "schedules delete by store" ON public.shift_schedules;
CREATE POLICY "schedules insert by store" ON public.shift_schedules FOR INSERT TO authenticated
  WITH CHECK (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'schedule.write'));
CREATE POLICY "schedules update by store" ON public.shift_schedules FOR UPDATE TO authenticated
  USING (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'schedule.write'))
  WITH CHECK (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'schedule.write'));
CREATE POLICY "schedules delete by store" ON public.shift_schedules FOR DELETE TO authenticated
  USING (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'schedule.write'));

-- shop_holidays
DROP POLICY IF EXISTS "holidays insert by store" ON public.shop_holidays;
DROP POLICY IF EXISTS "holidays update by store" ON public.shop_holidays;
DROP POLICY IF EXISTS "holidays delete by store" ON public.shop_holidays;
CREATE POLICY "holidays insert by store" ON public.shop_holidays FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(shop_id, 'holiday.write'));
CREATE POLICY "holidays update by store" ON public.shop_holidays FOR UPDATE TO authenticated
  USING (public.can_write_scoped(shop_id, 'holiday.write'))
  WITH CHECK (public.can_write_scoped(shop_id, 'holiday.write'));
CREATE POLICY "holidays delete by store" ON public.shop_holidays FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'holiday.write'));

-- shop_shifts
DROP POLICY IF EXISTS "shifts insert by store" ON public.shop_shifts;
DROP POLICY IF EXISTS "shifts update by store" ON public.shop_shifts;
DROP POLICY IF EXISTS "shifts delete by store" ON public.shop_shifts;
CREATE POLICY "shifts insert by store" ON public.shop_shifts FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(shop_id, 'shift.write'));
CREATE POLICY "shifts update by store" ON public.shop_shifts FOR UPDATE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shift.write'))
  WITH CHECK (public.can_write_scoped(shop_id, 'shift.write'));
CREATE POLICY "shifts delete by store" ON public.shop_shifts FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shift.write'));

-- shop_kb_categories
DROP POLICY IF EXISTS "kb cats insert by store" ON public.shop_kb_categories;
DROP POLICY IF EXISTS "kb cats update by store" ON public.shop_kb_categories;
DROP POLICY IF EXISTS "kb cats delete by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats insert by store" ON public.shop_kb_categories FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(shop_id, 'shop.kb.category'));
CREATE POLICY "kb cats update by store" ON public.shop_kb_categories FOR UPDATE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shop.kb.category'))
  WITH CHECK (public.can_write_scoped(shop_id, 'shop.kb.category'));
CREATE POLICY "kb cats delete by store" ON public.shop_kb_categories FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shop.kb.category'));

-- shop_kb_entries
DROP POLICY IF EXISTS "kb entries insert by store" ON public.shop_kb_entries;
DROP POLICY IF EXISTS "kb entries update by store" ON public.shop_kb_entries;
DROP POLICY IF EXISTS "kb entries delete by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries insert by store" ON public.shop_kb_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(shop_id, 'shop.kb.write'));
CREATE POLICY "kb entries update by store" ON public.shop_kb_entries FOR UPDATE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shop.kb.write'))
  WITH CHECK (public.can_write_scoped(shop_id, 'shop.kb.write'));
CREATE POLICY "kb entries delete by store" ON public.shop_kb_entries FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'shop.kb.write'));

-- staff_day_offs
DROP POLICY IF EXISTS "day offs insert by store" ON public.staff_day_offs;
DROP POLICY IF EXISTS "day offs update by store" ON public.staff_day_offs;
DROP POLICY IF EXISTS "day offs delete by store" ON public.staff_day_offs;
CREATE POLICY "day offs insert by store" ON public.staff_day_offs FOR INSERT TO authenticated
  WITH CHECK (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'dayoff.write'));
CREATE POLICY "day offs update by store" ON public.staff_day_offs FOR UPDATE TO authenticated
  USING (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'dayoff.write'))
  WITH CHECK (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'dayoff.write'));
CREATE POLICY "day offs delete by store" ON public.staff_day_offs FOR DELETE TO authenticated
  USING (shop_id IS NOT NULL AND public.can_write_scoped(shop_id, 'dayoff.write'));

-- shops
DROP POLICY IF EXISTS "shops write by access scope" ON public.shops;
DROP POLICY IF EXISTS "shops update by access scope" ON public.shops;
DROP POLICY IF EXISTS "shops delete by access scope" ON public.shops;
CREATE POLICY "shops write by access scope" ON public.shops FOR INSERT TO authenticated
  WITH CHECK (public.can_write_scoped(id, 'shop.write'));
CREATE POLICY "shops update by access scope" ON public.shops FOR UPDATE TO authenticated
  USING (public.can_write_scoped(id, 'shop.write'))
  WITH CHECK (public.can_write_scoped(id, 'shop.write'));
CREATE POLICY "shops delete by access scope" ON public.shops FOR DELETE TO authenticated
  USING (public.can_write_scoped(id, 'shop.write'));

-- staff_profiles（保留本人自助写入）
DROP POLICY IF EXISTS "staff insert by access scope" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff update by access scope" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff delete by access scope" ON public.staff_profiles;
CREATE POLICY "staff insert by access scope" ON public.staff_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.can_write_scoped(shop_id, 'staff.write'));
CREATE POLICY "staff update by access scope" ON public.staff_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.can_write_scoped(shop_id, 'staff.write'))
  WITH CHECK (auth.uid() = user_id OR public.can_write_scoped(shop_id, 'staff.write'));
CREATE POLICY "staff delete by access scope" ON public.staff_profiles FOR DELETE TO authenticated
  USING (public.can_write_scoped(shop_id, 'staff.write'));