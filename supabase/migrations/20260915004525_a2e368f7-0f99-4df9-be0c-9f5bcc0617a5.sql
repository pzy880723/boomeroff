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
  merged_json jsonb := '[]'::jsonb;
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

  IF scope_value IS DISTINCT FROM 'hq' AND scope_value IS DISTINCT FROM 'store' THEN
    RAISE EXCEPTION 'erp mapping required: %', COALESCE(scope_row ->> 'reason','unconfigured')
      USING ERRCODE = '42501';
  END IF;

  can_view_shop := (scope_value = 'hq')
    OR public.scoped_has_action('schedule.view_shop')
    OR public.scoped_has_action('staff.read');

  IF _shop_id IS NOT NULL AND NOT (_shop_id = ANY(shop_ids)) THEN
    RAISE EXCEPTION 'shop not authorized' USING ERRCODE = '42501';
  END IF;

  -- 第 1 步：把"上班"和"休息"合并成一份中间数据（单条语句内完成）
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
      AND (ss.user_id = uid OR (can_view_shop AND ss.shop_id = ANY(shop_ids)))
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
      AND (d.user_id = uid OR (can_view_shop AND d.shop_id = ANY(shop_ids)))
      AND NOT EXISTS (
        SELECT 1 FROM work w WHERE w.user_id = d.user_id AND w.work_date = d.off_date
      )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  INTO merged_json
  FROM (SELECT * FROM work UNION ALL SELECT * FROM rest) m;

  -- 第 2 步：展示列表（同人同日去重，上班优先）
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
  ) ORDER BY work_date, user_id, shop_name NULLS LAST), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT DISTINCT ON (e.work_date, e.user_id)
      (e.value ->> 'work_date')::date AS work_date,
      NULLIF(e.value ->> 'shop_id','')::uuid AS shop_id,
      e.value ->> 'shop_name' AS shop_name,
      NULLIF(e.value ->> 'user_id','')::uuid AS user_id,
      e.value ->> 'display_name' AS display_name,
      e.value ->> 'shift_code' AS shift_code,
      e.value ->> 'shift_name' AS shift_name,
      NULLIF(e.value ->> 'start_time','')::time AS start_time,
      NULLIF(e.value ->> 'end_time','')::time AS end_time,
      e.value ->> 'source' AS source,
      COALESCE((e.value ->> 'is_rest')::boolean, false) AS is_rest
    FROM (
      SELECT value,
             (value ->> 'work_date')::date AS work_date,
             NULLIF(value ->> 'user_id','')::uuid AS user_id,
             COALESCE((value ->> 'is_rest')::boolean, false) AS is_rest,
             value ->> 'shop_name' AS shop_name
      FROM jsonb_array_elements(merged_json)
    ) e
    ORDER BY e.work_date, e.user_id, e.is_rest ASC, e.shop_name NULLS LAST
  ) deduped;

  -- 第 3 步：同人同日重复（冲突）统计
  SELECT COALESCE(jsonb_agg(jsonb_build_object('work_date', work_date, 'user_id', user_id, 'count', c)
    ORDER BY work_date, user_id), '[]'::jsonb)
  INTO conflicts_json
  FROM (
    SELECT (value ->> 'work_date')::date AS work_date,
           NULLIF(value ->> 'user_id','')::uuid AS user_id,
           count(*) AS c
    FROM jsonb_array_elements(merged_json)
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) x;

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