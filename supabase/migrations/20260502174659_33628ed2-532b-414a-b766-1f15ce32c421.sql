CREATE INDEX IF NOT EXISTS idx_products_image_hash
  ON public.products (image_hash)
  WHERE image_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_name_category
  ON public.products (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_knowledge_name_category
  ON public.official_knowledge (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_records_product_id
  ON public.price_records (product_id, created_at DESC);