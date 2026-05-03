-- 清理废弃的 AI 配置：仅保留 Lovable Gemini + 联网开关
UPDATE public.app_settings
SET value = jsonb_build_object(
  'model', 'google/gemini-2.5-flash',
  'enableWebSearch', true
), updated_at = now()
WHERE key = 'ai_model';

-- 删除豆包联网状态标记行（不再使用）
DELETE FROM public.app_settings WHERE key = 'doubao_web_search_status';