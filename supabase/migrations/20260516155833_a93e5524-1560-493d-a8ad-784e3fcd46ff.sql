CREATE POLICY "shops read active by anon"
ON public.shops
FOR SELECT
TO anon
USING (active = true);