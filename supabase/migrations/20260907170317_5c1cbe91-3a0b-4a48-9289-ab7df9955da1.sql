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

  SELECT count(*)::int INTO sched_count
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid AND ss.work_date = local_today AND ss.shop_id = ANY(shop_ids);

  SELECT ss.shop_id INTO sched_shop
  FROM public.shift_schedules ss
  WHERE ss.user_id = uid AND ss.work_date = local_today AND ss.shop_id = ANY(shop_ids)
  LIMIT 1;

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
REVOKE ALL ON FUNCTION public.current_shop_context_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_shop_context_v1() TO authenticated;