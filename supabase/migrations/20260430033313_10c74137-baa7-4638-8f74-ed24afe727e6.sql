CREATE TABLE public.product_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category product_category NOT NULL DEFAULT 'other',
  product_name text NOT NULL,
  selling_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  tips text,
  era text,
  origin text,
  image_url text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_knowledge_category ON public.product_knowledge(category);
CREATE INDEX idx_product_knowledge_created_at ON public.product_knowledge(created_at DESC);
CREATE INDEX idx_product_knowledge_product_id ON public.product_knowledge(product_id);

ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge viewable by all authenticated users"
ON public.product_knowledge FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Anchors and admins can create knowledge"
ON public.product_knowledge FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'anchor'::app_role));

CREATE POLICY "Only admins can delete knowledge"
ON public.product_knowledge FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update knowledge"
ON public.product_knowledge FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));