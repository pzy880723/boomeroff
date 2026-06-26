
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS content_kinds text[] NOT NULL DEFAULT ARRAY['video']::text[],
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.social_publish_jobs
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0;

ALTER TABLE public.social_publish_targets
  ADD COLUMN IF NOT EXISTS platform_post_id text,
  ADD COLUMN IF NOT EXISTS platform_post_url text,
  ADD COLUMN IF NOT EXISTS last_step text;

CREATE TABLE IF NOT EXISTS public.social_platform_specs (
  platform text PRIMARY KEY,
  label text NOT NULL,
  supports_video boolean NOT NULL DEFAULT true,
  supports_image_text boolean NOT NULL DEFAULT false,
  title_max int NOT NULL DEFAULT 30,
  body_max int NOT NULL DEFAULT 1000,
  tag_max int NOT NULL DEFAULT 5,
  images_min int NOT NULL DEFAULT 1,
  images_max int NOT NULL DEFAULT 9,
  video_seconds_min int NOT NULL DEFAULT 3,
  video_seconds_max int NOT NULL DEFAULT 300,
  supports_schedule boolean NOT NULL DEFAULT true,
  needs_cover boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.social_platform_specs TO authenticated, anon;
GRANT ALL ON public.social_platform_specs TO service_role;
ALTER TABLE public.social_platform_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "specs read all" ON public.social_platform_specs
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "specs admin write" ON public.social_platform_specs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.social_platform_specs (platform, label, supports_video, supports_image_text, title_max, body_max, tag_max, images_min, images_max, video_seconds_min, video_seconds_max, supports_schedule, needs_cover, sort_order) VALUES
  ('douyin',       '抖音',   true, true,  30,  1000, 5, 1, 35, 3,  900, true,  false, 10),
  ('xhs',          '小红书', true, true,  20,  1000, 10, 1, 18, 3,  600, true,  true,  20),
  ('wechat_video', '视频号', true, false, 22,  600,  5, 1, 9,  3,  3600, true, false, 30),
  ('kuaishou',     '快手',   true, false, 30,  500,  5, 1, 9,  3,  300, true,  false, 40),
  ('bilibili',     'B站',    true, false, 80,  2000, 10, 1, 9, 5, 28800, true, true,  50)
ON CONFLICT (platform) DO UPDATE SET
  label = EXCLUDED.label,
  supports_video = EXCLUDED.supports_video,
  supports_image_text = EXCLUDED.supports_image_text,
  title_max = EXCLUDED.title_max,
  body_max = EXCLUDED.body_max,
  tag_max = EXCLUDED.tag_max,
  images_min = EXCLUDED.images_min,
  images_max = EXCLUDED.images_max,
  video_seconds_min = EXCLUDED.video_seconds_min,
  video_seconds_max = EXCLUDED.video_seconds_max,
  supports_schedule = EXCLUDED.supports_schedule,
  needs_cover = EXCLUDED.needs_cover,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
