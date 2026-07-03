
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS real_name text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key
  ON public.profiles(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.phone_login_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_login_otp_phone_idx
  ON public.phone_login_otp(phone, created_at DESC);

GRANT ALL ON public.phone_login_otp TO service_role;
ALTER TABLE public.phone_login_otp ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated -> only service_role via edge functions can access.

CREATE OR REPLACE FUNCTION public.find_user_id_by_phone(_phone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.profiles WHERE phone = _phone LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_phone(text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_my_phone_realname(_phone text, _real_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _phone IS NOT NULL AND _phone <> '' THEN
    IF _phone !~ '^1[3-9][0-9]{9}$' THEN
      RAISE EXCEPTION '手机号格式不正确';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = _phone AND user_id <> uid) THEN
      RAISE EXCEPTION '该手机号已被其他账号占用';
    END IF;
  END IF;
  UPDATE public.profiles
     SET phone = NULLIF(_phone, ''),
         real_name = NULLIF(_real_name, ''),
         updated_at = now()
   WHERE user_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_phone_realname(text, text) TO authenticated;

-- Refresh handle_new_user to also copy phone/real_name from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name, phone, real_name)
    VALUES (
      new.id,
      new.raw_user_meta_data ->> 'display_name',
      NULLIF(new.raw_user_meta_data ->> 'phone', ''),
      NULLIF(new.raw_user_meta_data ->> 'real_name', '')
    )
    ON CONFLICT (user_id) DO UPDATE
      SET phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
          real_name = COALESCE(EXCLUDED.real_name, public.profiles.real_name);

    INSERT INTO public.user_roles (user_id, role, role_code)
    VALUES (new.id, 'anchor', 'staff')
    ON CONFLICT DO NOTHING;

    RETURN new;
END;
$$;
