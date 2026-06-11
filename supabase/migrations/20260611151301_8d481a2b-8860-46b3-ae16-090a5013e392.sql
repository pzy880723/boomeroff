ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT true;

ALTER TABLE public.activity_applications DROP CONSTRAINT IF EXISTS activity_applications_activity_id_fkey;
ALTER TABLE public.activity_applications
  ADD CONSTRAINT activity_applications_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;

ALTER TABLE public.voucher_claims DROP CONSTRAINT IF EXISTS voucher_claims_activity_application_id_fkey;
ALTER TABLE public.voucher_claims
  ADD CONSTRAINT voucher_claims_activity_application_id_fkey
  FOREIGN KEY (activity_application_id) REFERENCES public.activity_applications(id) ON DELETE SET NULL;