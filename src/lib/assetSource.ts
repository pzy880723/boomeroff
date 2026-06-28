// 判定素材是「我上传的」还是「AI 生成」(分镜/智能广告图等)
// 纯前端规则,数据库无需迁移。
export type AssetSource = 'upload' | 'generated';

const GENERATED_META_SOURCES = new Set([
  'storyboard',
  'ai_smart_ad',
  'ai_image',
  'smart_ad',
  'generated',
  'ai_generated',
]);

const GENERATED_CATEGORIES = new Set(['分镜头', 'AI生成', 'AI 生成', 'ai生成']);

export function assetSource(a: { category?: string | null; meta?: any } | null | undefined): AssetSource {
  if (!a) return 'upload';
  const src = a?.meta?.source;
  if (typeof src === 'string' && GENERATED_META_SOURCES.has(src)) return 'generated';
  if (a?.category && GENERATED_CATEGORIES.has(a.category)) return 'generated';
  return 'upload';
}

export const SOURCE_LABEL: Record<AssetSource | 'all', string> = {
  all: '全部',
  upload: '我上传的',
  generated: 'AI 生成',
};
