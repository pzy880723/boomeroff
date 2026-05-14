
-- ===== shop_shifts =====
CREATE TABLE public.shop_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  color text DEFAULT '#f59e0b',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts read" ON public.shop_shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts admin write" ON public.shop_shifts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_shop_shifts_updated BEFORE UPDATE ON public.shop_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== shop_holidays =====
CREATE TABLE public.shop_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  full_staff_off boolean NOT NULL DEFAULT true,
  intern_works boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays read" ON public.shop_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "holidays admin write" ON public.shop_holidays FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ===== staff_profiles =====
CREATE TABLE public.staff_profiles (
  user_id uuid PRIMARY KEY,
  employment_type text NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular','intern')),
  weekly_workdays int NOT NULL DEFAULT 5,
  available_weekdays int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,0],
  preferred_shifts text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_per_week int NOT NULL DEFAULT 5,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read self or admin" ON public.staff_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "staff admin write" ON public.staff_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_staff_profiles_updated BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== shift_schedules =====
CREATE TABLE public.shift_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  shift_code text NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_date, user_id)
);
CREATE INDEX idx_shift_schedules_date ON public.shift_schedules(work_date);
CREATE INDEX idx_shift_schedules_user_date ON public.shift_schedules(user_id, work_date);
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules read all" ON public.shift_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules admin write" ON public.shift_schedules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ===== shop_kb_categories =====
CREATE TABLE public.shop_kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('sop','qa')),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_kb_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb cats read" ON public.shop_kb_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb cats admin write" ON public.shop_kb_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ===== shop_kb_entries =====
CREATE TABLE public.shop_kb_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('sop','qa')),
  category_id uuid REFERENCES public.shop_kb_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_kb_entries_type ON public.shop_kb_entries(type);
CREATE INDEX idx_shop_kb_entries_cat ON public.shop_kb_entries(category_id);
ALTER TABLE public.shop_kb_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb entries read" ON public.shop_kb_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb entries admin write" ON public.shop_kb_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_shop_kb_entries_updated BEFORE UPDATE ON public.shop_kb_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== seeds =====
INSERT INTO public.shop_shifts (code, name, start_time, end_time, color, sort_order) VALUES
  ('A', 'A 班', '10:00', '19:00', '#f59e0b', 1),
  ('B', 'B 班', '14:00', '22:00', '#6366f1', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.shop_kb_categories (type, name, sort_order) VALUES
  ('sop','开店准备',1),('sop','收银',2),('sop','顾客接待',3),
  ('sop','商品陈列',4),('sop','清洁维护',5),('sop','闭店流程',6),('sop','售后处理',7),
  ('qa','尺码版型',1),('qa','真伪鉴定',2),('qa','价格议价',3),
  ('qa','退换货',4),('qa','保养清洗',5),('qa','库存调货',6),('qa','会员积分',7);
