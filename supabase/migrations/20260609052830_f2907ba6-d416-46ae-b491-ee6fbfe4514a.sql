
-- 1) 扩展 vouchers 为模板
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS threshold_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_spend numeric,
  ADD COLUMN IF NOT EXISTS valid_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS template_terms text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 允许旧字段为空（兼容已有数据）
ALTER TABLE public.vouchers
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN share_token DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL;

-- 2) voucher_claims —— 每一张领取/核销实例
CREATE TABLE IF NOT EXISTS public.voucher_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  activity_application_id uuid,
  code text UNIQUE,
  share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  source text NOT NULL DEFAULT 'direct',
  status text NOT NULL DEFAULT 'unclaimed',
  recipient_name text,
  recipient_phone text,
  recipient_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_claims TO authenticated;
GRANT ALL ON public.voucher_claims TO service_role;

ALTER TABLE public.voucher_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voucher_claims read by staff"
  ON public.voucher_claims FOR SELECT TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'voucher.manage')
    OR public.user_has_permission(auth.uid(), 'voucher.redeem')
    OR created_by = auth.uid()
  );

CREATE POLICY "voucher_claims write by manager"
  ON public.voucher_claims FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'voucher.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'voucher.manage'));

-- 3) activities
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cover_url text,
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  max_applications integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities read by staff"
  ON public.activities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "activities write by manager"
  ON public.activities FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'voucher.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'voucher.manage'));

-- 4) activity_applications
CREATE TABLE IF NOT EXISTS public.activity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  applicant_name text NOT NULL,
  applicant_phone text NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  voucher_claim_id uuid REFERENCES public.voucher_claims(id) ON DELETE SET NULL,
  sms_sent_at timestamptz,
  sms_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_applications TO authenticated;
GRANT ALL ON public.activity_applications TO service_role;

ALTER TABLE public.activity_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_applications read by manager"
  ON public.activity_applications FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'voucher.manage'));

CREATE POLICY "activity_applications write by manager"
  ON public.activity_applications FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'voucher.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'voucher.manage'));

-- 5) Trigger：自动生成 voucher_claims.code
CREATE OR REPLACE FUNCTION public.voucher_claims_set_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE tries int := 0; candidate text;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    LOOP
      candidate := public.gen_voucher_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.voucher_claims WHERE code = candidate);
      tries := tries + 1;
      IF tries > 10 THEN RAISE EXCEPTION 'failed to generate unique claim code'; END IF;
    END LOOP;
    NEW.code := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_voucher_claims_set_code ON public.voucher_claims;
CREATE TRIGGER trg_voucher_claims_set_code
  BEFORE INSERT ON public.voucher_claims
  FOR EACH ROW EXECUTE FUNCTION public.voucher_claims_set_code();

-- 6) Trigger：claim 被领取时自动算 expires_at
CREATE OR REPLACE FUNCTION public.voucher_claims_set_expires()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE vd int;
BEGIN
  IF NEW.claimed_at IS NOT NULL AND (OLD.claimed_at IS NULL OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at) THEN
    SELECT valid_days INTO vd FROM public.vouchers WHERE id = NEW.voucher_id;
    IF vd IS NOT NULL AND vd > 0 THEN
      NEW.expires_at := NEW.claimed_at + (vd || ' days')::interval;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_voucher_claims_set_expires ON public.voucher_claims;
CREATE TRIGGER trg_voucher_claims_set_expires
  BEFORE UPDATE ON public.voucher_claims
  FOR EACH ROW EXECUTE FUNCTION public.voucher_claims_set_expires();

-- 7) updated_at triggers
DROP TRIGGER IF EXISTS trg_voucher_claims_uat ON public.voucher_claims;
CREATE TRIGGER trg_voucher_claims_uat
  BEFORE UPDATE ON public.voucher_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_activities_uat ON public.activities;
CREATE TRIGGER trg_activities_uat
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_activity_applications_uat ON public.activity_applications;
CREATE TRIGGER trg_activity_applications_uat
  BEFORE UPDATE ON public.activity_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_voucher_claims_voucher ON public.voucher_claims(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_claims_phone ON public.voucher_claims(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_activity_apps_activity ON public.activity_applications(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_apps_status ON public.activity_applications(status);
CREATE INDEX IF NOT EXISTS idx_activity_apps_phone ON public.activity_applications(applicant_phone);
