
-- 1) additive columns (tombstone + lease metadata)
ALTER TABLE public.erp_user_links
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'erp_user_links_link_status_chk'
  ) THEN
    ALTER TABLE public.erp_user_links
      ADD CONSTRAINT erp_user_links_link_status_chk CHECK (link_status IN ('active','revoked'));
  END IF;
END $$;

-- 2) push nonce replay protection
CREATE TABLE IF NOT EXISTS public.erp_scope_push_nonces (
  nonce text PRIMARY KEY,
  erp_user_id uuid,
  seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.erp_scope_push_nonces TO service_role;
ALTER TABLE public.erp_scope_push_nonces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_scope_push_nonces_no_client_access" ON public.erp_scope_push_nonces;
CREATE POLICY "erp_scope_push_nonces_no_client_access"
  ON public.erp_scope_push_nonces FOR SELECT USING (false);
CREATE INDEX IF NOT EXISTS erp_scope_push_nonces_seen_at_idx ON public.erp_scope_push_nonces (seen_at);

-- 3) lease flag (disabled for now)
INSERT INTO public.app_settings (key, value)
VALUES ('erp_scope_lease', jsonb_build_object('enabled', false, 'seconds', 60))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.erp_scope_lease_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'erp_scope_lease'),
    jsonb_build_object('enabled', false, 'seconds', 60)
  );
$$;

-- 4) atomic mirror update (service role only, never inserts a new binding)
CREATE OR REPLACE FUNCTION public.erp_apply_scope_mirror_v1(
  _erp_user_id uuid,
  _payload jsonb,
  _mode text DEFAULT 'pull'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur RECORD;
  in_version bigint;
  in_revoked boolean;
  in_active boolean;
  in_roles text[];
  in_perms text[];
  in_shops jsonb;
  same_payload boolean;
BEGIN
  IF _mode NOT IN ('pull','push') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_mode');
  END IF;

  SELECT * INTO cur FROM public.erp_user_links WHERE erp_user_id = _erp_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- never create a binding from a scope payload
    RETURN jsonb_build_object('ok', false, 'code', 'no_mapping');
  END IF;

  in_version := COALESCE((_payload ->> 'scope_version')::bigint, 0);
  in_revoked := COALESCE((_payload ->> 'revoked')::boolean, false);
  in_active  := COALESCE((_payload ->> 'active')::boolean, true);
  in_roles := COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(_payload -> 'roles', '[]'::jsonb)) x),
    '{}'::text[]);
  in_perms := COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(_payload -> 'permissions', '[]'::jsonb)) x),
    '{}'::text[]);
  in_shops := COALESCE(_payload -> 'shops', '[]'::jsonb);

  IF in_version < COALESCE(cur.scope_version, 0) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_version',
      'current_version', COALESCE(cur.scope_version, 0));
  END IF;

  same_payload := (
    COALESCE(cur.roles,'{}'::text[]) = in_roles
    AND COALESCE(cur.permissions,'{}'::text[]) = in_perms
    AND COALESCE(cur.shops,'[]'::jsonb) = in_shops
    AND (cur.link_status = 'revoked') = (in_revoked OR NOT in_active)
  );

  IF in_version = COALESCE(cur.scope_version, 0) THEN
    IF NOT same_payload THEN
      RETURN jsonb_build_object('ok', false, 'code', 'version_conflict',
        'current_version', COALESCE(cur.scope_version, 0));
    END IF;
    IF _mode = 'push' THEN
      -- duplicate push must not extend the lease
      RETURN jsonb_build_object('ok', true, 'code', 'noop_same_version',
        'lease_renewed', false, 'scope_version', COALESCE(cur.scope_version, 0));
    END IF;
    -- trusted pull re-verified the same version: renew lease only
    UPDATE public.erp_user_links
      SET scope_synced_at = now(), sync_error = NULL, updated_at = now()
      WHERE erp_user_id = _erp_user_id;
    RETURN jsonb_build_object('ok', true, 'code', 'lease_renewed',
      'lease_renewed', true, 'scope_version', COALESCE(cur.scope_version, 0));
  END IF;

  -- in_version > current
  IF cur.link_status = 'revoked' AND NOT (in_revoked OR NOT in_active) THEN
    -- restoring a tombstone requires a strictly newer trusted version (satisfied here)
    NULL;
  END IF;

  UPDATE public.erp_user_links
    SET roles = in_roles,
        permissions = in_perms,
        shops = in_shops,
        scope_version = in_version,
        link_status = CASE WHEN (in_revoked OR NOT in_active) THEN 'revoked' ELSE 'active' END,
        revoked_at = CASE WHEN (in_revoked OR NOT in_active) THEN COALESCE(cur.revoked_at, now()) ELSE NULL END,
        scope_synced_at = now(),
        sync_error = NULL,
        updated_at = now()
    WHERE erp_user_id = _erp_user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'applied',
    'lease_renewed', true, 'scope_version', in_version,
    'link_status', CASE WHEN (in_revoked OR NOT in_active) THEN 'revoked' ELSE 'active' END);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_apply_scope_mirror_v1(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_apply_scope_mirror_v1(uuid, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.erp_mark_scope_sync_error_v1(_erp_user_id uuid, _error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.erp_user_links
     SET sync_error = left(COALESCE(_error, 'sync_failed'), 200), updated_at = now()
   WHERE erp_user_id = _erp_user_id;
$$;
REVOKE ALL ON FUNCTION public.erp_mark_scope_sync_error_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_mark_scope_sync_error_v1(uuid, text) TO service_role;

-- 5) scope resolution: tombstone awareness + strict new shops contract + (disabled) lease
CREATE OR REPLACE FUNCTION public.current_user_erp_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  match_count int := 0;
  link_roles text[];
  link_shops jsonb;
  link_status text;
  link_synced timestamptz;
  scope_value text := 'unconfigured';
  shop_ids uuid[] := ARRAY[]::uuid[];
  requested uuid[] := ARRAY[]::uuid[];
  bad_count int := 0;
  new_contract_count int := 0;
  total_shops int := 0;
  governed boolean := false;
  lease jsonb;
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

  SELECT l.roles, l.shops, l.link_status, l.scope_synced_at
    INTO link_roles, link_shops, link_status, link_synced
  FROM public.erp_user_links l WHERE l.aigc_user_id = uid;

  IF COALESCE(link_status,'active') = 'revoked' THEN
    RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,'role_codes','[]'::jsonb,
      'erp_linked',false,'erp_governed',true,'reason','mapping_revoked');
  END IF;

  lease := public.erp_scope_lease_config();
  IF COALESCE((lease ->> 'enabled')::boolean, false) THEN
    IF link_synced IS NULL
       OR link_synced < now() - make_interval(secs => COALESCE((lease ->> 'seconds')::int, 60)) THEN
      RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
        'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
        'erp_linked', true, 'erp_governed', true, 'reason','scope_stale');
    END IF;
  END IF;

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

      SELECT count(*)::int INTO total_shops FROM jsonb_array_elements(link_shops) e;
      SELECT count(*)::int INTO new_contract_count
      FROM jsonb_array_elements(link_shops) e
      WHERE jsonb_typeof(e) = 'object' AND (e ? 'go_shop_id');

      IF new_contract_count > 0 THEN
        -- strict new contract: every element must be fully valid
        SELECT count(*)::int INTO bad_count
        FROM jsonb_array_elements(link_shops) e
        WHERE jsonb_typeof(e) <> 'object'
           OR COALESCE(e ->> 'go_shop_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR COALESCE(e ->> 'erp_location_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

        IF bad_count > 0 THEN
          RETURN jsonb_build_object('scope','unconfigured','shop_ids','[]'::jsonb,
            'role_codes', to_jsonb(COALESCE(link_roles,'{}'::text[])),
            'erp_linked', true, 'erp_governed', true, 'reason','invalid_shop_mapping');
        END IF;

        SELECT COALESCE(array_agg(DISTINCT (e ->> 'go_shop_id')::uuid), ARRAY[]::uuid[]) INTO requested
        FROM jsonb_array_elements(link_shops) e;
      ELSE
        -- legacy contract, unchanged behaviour
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
      END IF;

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
