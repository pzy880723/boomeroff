CREATE UNIQUE INDEX IF NOT EXISTS shop_shifts_code_shop_uniq
  ON public.shop_shifts (code, COALESCE(shop_id, '00000000-0000-0000-0000-000000000000'::uuid));