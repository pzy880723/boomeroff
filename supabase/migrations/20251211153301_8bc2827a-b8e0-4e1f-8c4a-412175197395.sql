-- Fix price_records SELECT policy: restrict to admins and anchors only
DROP POLICY IF EXISTS "Price records viewable by all authenticated users" ON price_records;

CREATE POLICY "Price records viewable by admins and anchors" 
ON price_records 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'anchor'::app_role));