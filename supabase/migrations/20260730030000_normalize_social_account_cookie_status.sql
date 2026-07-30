alter table public.social_accounts
  drop constraint if exists social_accounts_cookie_status_check;

update public.social_accounts
set cookie_status = 'valid',
    updated_at = now()
where cookie_status = 'active';

alter table public.social_accounts
  add constraint social_accounts_cookie_status_check
  check (cookie_status in ('valid', 'expired', 'invalid', 'pending'));
