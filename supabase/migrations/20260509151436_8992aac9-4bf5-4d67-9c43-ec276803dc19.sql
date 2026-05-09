
-- 1. user_experience: restrict SELECT to own row (or admin)
DROP POLICY IF EXISTS "Experience readable by authenticated" ON public.user_experience;
CREATE POLICY "Users select own experience"
  ON public.user_experience FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2. Tighten public-role policies to authenticated role for least privilege

-- price_records
DROP POLICY IF EXISTS "Admins and anchors can create price records" ON public.price_records;
DROP POLICY IF EXISTS "Only admins can update price records" ON public.price_records;
DROP POLICY IF EXISTS "Price records viewable by admins and anchors" ON public.price_records;
CREATE POLICY "Admins and anchors can create price records"
  ON public.price_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor'));
CREATE POLICY "Only admins can update price records"
  ON public.price_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Price records viewable by admins and anchors"
  ON public.price_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor'));

-- current_session
DROP POLICY IF EXISTS "Admins and anchors can manage session" ON public.current_session;
CREATE POLICY "Admins and anchors can manage session"
  ON public.current_session FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor'));

-- products
DROP POLICY IF EXISTS "Admins and anchors can create products" ON public.products;
DROP POLICY IF EXISTS "Only admins can update products" ON public.products;
CREATE POLICY "Admins and anchors can create products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor'));
CREATE POLICY "Only admins can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- invitations: scope to authenticated (currently public role)
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
CREATE POLICY "Admins can manage invitations"
  ON public.invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Storage: add UPDATE/DELETE policies for product-images bucket (admins + anchors)
CREATE POLICY "Admins and anchors update product-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor')))
  WITH CHECK (bucket_id = 'product-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor')));

CREATE POLICY "Admins and anchors delete product-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'anchor')));
