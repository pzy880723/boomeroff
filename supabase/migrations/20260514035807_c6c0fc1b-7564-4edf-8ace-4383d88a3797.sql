
-- 1) shops table
CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shops read" ON public.shops FOR SELECT TO authenticated USING (true);
CREATE POLICY "shops admin write" ON public.shops FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed default shop and capture id
DO $$
DECLARE
  default_shop_id uuid;
BEGIN
  INSERT INTO public.shops (name, sort_order) VALUES ('本店', 0)
  RETURNING id INTO default_shop_id;

  -- 3) Add shop_id columns
  ALTER TABLE public.staff_profiles ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;
  ALTER TABLE public.shift_schedules ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;
  ALTER TABLE public.shop_shifts ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;
  ALTER TABLE public.shop_holidays ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;
  ALTER TABLE public.shop_kb_categories ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;
  ALTER TABLE public.shop_kb_entries ADD COLUMN shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;

  -- 4) Backfill
  UPDATE public.staff_profiles SET shop_id = default_shop_id WHERE shop_id IS NULL;
  UPDATE public.shift_schedules SET shop_id = default_shop_id WHERE shop_id IS NULL;
  UPDATE public.shop_shifts SET shop_id = default_shop_id WHERE shop_id IS NULL;
  UPDATE public.shop_holidays SET shop_id = default_shop_id WHERE shop_id IS NULL;
  UPDATE public.shop_kb_categories SET shop_id = default_shop_id WHERE shop_id IS NULL;
  UPDATE public.shop_kb_entries SET shop_id = default_shop_id WHERE shop_id IS NULL;
END $$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_shift_schedules_shop_date ON public.shift_schedules(shop_id, work_date);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_shop ON public.staff_profiles(shop_id);
