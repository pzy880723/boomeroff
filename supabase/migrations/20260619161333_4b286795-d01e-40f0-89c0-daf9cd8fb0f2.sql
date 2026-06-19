CREATE TABLE public.marketing_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  role_label text,
  cover_url text NOT NULL,
  ref_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text,
  core_emotion text,
  visual_signature text,
  source text NOT NULL DEFAULT 'ai_generated',
  auto_anchor boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_characters_shop ON public.marketing_characters(shop_id, created_at DESC);
CREATE INDEX idx_marketing_characters_auto ON public.marketing_characters(shop_id, auto_anchor) WHERE auto_anchor = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_characters TO authenticated;
GRANT ALL ON public.marketing_characters TO service_role;

ALTER TABLE public.marketing_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read shop characters" ON public.marketing_characters
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert shop characters" ON public.marketing_characters
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator or admin update characters" ON public.marketing_characters
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "creator or admin delete characters" ON public.marketing_characters
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_marketing_characters_updated_at
  BEFORE UPDATE ON public.marketing_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();