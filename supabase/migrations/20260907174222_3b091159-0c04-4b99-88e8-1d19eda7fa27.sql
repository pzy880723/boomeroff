-- 统一的读/动作判定：已治理 -> ERP 权威；从未治理的过渡账号 -> 原旧权限
CREATE OR REPLACE FUNCTION public.scoped_has_action(_perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.erp_is_governed() OR public.erp_scope_active() THEN public.erp_has_action(_perm)
    WHEN public.legacy_transition_active() THEN public.user_has_permission(auth.uid(), _perm)
    ELSE false
  END
$$;

GRANT EXECUTE ON FUNCTION public.scoped_has_action(text) TO authenticated;

-- 本轮受影响的排班/休息读取 RLS
DROP POLICY IF EXISTS "schedules read by store" ON public.shift_schedules;
CREATE POLICY "schedules read by store" ON public.shift_schedules
FOR SELECT USING (
  user_id = auth.uid()
  OR (
    shop_id = ANY (public.erp_authorized_shop_ids())
    AND (
      public.is_hq_user()
      OR public.scoped_has_action('schedule.view_shop')
      OR public.scoped_has_action('staff.read')
    )
  )
  OR public.legacy_transition_admin()
  OR (shop_id = public.legacy_transition_shop_id() AND public.user_has_permission(auth.uid(),'staff.read'))
);

DROP POLICY IF EXISTS "day offs read by store" ON public.staff_day_offs;
CREATE POLICY "day offs read by store" ON public.staff_day_offs
FOR SELECT USING (
  user_id = auth.uid()
  OR (
    shop_id = ANY (public.erp_authorized_shop_ids())
    AND (public.is_hq_user() OR public.scoped_has_action('staff.read'))
  )
  OR public.legacy_transition_admin()
  OR (shop_id = public.legacy_transition_shop_id() AND public.user_has_permission(auth.uid(),'staff.read'))
);

-- 只读排班 RPC 的 can_view_shop 同源
CREATE OR REPLACE FUNCTION public.list_shift_schedules_v1(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _shop_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
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
    OR public.scoped_has_action('schedule.view_shop')
    OR public.scoped_has_action('staff.read');

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