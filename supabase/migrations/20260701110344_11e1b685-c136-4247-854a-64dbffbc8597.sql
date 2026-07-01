ALTER TABLE public.backup_runs ADD COLUMN IF NOT EXISTS retry_of uuid REFERENCES public.backup_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_backup_runs_kind_started ON public.backup_runs (kind, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_runs_retry_of ON public.backup_runs (retry_of);