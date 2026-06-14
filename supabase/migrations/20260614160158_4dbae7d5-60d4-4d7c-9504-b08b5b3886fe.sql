
CREATE TABLE public.marketing_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','copy','video')),
  input_image_urls TEXT[] NOT NULL DEFAULT '{}',
  output_url TEXT,
  output_text TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_platforms TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_marketing_assets_user ON public.marketing_assets(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_assets TO authenticated;
GRANT ALL ON public.marketing_assets TO service_role;
ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assets read" ON public.marketing_assets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own assets write" ON public.marketing_assets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own assets update" ON public.marketing_assets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own assets delete" ON public.marketing_assets FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.marketing_video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  script JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','rendering','done','failed','cancelled')),
  output_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_marketing_jobs_user ON public.marketing_video_jobs(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_video_jobs TO authenticated;
GRANT ALL ON public.marketing_video_jobs TO service_role;
ALTER TABLE public.marketing_video_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs read" ON public.marketing_video_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own jobs write" ON public.marketing_video_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own jobs update" ON public.marketing_video_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
