-- 1. 首先删除依赖于旧枚举的策略
DROP POLICY IF EXISTS "Operators and admins can manage session" ON public.current_session;
DROP POLICY IF EXISTS "Assistants and admins can manage price records" ON public.price_records;
DROP POLICY IF EXISTS "Assistants and admins can update price records" ON public.price_records;
DROP POLICY IF EXISTS "Operators, assistants, admins can create products" ON public.products;
DROP POLICY IF EXISTS "Assistants and admins can update products" ON public.products;

-- 2. 更新 RLS 策略 - current_session
CREATE POLICY "Admins and anchors can manage session"
ON public.current_session
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'anchor'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'anchor'));

-- 3. 更新 RLS 策略 - price_records (管理员和主播都可以创建，仅管理员可以更新/删除)
CREATE POLICY "Admins and anchors can create price records"
ON public.price_records
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'anchor'));

CREATE POLICY "Only admins can update price records"
ON public.price_records
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- 4. 更新 RLS 策略 - products (管理员和主播都可以创建，仅管理员可以更新)
CREATE POLICY "Admins and anchors can create products"
ON public.products
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'anchor'));

CREATE POLICY "Only admins can update products"
ON public.products
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- 5. 更新现有用户角色：将 operator 和 assistant 转换为 anchor
UPDATE public.user_roles 
SET role = 'anchor' 
WHERE role IN ('operator', 'assistant');

-- 6. 更新 handle_new_user 函数，默认角色为 anchor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
    
    -- 默认赋予主播角色
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'anchor');
    
    RETURN new;
END;
$$;