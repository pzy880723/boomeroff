-- 1. 游客每日用量
CREATE TABLE IF NOT EXISTS public.guest_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::date,
  recognize_count int NOT NULL DEFAULT 0,
  share_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ip_hash, usage_date)
);

ALTER TABLE public.guest_daily_usage ENABLE ROW LEVEL SECURITY;
-- 仅 service_role 可访问；不创建任何针对 anon/authenticated 的策略
-- service_role 默认绕过 RLS

-- 2. community_posts 调整：允许游客帖
ALTER TABLE public.community_posts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- 允许匿名/已登录用户查看公开帖（覆盖游客版圈子只读）
DROP POLICY IF EXISTS "Public posts readable by anon" ON public.community_posts;
CREATE POLICY "Public posts readable by anon"
ON public.community_posts
FOR SELECT
TO anon
USING (is_public = true);

-- 顺便让 anon 能读 profiles 与 community_likes/comments 的计数已存在 posts 上，profiles 用于显示头像
DROP POLICY IF EXISTS "Profiles viewable by anon" ON public.profiles;
CREATE POLICY "Profiles viewable by anon"
ON public.profiles
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS "Comments readable by anon" ON public.community_comments;
CREATE POLICY "Comments readable by anon"
ON public.community_comments
FOR SELECT
TO anon
USING (true);

-- 3. 默认游客限额（若不存在则插入）
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'guest_limits',
  '{"enabled": true, "recognize_per_day": 30, "share_per_day": 5}'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;