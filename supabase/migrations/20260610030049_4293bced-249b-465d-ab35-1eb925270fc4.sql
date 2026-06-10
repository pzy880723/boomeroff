
-- 1) voucher_claims 增加 short_code（6 位 base32-like，用于短链）
ALTER TABLE public.voucher_claims
  ADD COLUMN IF NOT EXISTS short_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.gen_short_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.voucher_claims_set_short_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE tries int := 0; candidate text;
BEGIN
  IF NEW.short_code IS NULL OR NEW.short_code = '' THEN
    LOOP
      candidate := public.gen_short_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.voucher_claims WHERE short_code = candidate);
      tries := tries + 1;
      IF tries > 10 THEN RAISE EXCEPTION 'failed to generate unique short_code'; END IF;
    END LOOP;
    NEW.short_code := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS voucher_claims_short_code ON public.voucher_claims;
CREATE TRIGGER voucher_claims_short_code
  BEFORE INSERT ON public.voucher_claims
  FOR EACH ROW EXECUTE FUNCTION public.voucher_claims_set_short_code();

-- 回填历史数据
UPDATE public.voucher_claims SET short_code = public.gen_short_code() WHERE short_code IS NULL;

-- 2) 新增 claim_otp 表（短信验证码）
CREATE TABLE IF NOT EXISTS public.claim_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.voucher_claims(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_otp_claim_id_idx ON public.claim_otp(claim_id);
CREATE INDEX IF NOT EXISTS claim_otp_phone_idx ON public.claim_otp(phone);

GRANT ALL ON public.claim_otp TO service_role;
ALTER TABLE public.claim_otp ENABLE ROW LEVEL SECURITY;
-- 不开放任何 anon/authenticated 策略，仅 service_role（edge function）可访问
