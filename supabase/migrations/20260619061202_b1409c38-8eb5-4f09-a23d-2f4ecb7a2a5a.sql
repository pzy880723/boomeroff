
-- 1) marketing-videos: add UPDATE policy (owner-scoped)
CREATE POLICY "own marketing-videos update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'marketing-videos' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'marketing-videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 2) voucher-screenshots: add INSERT/UPDATE/DELETE policies (manage permission)
CREATE POLICY "voucher screenshots managers insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voucher-screenshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_permission(auth.uid(), 'voucher.manage')
    OR public.user_has_permission(auth.uid(), 'voucher.redeem')
  )
);

CREATE POLICY "voucher screenshots managers update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'voucher-screenshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_permission(auth.uid(), 'voucher.manage')
  )
)
WITH CHECK (
  bucket_id = 'voucher-screenshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_permission(auth.uid(), 'voucher.manage')
  )
);

CREATE POLICY "voucher screenshots managers delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voucher-screenshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_permission(auth.uid(), 'voucher.manage')
  )
);

-- 3) Realtime: replace permissive policy with topic-scoped rules
DROP POLICY IF EXISTS "Authenticated realtime topic access" ON realtime.messages;

CREATE POLICY "Scoped realtime topic access"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  CASE
    -- user-private topics: must belong to the subscriber
    WHEN realtime.topic() LIKE 'level-up-%' THEN realtime.topic() = ('level-up-' || (auth.uid())::text)
    WHEN realtime.topic() LIKE 'exp-pending-%' THEN realtime.topic() = ('exp-pending-' || (auth.uid())::text)
    WHEN realtime.topic() LIKE 'own-products-%' THEN realtime.topic() = ('own-products-' || (auth.uid())::text)
    -- public community feed
    WHEN realtime.topic() = 'community-posts-feed' THEN true
    -- deny everything else
    ELSE false
  END
);
