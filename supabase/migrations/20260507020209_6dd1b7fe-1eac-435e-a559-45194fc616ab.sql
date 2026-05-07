
ALTER TABLE public.official_knowledge
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS sub_type TEXT;

ALTER TABLE public.product_knowledge
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS sub_type TEXT;

CREATE INDEX IF NOT EXISTS idx_official_knowledge_cat_brand ON public.official_knowledge(category, brand);
CREATE INDEX IF NOT EXISTS idx_official_knowledge_cat_subtype ON public.official_knowledge(category, sub_type);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_cat_brand ON public.product_knowledge(category, brand);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_cat_subtype ON public.product_knowledge(category, sub_type);
