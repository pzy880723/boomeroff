// 判定素材的来源类别。三类一级来源:
//   base       = 基础素材图(门店实拍/商品原图,长期反复使用)
//   upload     = 普通上传(一次性参考)
//   generated  = AI 生成(分镜头/智能广告图)
//
// 数据写入新规范:meta.asset_class ∈ {'base'|'upload'|'generated'}
// 旧数据兼容:按 meta.source / category / tags 推断。

export type AssetSource = 'base' | 'upload' | 'generated';

const GENERATED_META_SOURCES = new Set([
  'storyboard', 'ai_smart_ad', 'ai-smart-ad', 'ai_image',
  'smart_ad', 'generated', 'ai_generated',
]);
const GENERATED_CATEGORIES = new Set(['分镜头', 'AI生成', 'AI 生成', 'ai生成']);

// 基础素材判定关键字(门店实拍场景)
const BASE_CATEGORIES = new Set(['店铺', '门店', '场景图']);
const BASE_TAG_HINTS = ['门头', '店招', '店内', '橱窗', '货架', '收银台', '门口', '店面'];

export function assetSource(a: { category?: string | null; meta?: any; tags?: string[] | null } | null | undefined): AssetSource {
  if (!a) return 'upload';
  // 优先尊重显式标记
  const klass = a?.meta?.asset_class;
  if (klass === 'base' || klass === 'upload' || klass === 'generated') return klass;

  // 旧数据回退
  const src = a?.meta?.source;
  if (typeof src === 'string' && GENERATED_META_SOURCES.has(src)) return 'generated';
  if (a?.category && GENERATED_CATEGORIES.has(a.category)) return 'generated';

  if (a?.category && BASE_CATEGORIES.has(a.category)) return 'base';
  const tags = Array.isArray(a?.tags) ? a!.tags! : [];
  if (tags.some((t) => BASE_TAG_HINTS.includes(String(t)))) return 'base';

  return 'upload';
}

export const SOURCE_LABEL: Record<AssetSource | 'all', string> = {
  all: '全部',
  base: '基础素材',
  upload: '我上传的',
  generated: 'AI 生成',
};
