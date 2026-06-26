
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS worker_account_id integer;
ALTER TABLE public.social_publish_jobs ADD COLUMN IF NOT EXISTS worker_file_path text;
CREATE INDEX IF NOT EXISTS idx_social_accounts_worker ON public.social_accounts(worker_account_id);
