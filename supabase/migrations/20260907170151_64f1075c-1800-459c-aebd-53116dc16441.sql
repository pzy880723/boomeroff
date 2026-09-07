-- 1) ERP 授权范围（唯一权威）：只读、脱敏
CREATE OR REPLACE FUNCTION public.current_user_erp_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  suspended_any boolean := false;
  link_roles text[];
  link_shops jsonb;
  scope_value text := 'unconfigured';
  shop_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,'erp_linked',false);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND COALESCE(ur.suspended,false) = true
  ) INTO suspended_any;

  IF suspended_any THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,'erp_linked',false,'reason','suspended');
  END IF;

  SELECT l.roles, l.shops
  INTO link_roles, link_shops
  FROM public.erp_user_links l
  WHERE l.aigc_user_id = uid
     OR l.erp_user_id = (
       SELECT (regexp_match(lower(u.email),
         '^erp\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@aigc\.boomeroff\.local$'))[1]::uuid
       FROM auth.users u WHERE u.id = uid
     )
  LIMIT 1;

  IF link_roles IS NULL AND link_shops IS NULL THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,'erp_linked',false,'reason','no_erp_mapping');
  END IF;

  IF COALESCE(link_roles,'{}'::text[]) && ARRAY['super_admin','hq','headquarter'] THEN
    scope_value := 'hq';
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
    FROM public.shops s WHERE s.active = true;
  ELSE
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
    FROM public.shops s
    WHERE s.id IN (
      SELECT (e->>'id')::uuid
      FROM jsonb_array_elements(COALESCE(link_shops,'[]'::jsonb)) e
      WHERE (e->>'id') ~ '^[0-9a-f-]{36}$'
    );
    IF array_length(shop_ids,1) IS NULL THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])), 'erp_linked', true, 'reason','no_authorized_shop');
    END IF;
    scope_value := 'store';
  END IF;

  RETURN jsonb_build_object(
    'scope', scope_value,
    'shop_ids', to_jsonb(shop_ids),
    'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
    'erp_linked', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_authorized_shop_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT array_agg((v)::uuid)
     FROM jsonb_array_elements_text(public.current_user_erp_scope() -> 'shop_ids') v),
    ARRAY[]::uuid[]
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_hq_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (public.current_user_erp_scope() ->> 'scope') = 'hq'
$function$;

-- 2) 今日门店上下文
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
  status_value text;
  sched_count int := 0;
  sched_shop uuid;
  is_rest boolean := false;
BEGIN
  IF uid IS NULL OR scope_value = 'unconfigured' THEN
    RETURN jsonb_build_object(
      'date', local_today, 'scope', 'unconfigured', 'status', 'unconfigured',
      'effective_shop', NULL, 'authorized_shops', '[]'::jsonb,
      'reason', scope_row ->> 'reason'
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::jsonb)
  INTO authorized
  FROM public.shops s WHERE s.id = ANY(shop_ids);

  SELECT count(*), min(ss.shop_id)
  INTO sched_count, sched_shop
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid AND ss.work_date = local_today AND ss.shop_id = ANY(shop_ids);

  SELECT EXISTS (
    SELECT 1 FROM public.staff_day_offs d
    WHERE d.user_id = uid AND d.off_date = local_today
  ) OR EXISTS (
    SELECT 1 FROM public.shop_holidays h
    WHERE h.date = local_today AND h.full_staff_off = true
      AND (h.shop_id IS NULL OR h.shop_id = ANY(shop_ids))
  ) INTO is_rest;

  IF sched_count > 0 AND sched_shop IS NOT NULL THEN
    status_value := 'scheduled';
    SELECT jsonb_build_object('id', s.id, 'name', s.name) INTO eff_shop
    FROM public.shops s WHERE s.id = sched_shop;
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
    'authorized_shops', authorized
  );
END;
$function$;

-- 3) 只读排班查询
CREATE OR REPLACE FUNCTION public.list_shift_schedules_v1(
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _shop_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  local_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  d_from date := COALESCE(_from, (now() AT TIME ZONE 'Asia/Shanghai')::date);
  d_to date := COALESCE(_to, COALESCE(_from, (now() AT TIME ZONE 'Asia/Shanghai')::date));
  scope_row jsonb;
  scope_value text;
  shop_ids uuid[];
  can_view_shop boolean := false;
  rows_json jsonb := '[]'::jsonb;
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

  IF scope_value <> 'unconfigured' THEN
    can_view_shop := (scope_value = 'hq')
      OR public.user_has_permission(uid, 'schedule.view_shop')
      OR public.user_has_permission(uid, 'staff.read');
  END IF;

  IF _shop_id IS NOT NULL AND NOT (_shop_id = ANY(shop_ids)) THEN
    RAISE EXCEPTION 'shop not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'work_date', r->>'shop_name', r->>'shift_code'), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT jsonb_build_object(
      'work_date', ss.work_date,
      'shop_id', ss.shop_id,
      'shop_name', sh.name,
      'user_id', ss.user_id,
      'display_name', COALESCE(sp.real_name, pr.display_name, '同事'),
      'shift_code', ss.shift_code,
      'shift_name', sd.name,
      'start_time', sd.start_time,
      'end_time', sd.end_time,
      'source', ss.source,
      'is_self', (ss.user_id = uid),
      'is_rest', EXISTS (
        SELECT 1 FROM public.staff_day_offs d
        WHERE d.user_id = ss.user_id AND d.off_date = ss.work_date
      )
    ) AS r
    FROM public.shift_schedules ss
    LEFT JOIN public.shops sh ON sh.id = ss.shop_id
    LEFT JOIN public.staff_profiles sp ON sp.user_id = ss.user_id
    LEFT JOIN public.profiles pr ON pr.user_id = ss.user_id
    LEFT JOIN public.shop_shifts sd ON sd.code = ss.shift_code AND sd.shop_id = ss.shop_id
    WHERE ss.work_date BETWEEN d_from AND d_to
      AND (
        ss.user_id = uid
        OR (
          can_view_shop
          AND ss.shop_id IS NOT NULL
          AND ss.shop_id = ANY(shop_ids)
        )
      )
      AND (_shop_id IS NULL OR ss.shop_id = _shop_id)
  ) t;

  RETURN jsonb_build_object(
    'date', local_today,
    'from', d_from,
    'to', d_to,
    'scope', scope_value,
    'can_view_shop', can_view_shop,
    'rows', rows_json
  );
END;
$function$;

-- 4) 供 ERP 侧核验令牌与当前范围（不含敏感字段）
CREATE OR REPLACE FUNCTION public.erp_verify_current_scope_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'scope', 'unconfigured');
  END IF;
  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', uid,
    'is_erp_user', public.is_erp_user(),
    'scope_context', public.current_user_erp_scope(),
    'shop_context', public.current_shop_context_v1()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.current_user_erp_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_authorized_shop_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hq_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_shop_context_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_shift_schedules_v1(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_verify_current_scope_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_verify_current_scope_v1() TO service_role;

-- 5) app_bootstrap_v1：保留原有全部字段，新增 shop_context
CREATE OR REPLACE FUNCTION public.app_bootstrap_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  local_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  local_tomorrow date := ((now() AT TIME ZONE 'Asia/Shanghai')::date + 1);
  role_row jsonb;
  role_code_value text;
  permission_rows jsonb := '[]'::jsonb;
  profile_row jsonb;
  staff_row jsonb;
  current_shop_id uuid;
  schedule_rows jsonb := '[]'::jsonb;
  shift_rows jsonb := '[]'::jsonb;
  checked_today_value boolean := false;
  activity_row jsonb;
  okr_rows jsonb := '[]'::jsonb;
  encouragement_value text;
  shop_context_row jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT jsonb_build_object(
    'role', ur.role,
    'role_code', COALESCE(ur.role_code, CASE WHEN ur.role::text = 'admin' THEN 'super_admin' ELSE 'staff' END),
    'suspended', COALESCE(ur.suspended, false)
  ),
  COALESCE(ur.role_code, CASE WHEN ur.role::text = 'admin' THEN 'super_admin' ELSE 'staff' END)
  INTO role_row, role_code_value
  FROM public.user_roles ur
  WHERE ur.user_id = uid
  ORDER BY ur.created_at
  LIMIT 1;

  role_code_value := COALESCE(role_code_value, 'staff');

  SELECT COALESCE(jsonb_agg(arp.permission_key ORDER BY arp.permission_key), '[]'::jsonb)
  INTO permission_rows
  FROM public.app_role_permissions arp
  WHERE arp.role_code = role_code_value;

  SELECT jsonb_build_object(
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'phone', p.phone
  )
  INTO profile_row
  FROM public.profiles p
  WHERE p.user_id = uid;

  SELECT jsonb_build_object(
    'real_name', sp.real_name,
    'shop_id', sp.shop_id
  ), sp.shop_id
  INTO staff_row, current_shop_id
  FROM public.staff_profiles sp
  WHERE sp.user_id = uid;

  shop_context_row := public.current_shop_context_v1();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'work_date', ss.work_date,
    'shift_code', ss.shift_code,
    'shop_id', ss.shop_id
  ) ORDER BY ss.work_date), '[]'::jsonb)
  INTO schedule_rows
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid
    AND ss.work_date IN (local_today, local_tomorrow);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', s.code,
    'name', s.name,
    'start_time', s.start_time,
    'end_time', s.end_time,
    'color', s.color
  ) ORDER BY s.sort_order, s.start_time), '[]'::jsonb)
  INTO shift_rows
  FROM public.shop_shifts s
  WHERE s.active = true
    AND (s.shop_id IS NULL OR current_shop_id IS NULL OR s.shop_id = current_shop_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.user_check_ins ci
    WHERE ci.user_id = uid AND ci.check_in_date = local_today
  )
  INTO checked_today_value;

  SELECT jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'cover_url', a.cover_url,
    'ends_at', a.ends_at,
    'voucher_id', a.voucher_id
  )
  INTO activity_row
  FROM public.activities a
  WHERE a.status = 'active'
    AND (
      current_shop_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.staff_profiles creator
        WHERE creator.user_id = a.created_by
          AND creator.shop_id = current_shop_id
      )
    )
  ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1;

  IF current_shop_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(o)::jsonb ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO okr_rows
    FROM (
      SELECT id, title, objective, key_results, tags, created_at
      FROM public.operation_okrs
      WHERE shop_id = current_shop_id
        AND period_start <= local_today
        AND period_end >= local_today
      ORDER BY created_at DESC
      LIMIT 3
    ) o;
  END IF;

  SELECT de.text
  INTO encouragement_value
  FROM public.daily_encouragement de
  WHERE de.date = local_today;

  RETURN jsonb_build_object(
    'date', local_today,
    'user_role', role_row,
    'permissions', permission_rows,
    'profile', profile_row,
    'staff_profile', staff_row,
    'shifts', schedule_rows,
    'shift_definitions', shift_rows,
    'checked_today', checked_today_value,
    'activity', activity_row,
    'okrs', okr_rows,
    'encouragement', encouragement_value,
    'shop_context', shop_context_row
  );
END;
$function$;

-- 6) 读取范围：新增 ERP 授权门店条件（不改动既有条件）
DROP POLICY IF EXISTS "shops read by access scope" ON public.shops;
CREATE POLICY "shops read by access scope" ON public.shops FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR id = current_user_shop_id()
  OR id = ANY(public.erp_authorized_shop_ids())
);

DROP POLICY IF EXISTS "shifts read by store" ON public.shop_shifts;
CREATE POLICY "shifts read by store" ON public.shop_shifts FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR shop_id IS NULL
  OR shop_id = current_user_shop_id()
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);

DROP POLICY IF EXISTS "schedules read by store" ON public.shift_schedules;
CREATE POLICY "schedules read by store" ON public.shift_schedules FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (user_has_permission(auth.uid(), 'staff.read'::text) AND shop_id = current_user_shop_id())
  OR (
    shop_id = ANY(public.erp_authorized_shop_ids())
    AND (public.is_hq_user()
      OR user_has_permission(auth.uid(), 'schedule.view_shop'::text)
      OR user_has_permission(auth.uid(), 'staff.read'::text))
  )
);

DROP POLICY IF EXISTS "kb entries read by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries read by store" ON public.shop_kb_entries FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR shop_id IS NULL
  OR shop_id = current_user_shop_id()
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);

DROP POLICY IF EXISTS "kb cats read by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats read by store" ON public.shop_kb_categories FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR shop_id IS NULL
  OR shop_id = current_user_shop_id()
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);

DROP POLICY IF EXISTS "holidays read by store" ON public.shop_holidays;
CREATE POLICY "holidays read by store" ON public.shop_holidays FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR shop_id IS NULL
  OR shop_id = current_user_shop_id()
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);

DROP POLICY IF EXISTS "day offs read by store" ON public.staff_day_offs;
CREATE POLICY "day offs read by store" ON public.staff_day_offs FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (user_has_permission(auth.uid(), 'staff.read'::text) AND shop_id = current_user_shop_id())
  OR (
    shop_id = ANY(public.erp_authorized_shop_ids())
    AND (public.is_hq_user() OR user_has_permission(auth.uid(), 'staff.read'::text))
  )
);

DROP POLICY IF EXISTS "staff read self admin or same shop staff reader" ON public.staff_profiles;
CREATE POLICY "staff read self admin or same shop staff reader" ON public.staff_profiles FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (user_has_permission(auth.uid(), 'staff.read'::text) AND shop_id IS NOT NULL AND shop_id = current_user_shop_id())
  OR (
    shop_id IS NOT NULL
    AND shop_id = ANY(public.erp_authorized_shop_ids())
    AND (public.is_hq_user() OR user_has_permission(auth.uid(), 'staff.read'::text))
  )
);

DROP POLICY IF EXISTS "okrs staff read" ON public.operation_okrs;
CREATE POLICY "okrs staff read" ON public.operation_okrs FOR SELECT
USING (
  scope = 'brand'::text
  OR shop_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = operation_okrs.shop_id
  )
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);