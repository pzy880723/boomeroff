
-- 1. audit_logs 表
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_role_code text,
  action text NOT NULL,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 任何认证用户可写入 user_id = 自己的记录（登录/操作自记录）
CREATE POLICY "users_insert_own_audit" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 仅具备 user.read 权限的管理员可查看
CREATE POLICY "admin_read_audit" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'user.read'));

-- 2. admin_update_user_phone RPC
CREATE OR REPLACE FUNCTION public.admin_update_user_phone(_user_id uuid, _phone text, _real_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.user_has_permission(uid, 'user.create') OR public.user_has_permission(uid, 'user.suspend')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _phone IS NOT NULL AND _phone <> '' THEN
    IF _phone !~ '^1[3-9][0-9]{9}$' THEN
      RAISE EXCEPTION '手机号格式不正确';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = _phone AND user_id <> _user_id) THEN
      RAISE EXCEPTION '该手机号已被其他账号占用';
    END IF;
  END IF;

  UPDATE public.profiles
     SET phone = NULLIF(_phone, ''),
         real_name = COALESCE(NULLIF(_real_name, ''), real_name),
         updated_at = now()
   WHERE user_id = _user_id;

  IF _real_name IS NOT NULL AND _real_name <> '' THEN
    UPDATE public.staff_profiles
       SET real_name = _real_name,
           updated_at = now()
     WHERE user_id = _user_id;
  END IF;
END;
$$;

-- 3. bind_my_phone RPC：登录用户自己绑定手机号（供强制补录用）
CREATE OR REPLACE FUNCTION public.bind_my_phone(_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _phone IS NULL OR _phone = '' THEN RAISE EXCEPTION '手机号不能为空'; END IF;
  IF _phone !~ '^1[3-9][0-9]{9}$' THEN RAISE EXCEPTION '手机号格式不正确'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = _phone AND user_id <> uid) THEN
    RAISE EXCEPTION '该手机号已被其他账号占用';
  END IF;
  UPDATE public.profiles
     SET phone = _phone,
         updated_at = now()
   WHERE user_id = uid;
END;
$$;
