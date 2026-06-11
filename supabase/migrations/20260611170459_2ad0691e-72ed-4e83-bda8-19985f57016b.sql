
CREATE POLICY "Users read own activity posters"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'activity-posters' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users insert own activity posters"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'activity-posters' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own activity posters"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'activity-posters' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own activity posters"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'activity-posters' AND (storage.foldername(name))[1] = auth.uid()::text);
