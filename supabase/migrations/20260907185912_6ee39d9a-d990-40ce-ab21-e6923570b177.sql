-- Additive replacement of app_bootstrap_v1 only. No account, role, mapping,
-- scope, or lease records are changed; never-governed legacy logic is unchanged.
CREATE OR REPLACE FUNCTION public.app_bootstrap_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public','pg_temp'
AS $$
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
  scope_ctx jsonb;
  erp_governed boolean := false;
  erp_roles text[] := ARRAY[]::text[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND COALESCE(ur.suspended,false) = true
  ) INTO suspended_any;

  scope_ctx := public.current_user_erp_scope();
  erp_governed := COALESCE((scope_ctx ->> 'erp_governed')::boolean, false)
                  OR COALESCE((scope_ctx ->> 'erp_linked')::boolean, false);

  IF erp_governed THEN
    -- A stale/revoked mirror can retain diagnostic role_codes. They are not
    -- active authority and must never become operation roles in bootstrap.
    IF COALESCE(scope_ctx ->> 'scope', 'unconfigured') NOT IN ('hq', 'shop', 'store')
       OR suspended_any THEN
      role_codes := ARRAY[]::text[];
      legacy_role := 'anchor';
    ELSE
      SELECT COALESCE(array_agg(x), ARRAY[]::text[]) INTO erp_roles
      FROM jsonb_array_elements_text(COALESCE(scope_ctx -> 'role_codes','[]'::jsonb)) x;

      role_codes := erp_roles;
      IF array_length(role_codes,1) IS NULL THEN
        role_codes := ARRAY['staff']::text[];
      END IF;
      legacy_role := CASE WHEN erp_roles && ARRAY['super_admin'] THEN 'admin' ELSE 'anchor' END;

      IF NOT suspended_any THEN
        SELECT COALESCE(jsonb_agg(DISTINCT k), '[]'::jsonb) INTO permission_rows
        FROM unnest(public.erp_action_permissions()) k;
      END IF;
    END IF;
  ELSE
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

    IF NOT suspended_any THEN
      SELECT COALESCE(jsonb_agg(DISTINCT arp.permission_key), '[]'::jsonb)
      INTO permission_rows
      FROM public.app_role_permissions arp
      WHERE arp.role_code = ANY(role_codes);
    END IF;
  END IF;

  primary_role_code := CASE
    WHEN erp_governed AND scope_ctx ->> 'scope' = 'hq'
         AND role_codes && ARRAY['super_admin']::text[] THEN 'super_admin'
    ELSE role_codes[1]
  END;

  role_row := jsonb_build_object(
    'role', legacy_role,
    'role_code', primary_role_code,
    'role_codes', to_jsonb(role_codes),
    'suspended', suspended_any,
    'source', CASE WHEN erp_governed THEN 'erp' ELSE 'legacy' END
  );

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
$$;

REVOKE ALL ON FUNCTION public.app_bootstrap_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_bootstrap_v1() TO authenticated;
