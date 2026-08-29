-- Global safety net: every real uploaded photo enters the AI tagging queue,
-- regardless of which current or future client upload entry created it.
CREATE OR REPLACE FUNCTION public.queue_marketing_photo_auto_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_name text := COALESCE(NEW.meta->>'source', '');
  asset_class_name text := COALESCE(NEW.meta->>'asset_class', '');
  attempts integer := CASE
    WHEN COALESCE(NEW.meta->>'ai_tag_attempts', '') ~ '^[0-9]+$'
      THEN (NEW.meta->>'ai_tag_attempts')::integer
    ELSE 0
  END;
BEGIN
  IF NEW.kind = 'photo'
    AND NEW.output_url IS NOT NULL
    AND COALESCE(NEW.meta->>'ai_tagged_at', '') = ''
    AND asset_class_name <> 'generated'
    AND source_name NOT IN (
      'storyboard',
      'ai_smart_ad',
      'ai-smart-ad',
      'ai_image',
      'smart_ad',
      'generated',
      'ai_generated'
    )
  THEN
    NEW.meta := COALESCE(NEW.meta, '{}'::jsonb) || jsonb_build_object(
      'ai_tag_status', COALESCE(NULLIF(NEW.meta->>'ai_tag_status', ''), 'pending'),
      'ai_tag_attempts', attempts
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_assets_auto_tag_queue ON public.marketing_assets;

CREATE TRIGGER marketing_assets_auto_tag_queue
BEFORE INSERT OR UPDATE OF output_url, meta
ON public.marketing_assets
FOR EACH ROW
EXECUTE FUNCTION public.queue_marketing_photo_auto_tag();
