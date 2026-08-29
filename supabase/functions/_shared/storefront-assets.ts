export interface StorefrontAssetLike {
  id?: string;
  output_url?: unknown;
  category?: unknown;
  tags?: unknown;
  summary?: unknown;
  role?: unknown;
  meta?: {
    summary?: unknown;
    ai_caption?: {
      summary?: unknown;
      tags?: unknown;
    };
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

const STRONG_PHRASES = [
  '店铺入口全景', '门店入口全景', '门头全景', '门头照', '店铺门头',
  '门店门头', '全景门头', '店铺入口', '门店入口', '开放式店面', '外立面',
  '店招', '招牌', 'storefront', 'facade',
];

const INTERIOR_PHRASES = [
  '店内陈列', '店面陈列', '餐具陈列', '商品陈列', '货架', '满墙',
  '摆件', '翻筐', '收银台', '试衣镜', '商品墙', '餐具墙',
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').toLowerCase()) : [];
}

function includesAny(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => value.includes(phrase.toLowerCase()));
}

export function scoreStorefrontAsset(asset: StorefrontAssetLike): number {
  const meta = asset?.meta || {};
  const aiCaption = meta.ai_caption || {};
  const summaries = [asset?.summary, meta.summary, aiCaption.summary]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);
  const tags = [...strings(asset?.tags), ...strings(aiCaption.tags)];
  const category = String(asset?.category || '').toLowerCase();
  const summaryText = summaries.join(' ');
  const tagText = tags.join(' ');

  let score = 0;
  for (const phrase of STRONG_PHRASES) {
    if (summaryText.includes(phrase.toLowerCase())) score += 45;
    if (tagText.includes(phrase.toLowerCase())) score += 25;
  }
  if (includesAny(summaryText, ['入口全景', '门头全景'])) score += 45;
  // “探店首图”由运营明确标注为该门店的标准入口原件，必须压过
  // 仅凭 AI 摘要命中的门头近景，避免首镜和封面每次换成不同入口图。
  if (includesAny(tagText, ['探店首图'])) score += 1000;
  else if (includesAny(tagText, ['开场首图'])) score += 900;
  if (includesAny(summaryText, ['logo', 'boomer·off', 'boomer off'])) score += 15;
  if (asset?.role === 'storefront') score += 10;
  if (category === '店铺' || category === '门店') score += 5;

  for (const phrase of INTERIOR_PHRASES) {
    if (summaryText.includes(phrase)) score -= 25;
  }
  return score;
}

export function pickStorefrontAsset<T extends StorefrontAssetLike>(assets: T[]): T | null {
  const ranked = assets
    .map((asset) => ({ asset, score: scoreStorefrontAsset(asset) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= 60 ? ranked[0].asset : null;
}

export function resolveStorefrontAsset<T extends StorefrontAssetLike>(
  assets: T[],
  preferredUrl?: string | null,
): T | null {
  const normalizedPreferredUrl = String(preferredUrl || '').trim();
  if (normalizedPreferredUrl) {
    const preferred = assets.find((asset) =>
      String(asset?.output_url || '').trim() === normalizedPreferredUrl
    );
    if (preferred) return preferred;
  }
  return pickStorefrontAsset(assets);
}
