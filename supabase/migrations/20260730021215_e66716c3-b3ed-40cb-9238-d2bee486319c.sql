
CREATE OR REPLACE FUNCTION public.is_erp_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'auth_source') = 'erp', false)
$$;

CREATE TABLE IF NOT EXISTS public.automation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  shop_id uuid,
  platforms text[] NOT NULL DEFAULT '{}',
  asset_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  interval_minutes integer NOT NULL DEFAULT 1440,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_tasks TO authenticated;
GRANT ALL ON public.automation_tasks TO service_role;

ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_tasks admin all" ON public.automation_tasks;
CREATE POLICY "automation_tasks admin all" ON public.automation_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "automation_tasks erp shared all" ON public.automation_tasks;
CREATE POLICY "automation_tasks erp shared all" ON public.automation_tasks
  FOR ALL TO authenticated
  USING (public.is_erp_user())
  WITH CHECK (public.is_erp_user());

CREATE INDEX IF NOT EXISTS automation_tasks_due_idx
  ON public.automation_tasks (enabled, next_run_at);

DROP TRIGGER IF EXISTS update_automation_tasks_updated_at ON public.automation_tasks;
CREATE TRIGGER update_automation_tasks_updated_at
  BEFORE UPDATE ON public.automation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.social_publish_jobs
  ADD COLUMN IF NOT EXISTS automation_task_id uuid REFERENCES public.automation_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_publish_jobs_automation_task_idx
  ON public.social_publish_jobs (automation_task_id);

DROP POLICY IF EXISTS "social_accounts erp shared all" ON public.social_accounts;
CREATE POLICY "social_accounts erp shared all" ON public.social_accounts
  FOR ALL TO authenticated
  USING (public.is_erp_user())
  WITH CHECK (public.is_erp_user());

DROP POLICY IF EXISTS "spj erp shared all" ON public.social_publish_jobs;
CREATE POLICY "spj erp shared all" ON public.social_publish_jobs
  FOR ALL TO authenticated
  USING (public.is_erp_user())
  WITH CHECK (public.is_erp_user());

DROP POLICY IF EXISTS "spt erp shared all" ON public.social_publish_targets;
CREATE POLICY "spt erp shared all" ON public.social_publish_targets
  FOR ALL TO authenticated
  USING (public.is_erp_user())
  WITH CHECK (public.is_erp_user());
