-- ============ 0) ERP 管辖登记（撤销/停用不得回落 legacy） ============
CREATE TABLE IF NOT EXISTS public.erp_governed_users (
  user_id uuid PRIMARY KEY,
  first_linked_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.erp_governed_users TO service_role;
ALTER TABLE public.erp_governed_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp governed self read" ON public.erp_governed_users;
CREATE POLICY "erp governed self read" ON public.erp_governed_users FOR SELECT
TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.erp_governed_users TO authenticated;

INSERT INTO public.erp_governed_users (user_id)
SELECT DISTINCT l.aigc_user_id FROM public.erp_user_links l
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.erp_governed_users_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.erp_governed_users (user_id)
  VALUES (NEW.aigc_user_id)
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_governed_users_track ON public.erp_user_links;
CREATE TRIGGER trg_erp_governed_users_track
AFTER INSERT OR UPDATE ON public.erp_user_links
FOR EACH ROW EXECUTE FUNCTION public.erp_governed_users_track();

-- 是否曾/正被 ERP 管辖（撤销后仍为 true，禁止回落 legacy）
CREATE OR REPLACE FUNCTION public.erp_is_governed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.erp_governed_users g WHERE g.user_id = auth.uid()
  )
$$;

-- 任一角色停用即停用
CREATE OR REPLACE FUNCTION public.account_suspended()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND COALESCE(ur.suspended,false) = true
  )
$$;

REVOKE ALL ON FUNCTION public.erp_is_governed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.account_suspended() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_is_governed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_suspended() TO authenticated, service_role;

-- ============ 1) ERP 范围：只认 aigc_user_id，歧义拒绝，取消邮箱兜底 ============
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
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
    FROM public.shops s
    WHERE s.id IN (
      SELECT (e->>'id')::uuid
      FROM jsonb_array_elements(COALESCE(link_shops,'[]'::jsonb)) e
      WHERE (e->>'id') ~ '^[0-9a-f-]{36}$'
    );
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

-- ============ 2) 今日上下文：HQ 永远 effective_shop = null ============
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
      AND (h.shop_id IS NULL OR h.shop_id = ANY(shop_ids))
  ) INTO is_rest;

  IF scope_value = 'hq' THEN
    -- 总部永不降级为门店身份
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

-- ============ 3) 排班只读：UNION 休息行、稳定排序、重复自查 ============
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

  IF scope_value <> 'unconfigured' THEN
    can_view_shop := (scope_value = 'hq')
      OR public.user_has_permission(uid, 'schedule.view_shop')
      OR public.user_has_permission(uid, 'staff.read');
  END IF;

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
      false AS is_rest,
      ss.id AS row_id
    FROM public.shift_schedules ss
    LEFT JOIN public.shops sh ON sh.id = ss.shop_id
    LEFT JOIN public.staff_profiles sp ON sp.user_id = ss.user_id
    LEFT JOIN public.profiles pr ON pr.user_id = ss.user_id
    LEFT JOIN public.shop_shifts sd ON sd.code = ss.shift_code AND sd.shop_id = ss.shop_id
    WHERE ss.work_date BETWEEN d_from AND d_to
      AND (
        ss.user_id = uid
        OR (can_view_shop AND ss.shop_id IS NOT NULL AND ss.shop_id = ANY(shop_ids))
      )
      AND (_shop_id IS NULL OR ss.shop_id = _shop_id)
  ),
  -- 同一 user/date 只保留一条工作行（冲突另行报告）
  work_dedup AS (
    SELECT DISTINCT ON (work_date, user_id) *
    FROM work
    ORDER BY work_date, user_id, shop_name NULLS LAST, shift_code, row_id
  ),
  conflicts AS (
    SELECT work_date, user_id, count(*)::int AS cnt,
           jsonb_agg(DISTINCT shop_id) AS shop_ids
    FROM work
    GROUP BY work_date, user_id
    HAVING count(*) > 1
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
      true AS is_rest,
      d.id AS row_id
    FROM public.staff_day_offs d
    LEFT JOIN public.shops sh ON sh.id = d.shop_id
    LEFT JOIN public.staff_profiles sp ON sp.user_id = d.user_id
    LEFT JOIN public.profiles pr ON pr.user_id = d.user_id
    WHERE d.off_date BETWEEN d_from AND d_to
      AND (
        d.user_id = uid
        OR (can_view_shop AND d.shop_id IS NOT NULL AND d.shop_id = ANY(shop_ids))
      )
      AND (_shop_id IS NULL OR d.shop_id = _shop_id)
      AND NOT EXISTS (
        SELECT 1 FROM work_dedup w
        WHERE w.user_id = d.user_id AND w.work_date = d.off_date
      )
  ),
  rest_dedup AS (
    SELECT DISTINCT ON (work_date, user_id) * FROM rest
    ORDER BY work_date, user_id, row_id
  ),
  merged AS (
    SELECT * FROM work_dedup
    UNION ALL
    SELECT * FROM rest_dedup
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_date', m.work_date,
        'shop_id', m.shop_id,
        'shop_name', m.shop_name,
        'user_id', m.user_id,
        'display_name', m.display_name,
        'shift_code', m.shift_code,
        'shift_name', m.shift_name,
        'start_time', m.start_time,
        'end_time', m.end_time,
        'source', m.source,
        'is_self', (m.user_id = uid),
        'is_rest', m.is_rest
      ) ORDER BY m.work_date, m.user_id, m.shop_name NULLS LAST)
      FROM merged m
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_date', c.work_date, 'user_id', c.user_id,
        'count', c.cnt, 'shop_ids', c.shop_ids
      ) ORDER BY c.work_date, c.user_id)
      FROM conflicts c
    ), '[]'::jsonb)
  INTO rows_json, conflicts_json;

  RETURN jsonb_build_object(
    'date', local_today,
    'from', d_from,
    'to', d_to,
    'scope', scope_value,
    'can_view_shop', can_view_shop,
    'rows', rows_json,
    'conflicts', conflicts_json
  );
END;
$function$;

-- ============ 4) app_bootstrap_v1：有效店取自 shop_context；停用取 ANY ============
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
  role_codes text[] := ARRAY[]::text[];
  primary_role_code text;
  legacy_role text;
  suspended_any boolean := false;
  permission_rows jsonb := '[]'::jsonb;
  profile_row jsonb;
  staff_row jsonb;
  effective_shop_id uuid;
  scope_value text;
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

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND COALESCE(ur.suspended,false) = true
  ) INTO suspended_any;

  SELECT COALESCE(array_agg(DISTINCT ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), ARRAY[]::text[])
  INTO role_codes
  FROM public.user_roles ur
  WHERE ur.user_id = uid AND COALESCE(ur.suspended,false) = false;

  SELECT ur.role::text INTO legacy_role
  FROM public.user_roles ur
  WHERE ur.user_id = uid
  ORDER BY ur.created_at
  LIMIT 1;

  IF array_length(role_codes,1) IS NULL THEN
    role_codes := ARRAY['staff']::text[];
  END IF;
  primary_role_code := role_codes[1];

  role_row := jsonb_build_object(
    'role', legacy_role,
    'role_code', primary_role_code,
    'role_codes', to_jsonb(role_codes),
    'suspended', suspended_any
  );

  IF NOT suspended_any THEN
    SELECT COALESCE(jsonb_agg(DISTINCT arp.permission_key), '[]'::jsonb)
    INTO permission_rows
    FROM public.app_role_permissions arp
    WHERE arp.role_code = ANY(role_codes);
  END IF;

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
  )
  INTO staff_row
  FROM public.staff_profiles sp
  WHERE sp.user_id = uid;

  shop_context_row := public.current_shop_context_v1();
  scope_value := shop_context_row ->> 'scope';
  effective_shop_id := NULLIF(shop_context_row #>> '{effective_shop,id}', '')::uuid;

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
    AND (
      s.shop_id IS NULL
      OR (effective_shop_id IS NOT NULL AND s.shop_id = effective_shop_id)
    );

  SELECT EXISTS (
    SELECT 1 FROM public.user_check_ins ci
    WHERE ci.user_id = uid AND ci.check_in_date = local_today
  ) INTO checked_today_value;

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
      effective_shop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles creator
        WHERE creator.user_id = a.created_by
          AND creator.shop_id = effective_shop_id
      )
    )
  ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1;

  IF effective_shop_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(o)::jsonb ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO okr_rows
    FROM (
      SELECT id, title, objective, key_results, tags, created_at
      FROM public.operation_okrs
      WHERE shop_id = effective_shop_id
        AND period_start <= local_today
        AND period_end >= local_today
      ORDER BY created_at DESC
      LIMIT 3
    ) o;
  ELSIF scope_value = 'hq' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(o)::jsonb ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO okr_rows
    FROM (
      SELECT id, title, objective, key_results, tags, created_at
      FROM public.operation_okrs
      WHERE (scope = 'brand' OR shop_id IS NULL)
        AND period_start <= local_today
        AND period_end >= local_today
      ORDER BY created_at DESC
      LIMIT 3
    ) o;
  END IF;

  SELECT de.text INTO encouragement_value
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

-- ============ 5) 读取 RLS：ERP 为唯一权威，去掉 legacy admin / 固定门店 ============
DROP POLICY IF EXISTS "shops read by access scope" ON public.shops;
CREATE POLICY "shops read by access scope" ON public.shops FOR SELECT
USING (id = ANY(public.erp_authorized_shop_ids()));

DROP POLICY IF EXISTS "shifts read by store" ON public.shop_shifts;
CREATE POLICY "shifts read by store" ON public.shop_shifts FOR SELECT
USING (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));

DROP POLICY IF EXISTS "schedules read by store" ON public.shift_schedules;
CREATE POLICY "schedules read by store" ON public.shift_schedules FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    shop_id = ANY(public.erp_authorized_shop_ids())
    AND (public.is_hq_user()
      OR user_has_permission(auth.uid(), 'schedule.view_shop'::text)
      OR user_has_permission(auth.uid(), 'staff.read'::text))
  )
);

DROP POLICY IF EXISTS "kb entries read by store" ON public.shop_kb_entries;
CREATE POLICY "kb entries read by store" ON public.shop_kb_entries FOR SELECT
USING (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));

DROP POLICY IF EXISTS "kb cats read by store" ON public.shop_kb_categories;
CREATE POLICY "kb cats read by store" ON public.shop_kb_categories FOR SELECT
USING (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));

DROP POLICY IF EXISTS "holidays read by store" ON public.shop_holidays;
CREATE POLICY "holidays read by store" ON public.shop_holidays FOR SELECT
USING (shop_id IS NULL OR shop_id = ANY(public.erp_authorized_shop_ids()));

DROP POLICY IF EXISTS "day offs read by store" ON public.staff_day_offs;
CREATE POLICY "day offs read by store" ON public.staff_day_offs FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    shop_id = ANY(public.erp_authorized_shop_ids())
    AND (public.is_hq_user() OR user_has_permission(auth.uid(), 'staff.read'::text))
  )
);

DROP POLICY IF EXISTS "staff read self admin or same shop staff reader" ON public.staff_profiles;
CREATE POLICY "staff read self admin or same shop staff reader" ON public.staff_profiles FOR SELECT
USING (
  auth.uid() = user_id
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
  OR shop_id = ANY(public.erp_authorized_shop_ids())
);
