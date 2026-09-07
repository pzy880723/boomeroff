-- 1) ERP 角色 -> 动作权限映射（权威来源，不再回落旧 GO 角色）
CREATE OR REPLACE FUNCTION public.erp_action_permissions()
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  ctx jsonb;
  roles text[] := ARRAY[]::text[];
  erp_perms text[] := ARRAY[]::text[];
  result text[] := ARRAY[]::text[];
BEGIN
  IF uid IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  ctx := public.current_user_erp_scope();
  IF COALESCE(ctx ->> 'scope','unconfigured') NOT IN ('hq','store') THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT COALESCE(l.roles,'{}'::text[]), COALESCE(l.permissions,'{}'::text[])
  INTO roles, erp_perms
  FROM public.erp_user_links l WHERE l.aigc_user_id = uid;

  IF roles && ARRAY['super_admin'] THEN
    SELECT COALESCE(array_agg(p.key), ARRAY[]::text[]) INTO result FROM public.app_permissions p;
    RETURN result;
  END IF;

  IF roles && ARRAY['hq','headquarter','hq_operator'] THEN
    result := ARRAY['schedule.view_self','schedule.view_shop','shop.read','staff.read',
                    'knowledge.official.read','shop.kb.read'];
  ELSE
    result := ARRAY['schedule.view_self','recognition.use','community.post',
                    'knowledge.personal.write','knowledge.official.read','shop.kb.read'];
  END IF;

  -- ERP 显式下发的权限（仅当它是已知权限键时生效；aigc_access 等非动作标记自动忽略）
  SELECT COALESCE(array_agg(DISTINCT k), ARRAY[]::text[]) INTO result
  FROM (
    SELECT unnest(result) AS k
    UNION
    SELECT p.key FROM public.app_permissions p WHERE p.key = ANY(erp_perms)
  ) u;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_has_action(_perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT _perm = ANY(public.erp_action_permissions())
$$;

-- 2) 写权限：ERP 治理路径完全不看旧 GO 角色
CREATE OR REPLACE FUNCTION public.can_write_scoped(_shop uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT
    (
      public.erp_scope_active()
      AND (_shop IS NULL OR _shop = ANY(public.erp_authorized_shop_ids()))
      AND public.erp_has_action(_perm)
    )
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
$$;

-- 3) scope：补 hq_operator；门店映射严格 fail-closed（含非法元素 / 未知或停用门店）
CREATE OR REPLACE FUNCTION public.current_user_erp_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  match_count int := 0;
  link_roles text[];
  link_shops jsonb;
  scope_value text := 'unconfigured';
  shop_ids uuid[] := ARRAY[]::uuid[];
  requested uuid[] := ARRAY[]::uuid[];
  bad_count int := 0;
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

  IF COALESCE(link_roles,'{}'::text[]) && ARRAY['super_admin','hq','headquarter','hq_operator'] THEN
    scope_value := 'hq';
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
    FROM public.shops s WHERE s.active = true;
    IF array_length(shop_ids,1) IS NULL THEN
      shop_ids := ARRAY[]::uuid[];
    END IF;
  ELSE
    BEGIN
      IF link_shops IS NULL OR jsonb_typeof(link_shops) <> 'array' THEN
        RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
          'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
          'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
      END IF;

      -- 任意一个元素结构非法 => 整份映射失效
      SELECT count(*)::int INTO bad_count
      FROM jsonb_array_elements(link_shops) e
      WHERE jsonb_typeof(e) <> 'object'
         OR COALESCE(e ->> 'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      IF bad_count > 0 THEN
        RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
          'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
          'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
      END IF;

      SELECT COALESCE(array_agg(DISTINCT (e ->> 'id')::uuid), ARRAY[]::uuid[]) INTO requested
      FROM jsonb_array_elements(link_shops) e;

      SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO shop_ids
      FROM public.shops s
      WHERE s.id = ANY(requested) AND s.active = true;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
    END;

    IF array_length(requested,1) IS NULL THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','no_authorized_shop');
    END IF;

    -- 引用了未知 / 已停用门店 => 严格 fail closed，不静默缩权限
    IF COALESCE(array_length(shop_ids,1),0) <> array_length(requested,1) THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
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
$$;

-- 4) bootstrap：已治理账号的 user_role / permissions 全部来自 ERP
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

  primary_role_code := role_codes[1];

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

GRANT EXECUTE ON FUNCTION public.erp_action_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_has_action(text) TO authenticated;