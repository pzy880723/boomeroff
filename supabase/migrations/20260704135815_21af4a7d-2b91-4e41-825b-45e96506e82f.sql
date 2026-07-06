-- 1) Restrict chat-attachments SELECT to uploader only (recipients access via signed URLs)
DROP POLICY IF EXISTS "chat_attachments_auth_read" ON storage.objects;
CREATE POLICY "chat_attachments_owner_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 2) Remove social_accounts from realtime publication so worker_account_key isn't broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.social_accounts;