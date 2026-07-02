
CREATE TABLE public.backup_file_ledger (
  cos_key TEXT PRIMARY KEY,
  source_bucket TEXT NOT NULL,
  source_path TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  etag TEXT,
  content_hash TEXT,
  first_backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_file_ledger TO authenticated;
GRANT ALL ON public.backup_file_ledger TO service_role;

ALTER TABLE public.backup_file_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backup ledger"
  ON public.backup_file_ledger FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_backup_ledger_source ON public.backup_file_ledger(source_bucket, source_path);
CREATE INDEX idx_backup_ledger_verified ON public.backup_file_ledger(last_verified_at DESC);

CREATE TABLE public.backup_file_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_bucket TEXT NOT NULL,
  source_path TEXT NOT NULL,
  cos_key TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (source_bucket, source_path)
);

GRANT SELECT ON public.backup_file_failures TO authenticated;
GRANT ALL ON public.backup_file_failures TO service_role;

ALTER TABLE public.backup_file_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backup failures"
  ON public.backup_file_failures FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_backup_failures_pending ON public.backup_file_failures(resolved_at, source_bucket) WHERE resolved_at IS NULL;
