export interface StorefrontAssetLike {
  id?: string;
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
  if (includesAny(tagText, ['探店首图', '开场首图'])) score += 110;
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
