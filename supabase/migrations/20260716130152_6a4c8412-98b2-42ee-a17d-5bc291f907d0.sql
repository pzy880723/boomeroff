alter table public.social_accounts
  drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts
  add constraint social_accounts_platform_check
  check (platform in ('xiaohongshu', 'douyin', 'wechat_video', 'wechat_channels', 'kuaishou', 'dianping', 'bilibili', 'tiktok'));

alter table public.social_publish_jobs
  drop constraint if exists social_publish_jobs_status_check;
alter table public.social_publish_jobs
  add constraint social_publish_jobs_status_check
  check (status in ('queued', 'scheduled', 'running', 'success', 'partial_success', 'done', 'partial', 'failed', 'cancelled'));

alter table public.social_publish_targets
  drop constraint if exists social_publish_targets_status_check;
alter table public.social_publish_targets
  add constraint social_publish_targets_status_check
  check (status in ('queued', 'scheduled', 'pending', 'claimed', 'running', 'success', 'failed', 'cancelled'));

alter table public.social_publish_targets
  add column if not exists claim_token text;
alter table public.social_publish_targets
  add column if not exists claim_expires_at timestamptz;

insert into public.social_platform_specs (
  platform, label, supports_video, supports_image_text,
  title_max, body_max, tag_max, images_min, images_max,
  video_seconds_min, video_seconds_max,
  supports_schedule, needs_cover, enabled, sort_order
) values (
  'dianping', '大众点评', true, true,
  30, 500, 10, 3, 9,
  1, 600,
  false, true, true, 5
)
on conflict (platform) do update set
  label = excluded.label,
  supports_video = excluded.supports_video,
  supports_image_text = excluded.supports_image_text,
  title_max = excluded.title_max,
  body_max = excluded.body_max,
  tag_max = excluded.tag_max,
  images_min = excluded.images_min,
  images_max = excluded.images_max,
  video_seconds_min = excluded.video_seconds_min,
  video_seconds_max = excluded.video_seconds_max,
  supports_schedule = excluded.supports_schedule,
  needs_cover = excluded.needs_cover,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();