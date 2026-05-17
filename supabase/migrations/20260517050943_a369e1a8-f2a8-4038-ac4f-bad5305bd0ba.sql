
-- 触发器：新用户默认 role_code='staff'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (new.id, new.raw_user_meta_data ->> 'display_name');

    INSERT INTO public.user_roles (user_id, role, role_code)
    VALUES (new.id, 'anchor', 'staff');

    RETURN new;
END;
$function$;

-- 补齐历史数据：role_code 为空的，按 legacy role 推断
UPDATE public.user_roles
SET role_code = CASE WHEN role::text = 'admin' THEN 'super_admin' ELSE 'staff' END
WHERE role_code IS NULL;
