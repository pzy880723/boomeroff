
-- =====================
-- video_generation_jobs
-- =====================
CREATE TABLE public.video_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid,
  source_pick_json jsonb,
  brief_json jsonb,
  script_json jsonb,
  character_json jsonb,
  status text NOT NULL DEFAULT 'queued',
  duration integer NOT NULL DEFAULT 15,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  final_video_url text,
  cover_url text,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_generation_jobs TO authenticated;
GRANT ALL ON public.video_generation_jobs TO service_role;

ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vgj_owner_select" ON public.video_generation_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vgj_owner_insert" ON public.video_generation_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vgj_owner_update" ON public.video_generation_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vgj_owner_delete" ON public.video_generation_jobs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX vgj_user_created_idx ON public.video_generation_jobs (user_id, created_at DESC);
CREATE INDEX vgj_status_idx ON public.video_generation_jobs (status);

CREATE TRIGGER vgj_set_updated_at
  BEFORE UPDATE ON public.video_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- video_generation_shots
-- =====================
CREATE TABLE public.video_generation_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.video_generation_jobs(id) ON DELETE CASCADE,
  shot_index integer NOT NULL,
  duration numeric NOT NULL DEFAULT 3,
  scene text,
  subject text,
  action text,
  camera text,
  subtitle text,
  dialogue text,
  prompt text NOT NULL DEFAULT '',
  reference_image_url text,
  first_frame_url text,
  seedance_task_id text,
  video_url text,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, shot_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_generation_shots TO authenticated;
GRANT ALL ON public.video_generation_shots TO service_role;

ALTER TABLE public.video_generation_shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vgs_owner_select" ON public.video_generation_shots
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.video_generation_jobs j
      WHERE j.id = video_generation_shots.job_id AND j.user_id = auth.uid()
    )
  );
CREATE POLICY "vgs_owner_write" ON public.video_generation_shots
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.video_generation_jobs j
      WHERE j.id = video_generation_shots.job_id AND j.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.video_generation_jobs j
      WHERE j.id = video_generation_shots.job_id AND j.user_id = auth.uid()
    )
  );

CREATE INDEX vgs_job_idx ON public.video_generation_shots (job_id, shot_index);
CREATE INDEX vgs_status_idx ON public.video_generation_shots (status);

CREATE TRIGGER vgs_set_updated_at
  BEFORE UPDATE ON public.video_generation_shots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
