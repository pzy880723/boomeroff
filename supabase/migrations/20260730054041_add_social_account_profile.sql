alter table public.social_accounts
  add column if not exists profile_bio text,
  add column if not exists platform_account_id text,
  add column if not exists account_remark text,
  add column if not exists profile_synced_at timestamptz;

alter table public.social_accounts
  drop constraint if exists social_accounts_account_remark_length_check;

alter table public.social_accounts
  add constraint social_accounts_account_remark_length_check
  check (account_remark is null or char_length(account_remark) <= 50);

comment on column public.social_accounts.account_name is
  '平台主页显示名称，由 Worker 登录态读取';
comment on column public.social_accounts.profile_bio is
  '平台主页简介，由 Worker 登录态读取';
comment on column public.social_accounts.platform_account_id is
  '平台公开账号号，例如小红书号';
comment on column public.social_accounts.account_remark is
  'BOOMER 内部账号备注，不会同步到平台主页';

grant select, update on table public.social_accounts to authenticated;
