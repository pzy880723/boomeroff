
CREATE POLICY "own marketing-videos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own marketing-videos write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own marketing-videos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
