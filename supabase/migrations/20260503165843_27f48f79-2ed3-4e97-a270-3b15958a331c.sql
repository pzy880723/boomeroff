UPDATE public.app_settings
SET value = jsonb_build_object(
  'model', 'google/gemini-2.5-flash-lite',
  'enableWebSearch', false,
  'enableQuickMatch', false,
  'enableEnrich', true
), updated_at = now()
WHERE key = 'ai_model';

INSERT INTO public.app_settings (key, value)
SELECT 'ai_model', jsonb_build_object(
  'model', 'google/gemini-2.5-flash-lite',
  'enableWebSearch', false,
  'enableQuickMatch', false,
  'enableEnrich', true
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_model');