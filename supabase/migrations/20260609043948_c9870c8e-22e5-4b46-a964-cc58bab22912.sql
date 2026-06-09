
CREATE TABLE public.voucher_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  face_value numeric(10,2) NOT NULL DEFAULT 0,
  valid_days integer NOT NULL DEFAULT 30,
  terms text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.voucher_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_types TO authenticated;
GRANT ALL ON public.voucher_types TO service_role;
ALTER TABLE public.voucher_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voucher_types public read" ON public.voucher_types FOR SELECT USING (true);
CREATE POLICY "voucher_types admin write" ON public.voucher_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_voucher_types_updated_at BEFORE UPDATE ON public.voucher_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type_id uuid REFERENCES public.voucher_types(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shop_id uuid,
  note text,
  share_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending_apply',
  applicant_name text,
  applicant_phone text,
  applicant_screenshot_url text,
  applicant_submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  reject_reason text,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vouchers_created_by ON public.vouchers(created_by);
CREATE INDEX idx_vouchers_status ON public.vouchers(status);
CREATE INDEX idx_vouchers_phone ON public.vouchers(applicant_phone);

GRANT SELECT, INSERT, UPDATE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vouchers admin all" ON public.vouchers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "vouchers creator read" ON public.vouchers FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "vouchers creator insert" ON public.vouchers FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE TRIGGER trg_vouchers_updated_at BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.voucher_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_voucher_logs_voucher ON public.voucher_logs(voucher_id, created_at DESC);
GRANT SELECT ON public.voucher_logs TO authenticated;
GRANT ALL ON public.voucher_logs TO service_role;
ALTER TABLE public.voucher_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voucher_logs read" ON public.voucher_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.id = voucher_id AND v.created_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.gen_voucher_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.vouchers_set_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE tries int := 0; candidate text;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    LOOP
      candidate := public.gen_voucher_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.vouchers WHERE code = candidate);
      tries := tries + 1;
      IF tries > 10 THEN RAISE EXCEPTION 'failed to generate unique voucher code'; END IF;
    END LOOP;
    NEW.code := candidate;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_vouchers_set_code BEFORE INSERT ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.vouchers_set_code();

INSERT INTO public.app_permissions (key, name, "group", description)
VALUES
  ('voucher.manage', '抵用券审核', '抵用券', '审核 / 撤销抵用券'),
  ('voucher.redeem', '抵用券核销', '抵用券', '扫码核销抵用券')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_role_permissions (role_code, permission_key)
VALUES
  ('super_admin', 'voucher.manage'),
  ('super_admin', 'voucher.redeem'),
  ('staff', 'voucher.redeem')
ON CONFLICT DO NOTHING;
