
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.voucher_claims_set_expires()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE vd int; v_ends timestamptz; computed timestamptz;
BEGIN
  IF NEW.claimed_at IS NOT NULL AND (OLD.claimed_at IS NULL OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at) THEN
    SELECT valid_days, ends_at INTO vd, v_ends FROM public.vouchers WHERE id = NEW.voucher_id;
    IF vd IS NOT NULL AND vd > 0 THEN
      computed := NEW.claimed_at + (vd || ' days')::interval;
    END IF;
    IF v_ends IS NOT NULL THEN
      IF computed IS NULL OR v_ends < computed THEN computed := v_ends; END IF;
    END IF;
    IF computed IS NOT NULL THEN NEW.expires_at := computed; END IF;
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NEW.claimed_at THEN
      NEW.status := 'expired';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
