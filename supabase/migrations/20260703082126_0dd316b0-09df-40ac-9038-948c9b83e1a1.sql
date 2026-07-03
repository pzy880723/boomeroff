
CREATE POLICY "chat_attachments_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_attachments_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
