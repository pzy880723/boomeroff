
CREATE TABLE public.xianyu_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  query_key text NOT NULL UNIQUE,
  display_name text,
  min_price numeric,
  max_price numeric,
  avg_price numeric,
  suggested_price numeric,
  sample_count integer NOT NULL DEFAULT 0,
  samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_xianyu_snapshots_product ON public.xianyu_price_snapshots(product_id);
CREATE INDEX idx_xianyu_snapshots_updated ON public.xianyu_price_snapshots(updated_at DESC);

ALTER TABLE public.xianyu_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Snapshots readable by authenticated"
ON public.xianyu_price_snapshots FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins and anchors insert snapshots"
ON public.xianyu_price_snapshots FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'anchor'::app_role));

CREATE POLICY "Admins and anchors update snapshots"
ON public.xianyu_price_snapshots FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'anchor'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'anchor'::app_role));

CREATE POLICY "Admins delete snapshots"
ON public.xianyu_price_snapshots FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_xianyu_snapshots_updated_at
BEFORE UPDATE ON public.xianyu_price_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
