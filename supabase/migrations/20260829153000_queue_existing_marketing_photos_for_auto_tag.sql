-- Queue legacy user-uploaded photos that missed the original fire-and-forget tag request.
-- Generated storyboard/cover images must never be promoted as factual shop assets.
UPDATE public.marketing_assets
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
  'ai_tag_status', 'pending',
  'ai_tag_attempts', CASE
    WHEN COALESCE(meta->>'ai_tag_attempts', '') ~ '^[0-9]+$'
      THEN (meta->>'ai_tag_attempts')::integer
    ELSE 0
  END
)
WHERE kind = 'photo'
  AND output_url IS NOT NULL
  AND COALESCE(meta->>'ai_tagged_at', '') = ''
  AND CASE
    WHEN COALESCE(meta->>'ai_tag_attempts', '') ~ '^[0-9]+$'
      THEN (meta->>'ai_tag_attempts')::integer
    ELSE 0
  END < 3
  AND COALESCE(meta->>'asset_class', '') <> 'generated'
  AND COALESCE(meta->>'source', '') NOT IN (
    'storyboard',
    'ai_smart_ad',
    'ai-smart-ad',
    'ai_image',
    'smart_ad',
    'generated',
    'ai_generated'
  );
