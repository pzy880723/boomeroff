
CREATE POLICY "voucher screenshots admin/creator read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voucher-screenshots'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.vouchers v
        WHERE v.applicant_screenshot_url LIKE '%' || storage.objects.name
          AND v.created_by = auth.uid()
      )
    )
  );
