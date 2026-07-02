
-- notification-images RLS: public read, admin write
CREATE POLICY "notification-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'notification-images');

CREATE POLICY "notification-images admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notification-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "notification-images admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notification-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "notification-images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notification-images' AND public.has_role(auth.uid(), 'admin'));
