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
  IF uid IS NULL OR scope_value IS DISTINCT FROM 'hq' AND scope_value IS DISTINCT FROM 'store' THEN
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

  -- 休息只以"明确写给本人的当日休息记录"为准；
  -- 不再由任意授权门店/全局 shop_holidays.full_staff_off 推断本人休息。
  SELECT EXISTS (
    SELECT 1 FROM public.staff_day_offs d
    WHERE d.user_id = uid AND d.off_date = local_today
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