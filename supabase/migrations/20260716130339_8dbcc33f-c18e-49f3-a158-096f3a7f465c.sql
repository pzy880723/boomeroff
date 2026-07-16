-- 1. has_role: 当 role_code 为 NULL 时，不再回退成 anchor
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND COALESCE(ur.suspended, false) = false
      AND ur.role_code IS NOT NULL
      AND (
        CASE
          WHEN ur.role_code IN ('super_admin','area_manager','shop_manager') THEN 'admin'::app_role
          ELSE 'anchor'::app_role
        END
      ) = _role
  )
$function$;

-- 2. user_has_permission: 移除 COALESCE(ur.role_code, 'staff') 回退
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.app_role_permissions arp
      ON arp.role_code = ur.role_code
    WHERE ur.user_id = _user_id
      AND ur.role_code IS NOT NULL
      AND arp.permission_key = _perm
      AND COALESCE(ur.suspended, false) = false
  );
$function$;

-- 3. kb_documents 策略从 public 收紧到 authenticated
DROP POLICY IF EXISTS "kb_documents staff read by shop" ON public.kb_documents;
CREATE POLICY "kb_documents staff read by shop"
  ON public.kb_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_code IS NOT NULL
        AND COALESCE(ur.suspended, false) = false
    )
  );