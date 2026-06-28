
CREATE TABLE public.activity_apply_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.activity_apply_otp TO service_role;

ALTER TABLE public.activity_apply_otp ENABLE ROW LEVEL SECURITY;

CREATE INDEX activity_apply_otp_lookup_idx
  ON public.activity_apply_otp (activity_id, phone, created_at DESC);
