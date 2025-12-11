-- 修复 user_roles 表的 RLS 策略
-- 问题：当前策略都是 RESTRICTIVE，导致所有条件都必须同时满足
-- 解决：将用户查看自己角色的策略改为 PERMISSIVE

-- 1. 删除现有的 SELECT 策略
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- 2. 重新创建为 PERMISSIVE 策略（使用 OR 逻辑）
CREATE POLICY "Users can view their own role" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));