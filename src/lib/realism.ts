export type Realism = 'stylized' | 'photoreal';
export const DEFAULT_REALISM: Realism = 'stylized';

export const REALISM_OPTIONS: { value: Realism; label: string; hint: string }[] = [
  { value: 'stylized', label: '插画风', hint: '默认 · 过审稳定' },
  { value: 'photoreal', label: '真人写实', hint: '细节最真 · 偶尔触发审核' },
];

export function realismLabel(r: Realism): string {
  return REALISM_OPTIONS.find((o) => o.value === r)?.label || '插画风';
}
