
-- Add new product fields for the redesigned recognition output
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS selling_points JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tips TEXT;

-- Daily knowledge digest table
CREATE TABLE IF NOT EXISTS public.daily_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily knowledge viewable by all authenticated users"
ON public.daily_knowledge
FOR SELECT
TO authenticated
USING (true);

-- Only service role inserts (via edge function); no insert policy for authenticated users
