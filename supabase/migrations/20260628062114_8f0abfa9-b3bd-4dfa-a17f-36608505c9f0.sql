ALTER TABLE public.marketing_characters
  ADD COLUMN IF NOT EXISTS face_pass_level text NOT NULL DEFAULT 'auto';

ALTER TABLE public.marketing_characters
  DROP CONSTRAINT IF EXISTS marketing_characters_face_pass_level_check;
ALTER TABLE public.marketing_characters
  ADD CONSTRAINT marketing_characters_face_pass_level_check
  CHECK (face_pass_level IN ('auto','character_sheet','illustration','faceless'));

ALTER TABLE public.marketing_video_jobs
  ADD COLUMN IF NOT EXISTS fallback_notes jsonb NOT NULL DEFAULT '[]'::jsonb;