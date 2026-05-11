// 一键生成图文文案 —— 本地模板兜底（断网/限额时也立刻可出）
import { CATEGORY_LABELS } from '@/types';
import { normalizeSellingPoints } from '@/lib/script';

export type ShareStyle = 'xhs' | 'pyq' | 'collector';

export const STYLE_LABELS: Record<ShareStyle, string> = {
  xhs: '小红书种草',
  pyq: '朋友圈随手',
  collector: '藏家口吻',
};

export interface ShareCopyInput {
  name: string;
  category?: string;
  era?: string | null;
  origin?: string | null;
  material?: string | null;
  craft?: string | null;
  brand?: string | null;
  story?: string | null;
  sellingPoints?: unknown;
}

const FOOTER = '— AI 生成仅供欣赏 · via BOOMER-OFF —';

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const cleanText = (s?: string | null): string => (s || '').replace(/\s+/g, ' ').trim();

function pickPoints(sellingPoints: unknown, n = 2): string[] {
  const sp = normalizeSellingPoints(sellingPoints as any);
  return sp
    .map((p) => (typeof p === 'string' ? p : p?.text || ''))
    .map(cleanText)
    .filter(Boolean)
    .slice(0, n);
}

function buildXhs(input: ShareCopyInput): string {
  const points = pickPoints(input.sellingPoints, 2);
  const eraOrigin = [input.era, input.origin].filter(Boolean).join('·');
  const open = pick([
    `姐妹们！！今天逛中古一眼相中这只「${input.name}」👀`,
    `啊啊啊救命，这只「${input.name}」我真的一眼沦陷 💘`,
    `偶遇这只「${input.name}」，原地心动了三秒钟 ✨`,
  ]);
  const middleParts: string[] = [];
  if (input.brand) middleParts.push(`是${input.brand}的老物件`);
  if (eraOrigin) middleParts.push(`${eraOrigin}的味道一下子就出来了`);
  if (input.material || input.craft) {
    middleParts.push(`${[input.material, input.craft].filter(Boolean).join('+')}的细节真的绝`);
  }
  if (points[0]) middleParts.push(points[0]);
  if (points[1]) middleParts.push(points[1]);
  const middle = middleParts.length
    ? middleParts.join('，') + '。'
    : '细节是真的能看半天，越看越上头。';
  const close = pick([
    '一不小心就剁手了，背回家供着 🥺',
    '理智？不存在的，已经在打包了 🛍️',
    '真的求大家拦我，下一秒就要刷卡 💳',
  ]);
  return [open, middle, close, '', FOOTER].join('\n');
}

function buildPyq(input: ShareCopyInput): string {
  const points = pickPoints(input.sellingPoints, 2);
  const eraOrigin = [input.era, input.origin].filter(Boolean).join(' · ');
  const open = pick([
    `周末翻中古，遇到一只${input.name}。`,
    `今天的小确幸：一只${input.name}。`,
    `窗边那只${input.name}，看了一眼就走不动了。`,
  ]);
  const middleParts: string[] = [];
  if (input.brand) middleParts.push(`${input.brand} 的老件`);
  if (eraOrigin) middleParts.push(eraOrigin);
  if (input.material || input.craft) {
    middleParts.push([input.material, input.craft].filter(Boolean).join('，'));
  }
  if (points[0]) middleParts.push(points[0]);
  if (points[1]) middleParts.push(points[1]);
  const middle = middleParts.length
    ? middleParts.join('，') + '。'
    : '握在手里那一刻，时代感就跑出来了。';
  const close = pick([
    '理性败给眼缘，已经带回家。',
    '一不小心就入了，决定不后悔。',
    '收好了，慢慢用，慢慢看。',
  ]);
  return [open, middle, close, '', FOOTER].join('\n');
}

function buildCollector(input: ShareCopyInput): string {
  const points = pickPoints(input.sellingPoints, 3);
  const eraOrigin = [input.era, input.origin].filter(Boolean).join(' · ');
  const open = pick([
    `今日入：「${input.name}」。`,
    `近来寻到一只「${input.name}」，分享一下。`,
    `偶得「${input.name}」，记一笔。`,
  ]);
  const meta: string[] = [];
  if (input.brand) meta.push(`品牌 ${input.brand}`);
  if (eraOrigin) meta.push(eraOrigin);
  if (input.material) meta.push(`材质 ${input.material}`);
  if (input.craft) meta.push(`工艺 ${input.craft}`);
  const metaLine = meta.length ? meta.join('，') + '。' : '';
  const detail = points.length
    ? '看点：' + points.join('；') + '。'
    : '上手沉甸甸的，做工经得起细看。';
  const close = pick([
    '能在今天遇到，是缘分，也是运气。',
    '老物件不必多言，懂的人自然会停下来。',
    '挑回家，慢慢养，比新货更有故事。',
  ]);
  return [open, metaLine, detail, close, '', FOOTER].filter(Boolean).join('\n');
}

export function buildLocalShareCopy(input: ShareCopyInput, style: ShareStyle): string {
  const safe: ShareCopyInput = {
    ...input,
    name: cleanText(input.name) || '中古好物',
    era: cleanText(input.era),
    origin: cleanText(input.origin),
    material: cleanText(input.material),
    craft: cleanText(input.craft),
    brand: cleanText(input.brand),
  };
  if (style === 'xhs') return buildXhs(safe);
  if (style === 'pyq') return buildPyq(safe);
  return buildCollector(safe);
}

// 给 AI / 兜底统一去除"主播"等违禁词
export function sanitizeShareCopy(s: string): string {
  return (s || '')
    .replace(/主播/g, '店员')
    .replace(/直播间/g, '店里');
}

export function categoryLabel(cat?: string): string {
  if (!cat) return '';
  return (CATEGORY_LABELS as Record<string, string>)[cat] || '';
}
