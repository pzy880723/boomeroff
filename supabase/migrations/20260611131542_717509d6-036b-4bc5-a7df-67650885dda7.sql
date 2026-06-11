
CREATE TABLE public.sms_test_otp (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tencent_response jsonb
);
CREATE INDEX idx_sms_test_otp_phone_created ON public.sms_test_otp(phone, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.sms_test_otp TO authenticated;
GRANT ALL ON public.sms_test_otp TO service_role;
ALTER TABLE public.sms_test_otp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read own sms test" ON public.sms_test_otp
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "admin insert own sms test" ON public.sms_test_otp
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "admin update own sms test" ON public.sms_test_otp
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
