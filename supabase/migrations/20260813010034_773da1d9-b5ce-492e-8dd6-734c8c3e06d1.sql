-- Collapse the authenticated app-start queries into one RLS-preserving RPC.
-- SECURITY INVOKER is intentional: every table keeps enforcing its existing policy.
CREATE OR REPLACE FUNCTION public.app_bootstrap_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'work_date', ss.work_date,
    'shift_code', ss.shift_code
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
    'encouragement', encouragement_value
  );
END;
$$;

-- Lovable/Supabase may install explicit default grants in addition to PUBLIC.
REVOKE ALL ON FUNCTION public.app_bootstrap_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_bootstrap_v1() TO authenticated;

CREATE INDEX IF NOT EXISTS activities_active_starts_idx
  ON public.activities (starts_at DESC, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS operation_okrs_shop_period_idx
  ON public.operation_okrs (shop_id, period_start, period_end, created_at DESC);

CREATE INDEX IF NOT EXISTS shop_shifts_shop_active_sort_idx
  ON public.shop_shifts (shop_id, active, sort_order);

CREATE INDEX IF NOT EXISTS products_creator_created_idx
  ON public.products (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_user_created_idx
  ON public.community_posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS task_claims_user_date_idx
  ON public.task_claims (user_id, claim_date);