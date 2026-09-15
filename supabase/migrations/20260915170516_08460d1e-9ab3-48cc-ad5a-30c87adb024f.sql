CREATE OR REPLACE FUNCTION public.issue_phone_otp_v1(
  _phone text,
  _purpose text,
  _code_hash text,
  _ip_hash text DEFAULT NULL,
  _ttl_seconds integer DEFAULT 300,
  _cooldown_seconds integer DEFAULT 60,
  _phone_hourly_cap integer DEFAULT 5,
  _ip_hourly_cap integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _last timestamptz;
  _phone_count integer;
  _ip_count integer;
  _exp timestamptz;
  _id uuid;
BEGIN
  IF _phone IS NULL OR _phone !~ '^1[3-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_phone');
  END IF;
  IF _purpose IS NULL OR _purpose NOT IN ('login', 'register', 'bind') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_purpose');
  END IF;
  IF _code_hash IS NULL OR length(_code_hash) <> 64 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_code_hash');
  END IF;

  -- 固定加锁顺序，避免死锁；锁范围与各自计数范围一致：
  -- 1) 手机号（跨用途，对应 _phone_hourly_cap）
  PERFORM pg_advisory_xact_lock(hashtextextended('otp:phone:' || _phone, 0));
  -- 2) 手机号 + 用途（对应冷却与旧码作废）
  PERFORM pg_advisory_xact_lock(hashtextextended('otp:phone_purpose:' || _purpose || ':' || _phone, 0));
  -- 3) 来源网络哈希（跨手机号，对应 _ip_hourly_cap）
  IF _ip_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('otp:ip:' || _ip_hash, 0));
  END IF;

  SELECT created_at INTO _last
  FROM public.phone_login_otp
  WHERE phone = _phone AND purpose = _purpose
  ORDER BY created_at DESC
  LIMIT 1;

  IF _last IS NOT NULL AND _last > now() - make_interval(secs => _cooldown_seconds) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'otp_cooldown',
      'retry_after_seconds',
      GREATEST(ceil(extract(epoch FROM (_last + make_interval(secs => _cooldown_seconds) - now())))::int, 1)
    );
  END IF;

  SELECT count(*) INTO _phone_count
  FROM public.phone_login_otp
  WHERE phone = _phone AND created_at > now() - interval '1 hour';
  IF _phone_count >= _phone_hourly_cap THEN
    RETURN jsonb_build_object('ok', false, 'code', 'otp_rate_limited_phone', 'retry_after_seconds', 3600);
  END IF;

  IF _ip_hash IS NOT NULL THEN
    SELECT count(*) INTO _ip_count
    FROM public.phone_login_otp
    WHERE ip_hash = _ip_hash AND created_at > now() - interval '1 hour';
    IF _ip_count >= _ip_hourly_cap THEN
      RETURN jsonb_build_object('ok', false, 'code', 'otp_rate_limited_ip', 'retry_after_seconds', 3600);
    END IF;
  END IF;

  _exp := now() + make_interval(secs => _ttl_seconds);
  INSERT INTO public.phone_login_otp (phone, purpose, code_hash, expires_at, ip_hash)
  VALUES (_phone, _purpose, _code_hash, _exp, _ip_hash)
  RETURNING id INTO _id;

  UPDATE public.phone_login_otp
  SET used_at = now()
  WHERE phone = _phone AND purpose = _purpose AND id <> _id AND used_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'otp_issued',
    'expires_at', _exp,
    'expires_in_seconds', _ttl_seconds,
    'cooldown_seconds', _cooldown_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_phone_otp_v1(text, text, text, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_phone_otp_v1(text, text, text, text, integer, integer, integer, integer) TO service_role;