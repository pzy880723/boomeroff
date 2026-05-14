
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS allowed_shop_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_shifts text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_weekdays int[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.staff_day_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  off_date date NOT NULL,
  reason text,
  shop_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_day_offs_unique
  ON public.staff_day_offs (user_id, off_date, COALESCE(shop_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS staff_day_offs_date_idx ON public.staff_day_offs (off_date);

ALTER TABLE public.staff_day_offs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_offs admin write"
  ON public.staff_day_offs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "day_offs read self or admin"
  ON public.staff_day_offs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
