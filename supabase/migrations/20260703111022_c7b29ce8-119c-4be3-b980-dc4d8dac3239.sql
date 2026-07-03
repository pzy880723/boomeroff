
-- 1) profiles: tighten SELECT policy — remove broad user.create/user.suspend permission clauses.
--    Admins (super_admin/area_manager/shop_manager map to app_role admin) still access via has_role.
--    Other permission holders should use SECURITY DEFINER RPCs (admin_update_user_phone, admin_list_user_emails).
DROP POLICY IF EXISTS "profiles select self or admin" ON public.profiles;
CREATE POLICY "profiles select self or admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) social_accounts: re-assert column-level REVOKE on worker_account_key (defense-in-depth).
REVOKE SELECT (worker_account_key) ON public.social_accounts FROM anon, authenticated;

-- 3) marketing_characters: restrict SELECT to same-shop staff, creator, or admin.
DROP POLICY IF EXISTS "authenticated read shop characters" ON public.marketing_characters;
CREATE POLICY "marketing_characters same shop or creator or admin select"
ON public.marketing_characters
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = marketing_characters.shop_id
  )
);

-- 4) community_posts: hide user_id from anonymous readers to prevent auth UUID enumeration.
--    Authenticated users keep full row access (owner/admin/moderation flows depend on it).
REVOKE SELECT ON public.community_posts FROM anon;
GRANT SELECT (
  id, product_id, image_url, name, category, era, origin,
  selling_points, tips, is_public, likes_count, comments_count,
  created_at, guest_name, is_guest, story, appreciation, description,
  care_tips, material, craft, dimensions, condition, confidence,
  rarity, collection_value, market_value, buy_reason, thumbnail_url
) ON public.community_posts TO anon;
