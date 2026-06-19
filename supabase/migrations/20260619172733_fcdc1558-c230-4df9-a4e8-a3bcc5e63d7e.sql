ALTER TABLE public.activity_applications
  ADD COLUMN IF NOT EXISTS publish_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS publish_confirm_note text;

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voucher_claims;
ALTER TABLE public.activity_applications REPLICA IDENTITY FULL;
ALTER TABLE public.voucher_claims REPLICA IDENTITY FULL;