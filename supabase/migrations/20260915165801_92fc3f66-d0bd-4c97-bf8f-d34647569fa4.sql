ALTER TABLE public.phone_login_otp
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'login',
  ADD COLUMN IF NOT EXISTS ip_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phone_login_otp_purpose_chk'
  ) THEN
    ALTER TABLE public.phone_login_otp
      ADD CONSTRAINT phone_login_otp_purpose_chk
      CHECK (purpose IN ('login', 'register', 'bind'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_login_otp_lookup
  ON public.phone_login_otp (phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_login_otp_ip
  ON public.phone_login_otp (ip_hash, created_at DESC);

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

  PERFORM pg_advisory_xact_lock(hashtextextended(_purpose || ':' || _phone, 0));

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

CREATE OR REPLACE FUNCTION public.consume_phone_otp_v1(
  _phone text,
  _purpose text,
  _code_hash text,
  _max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.phone_login_otp%ROWTYPE;
BEGIN
  IF _phone IS NULL OR _phone !~ '^1[3-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_phone');
  END IF;
  IF _purpose IS NULL OR _purpose NOT IN ('login', 'register', 'bind') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_purpose');
  END IF;

  SELECT * INTO r
  FROM public.phone_login_otp
  WHERE phone = _phone
    AND purpose = _purpose
    AND used_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'otp_expired');
  END IF;

  IF r.attempts >= _max_attempts THEN
    RETURN jsonb_build_object('ok', false, 'code', 'otp_too_many_attempts');
  END IF;

  IF r.code_hash IS DISTINCT FROM _code_hash THEN
    UPDATE public.phone_login_otp
    SET attempts = attempts + 1
    WHERE id = r.id;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'otp_invalid',
      'attempts_left', GREATEST(_max_attempts - (r.attempts + 1), 0)
    );
  END IF;

  UPDATE public.phone_login_otp
  SET used_at = now()
  WHERE id = r.id AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'otp_already_used');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'otp_consumed');
END;
$$;

REVOKE ALL ON FUNCTION public.issue_phone_otp_v1(text, text, text, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_phone_otp_v1(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_phone_otp_v1(text, text, text, text, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_phone_otp_v1(text, text, text, integer) TO service_role;