-- Align Cloud platform names and capabilities with the Tencent publishing Worker.
alter table public.social_accounts
  drop constraint if exists social_accounts_platform_check;

update public.social_accounts
set platform = 'xhs', updated_at = now()
where platform = 'xiaohongshu';

alter table public.social_accounts
  add constraint social_accounts_platform_check
  check (platform in (
    'xhs',
    'xiaohongshu',
    'douyin',
    'wechat_video',
    'wechat_channels',
    'kuaishou',
    'dianping',
    'bilibili',
    'tiktok'
  ));

update public.social_platform_specs
set supports_image_text = true, updated_at = now()
where platform = 'kuaishou';

update public.social_platform_specs
set supports_image_text = false, updated_at = now()
where platform = 'dianping';
