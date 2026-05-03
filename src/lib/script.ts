// 话术归一化工具：兼容新旧两种结构
// 新结构（识别结果）：
//   sellingPoints: Array<{ tag: '身世'|'工艺'|'稀缺'|'场景'; text: string }>
//   pitch: { opener: string; highlight: string }
//   tips: { memory?: string; objection?: string }  (DB 里以 JSON 字符串保存到 text 字段)
// 旧结构：
//   sellingPoints: string[]
//   description: string
//   tips: string

export type SellingTag = '身世' | '工艺' | '稀缺' | '场景';

export interface SellingPoint {
  tag: SellingTag;
  text: string;
}

export interface Pitch {
  opener: string;
  highlight: string;
  story?: string;
}

export interface TipsObj {
  memory?: string;
  objection?: string;
}

const VALID_TAGS: SellingTag[] = ['身世', '工艺', '稀缺', '场景'];

export function normalizeSellingPoints(raw: unknown): SellingPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: SellingPoint[] = [];
  for (const item of raw) {
    if (!item) continue;
    if (typeof item === 'string') {
      const t = item.trim();
      if (t) out.push({ tag: '工艺', text: t });
    } else if (typeof item === 'object') {
      const obj = item as { tag?: unknown; text?: unknown };
      const text = typeof obj.text === 'string' ? obj.text.trim() : '';
      if (!text) continue;
      const tag = (typeof obj.tag === 'string' && VALID_TAGS.includes(obj.tag as SellingTag))
        ? (obj.tag as SellingTag)
        : '工艺';
      out.push({ tag, text });
    }
  }
  return out;
}

export function normalizePitch(raw: unknown, fallbackDescription?: string): Pitch | null {
  if (raw && typeof raw === 'object') {
    const obj = raw as { opener?: unknown; highlight?: unknown; story?: unknown };
    const opener = typeof obj.opener === 'string' ? obj.opener.trim() : '';
    const highlight = typeof obj.highlight === 'string' ? obj.highlight.trim() : '';
    const story = typeof obj.story === 'string' ? obj.story.trim() : '';
    if (opener || highlight || story) return { opener, highlight, story: story || undefined };
  }
  // 旧数据兜底：把 description 拆成两句
  const desc = (fallbackDescription || '').trim();
  if (!desc) return null;
  const parts = desc.split(/(?<=。|！|？)/).filter(s => s.trim());
  return {
    opener: (parts[0] || desc).slice(0, 40).trim(),
    highlight: parts.slice(1).join('').trim(),
  };
}

export function normalizeTips(raw: unknown): TipsObj | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const obj = raw as { memory?: unknown; objection?: unknown };
    const memory = typeof obj.memory === 'string' ? obj.memory.trim() : '';
    const objection = typeof obj.objection === 'string' ? obj.objection.trim() : '';
    if (memory || objection) return { memory: memory || undefined, objection: objection || undefined };
    return null;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    // 如果是 JSON 字符串就解析
    if (t.startsWith('{')) {
      try { return normalizeTips(JSON.parse(t)); } catch { /* fallthrough */ }
    }
    return { memory: t };
  }
  return null;
}

// 把 tips 对象序列化为 DB text 字段
export function serializeTips(tips: TipsObj | string | null | undefined): string | null {
  if (!tips) return null;
  if (typeof tips === 'string') return tips.trim() || null;
  const memory = tips.memory?.trim();
  const objection = tips.objection?.trim();
  if (!memory && !objection) return null;
  return JSON.stringify({ memory, objection });
}

// 拼接朗读全文
export function buildSpeakText(opts: {
  pitch?: Pitch | null;
  sellingPoints?: SellingPoint[];
  description?: string | null;
}): string {
  const parts: string[] = [];
  if (opts.pitch?.opener) parts.push(opts.pitch.opener);
  if (opts.pitch?.highlight) parts.push(opts.pitch.highlight);
  if (opts.pitch?.story) parts.push(opts.pitch.story);
  if (!opts.pitch?.story && opts.sellingPoints?.length) {
    parts.push(opts.sellingPoints.map(s => s.text).join('，') + '。');
  }
  if (parts.length === 0 && opts.description) parts.push(opts.description);
  return parts.join('').replace(/\s+/g, '');
}

export const SELLING_TAG_STYLE: Record<SellingTag, string> = {
  身世: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/40',
  工艺: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800/40',
  稀缺: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800/40',
  场景: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40',
};
