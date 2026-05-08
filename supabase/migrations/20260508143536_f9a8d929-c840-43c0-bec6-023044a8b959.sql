
-- 1) Update has_role to exclude suspended users
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND COALESCE(suspended, false) = false
  )
$$;

-- 2) Restrict invitations: drop public SELECT policy
DROP POLICY IF EXISTS "Anyone can view valid invitations" ON public.invitations;
DROP POLICY IF EXISTS "Authenticated users can use invitations" ON public.invitations;
-- Admin manage policy remains. Invitation redemption should go through an edge function with service role.

-- 3) Storage: restrict product-images uploads to admin/anchor
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;

CREATE POLICY "Admins and anchors can upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'anchor'::public.app_role)
  )
);

-- 4) Realtime: require authenticated subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);
