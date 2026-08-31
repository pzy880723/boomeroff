export type SurpriseContentScopeKey = 'all' | 'ceramics' | 'toys' | 'music' | 'accessories';

export interface SurpriseContentScopeOption {
  key: SurpriseContentScopeKey;
  label: string;
  hint: string;
}

export const SURPRISE_CONTENT_SCOPES: SurpriseContentScopeOption[] = [
  { key: 'all', label: '全品类', hint: '自动挑 2-3 类最适合拍的商品' },
  { key: 'ceramics', label: '瓷器餐具', hint: '杯盘碗碟 · 6.9 元起' },
  { key: 'toys', label: '玩具公仔', hint: '玩偶 · 手办 · 动漫周边' },
  { key: 'music', label: '唱片音响', hint: '黑胶 · 磁带 · 复古设备' },
  { key: 'accessories', label: '首饰配饰', hint: '项链 · 耳饰 · 复古搭配' },
];

export function surpriseContentScopeLabel(key: SurpriseContentScopeKey): string {
  return SURPRISE_CONTENT_SCOPES.find((scope) => scope.key === key)?.label || '全品类';
}

export function isSurpriseContentScopeKey(value: unknown): value is SurpriseContentScopeKey {
  return SURPRISE_CONTENT_SCOPES.some((scope) => scope.key === value);
}
