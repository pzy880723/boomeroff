
-- 1) social_accounts
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('douyin','xhs','wechat_video','kuaishou','bilibili','tiktok')),
  account_name text,
  avatar_url text,
  worker_account_key text NOT NULL,
  cookie_status text NOT NULL DEFAULT 'active' CHECK (cookie_status IN ('active','expired','invalid','pending')),
  last_check_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, platform, worker_account_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_accounts admin all"
  ON public.social_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "social_accounts staff own shop select"
  ON public.social_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.shop_id = social_accounts.shop_id
    )
  );

CREATE POLICY "social_accounts staff own shop write"
  ON public.social_accounts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.shop_id = social_accounts.shop_id
    )
  );

CREATE POLICY "social_accounts staff own shop update"
  ON public.social_accounts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.shop_id = social_accounts.shop_id
    )
  );

CREATE POLICY "social_accounts staff own shop delete"
  ON public.social_accounts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.shop_id = social_accounts.shop_id
    )
  );

CREATE TRIGGER trg_social_accounts_updated
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) social_publish_jobs (parent)
CREATE TABLE public.social_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.marketing_assets(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('video','image_text')),
  title text,
  body text,
  tags text[] NOT NULL DEFAULT '{}',
  cover_url text,
  media_url text,
  per_platform jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','partial','failed','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_publish_jobs TO authenticated;
GRANT ALL ON public.social_publish_jobs TO service_role;
ALTER TABLE public.social_publish_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spj admin all"
  ON public.social_publish_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "spj staff own shop select"
  ON public.social_publish_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = auth.uid() AND sp.shop_id = social_publish_jobs.shop_id)
  );

CREATE POLICY "spj staff own shop insert"
  ON public.social_publish_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = auth.uid() AND sp.shop_id = social_publish_jobs.shop_id)
  );

CREATE POLICY "spj staff own shop update"
  ON public.social_publish_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = auth.uid() AND sp.shop_id = social_publish_jobs.shop_id)
  );

CREATE TRIGGER trg_spj_updated
  BEFORE UPDATE ON public.social_publish_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) social_publish_targets (children)
CREATE TABLE public.social_publish_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.social_publish_jobs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  worker_task_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','failed','cancelled')),
  progress int NOT NULL DEFAULT 0,
  platform_url text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spt_job ON public.social_publish_targets(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_publish_targets TO authenticated;
GRANT ALL ON public.social_publish_targets TO service_role;
ALTER TABLE public.social_publish_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spt admin all"
  ON public.social_publish_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "spt staff via job"
  ON public.social_publish_targets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.social_publish_jobs j
      JOIN public.staff_profiles sp ON sp.shop_id = j.shop_id
      WHERE j.id = social_publish_targets.job_id AND sp.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_spt_updated
  BEFORE UPDATE ON public.social_publish_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_publish_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_publish_targets;
