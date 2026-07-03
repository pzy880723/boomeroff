CREATE TABLE IF NOT EXISTS public.daily_encouragement (
  date DATE PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_encouragement TO authenticated, anon;
GRANT ALL ON public.daily_encouragement TO service_role;
ALTER TABLE public.daily_encouragement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "encouragement readable" ON public.daily_encouragement FOR SELECT TO authenticated, anon USING (true);