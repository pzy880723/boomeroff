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

// ─────────────── 小红书爆文兜底 ───────────────
export type ViralStyle = 'scream' | 'heal' | 'story' | 'flex';

export const VIRAL_STYLE_LABELS: Record<ViralStyle, string> = {
  scream: '🔥 尖叫安利',
  heal: '✨ 治愈日记',
  story: '📖 故事悬念',
  flex: '💎 凡尔赛藏',
};

export interface ViralCopy {
  title: string;
  body: string;
  hashtags: string[];
  first_comment: string;
  style: ViralStyle;
}

const TITLE_TEMPLATES: Record<ViralStyle, ((n: string) => string)[]> = {
  scream: [
    (n) => `🔥救命!!!这只${n}我真的会哭😭`,
    (n) => `姐妹些‼️ 谁懂啊 这只${n}封神了💥`,
    (n) => `别问 问就是冲🛍️ ${n}必入清单+1✨`,
    (n) => `整条街我最爱的 3 件之一 ${n}🥹💘`,
  ],
  heal: [
    (n) => `☕️ 周末·中古日记 / ${n} 篇🌿`,
    (n) => `✨ 在窗边坐了一下午 · ${n}🥛`,
    (n) => `🍃 i 人友好·安静好物分享 ${n}`,
    (n) => `🕯️ 一只会发光的${n} 治愈到心里`,
  ],
  story: [
    (n) => `在巷子深处翻到这只${n}…👀 故事在最后`,
    (n) => `以为是普通${n}…结果老板说🫣📖`,
    (n) => `99% 的人没见过的${n}💎 看完别走开`,
    (n) => `这只${n}背后藏着一段故事📖 你猜得到吗？`,
  ],
  flex: [
    (n) => `💎 随手翻到的小东西…居然是${n}🫣`,
    (n) => `懂的人自然懂 · ${n}·昭和真品✨`,
    (n) => `中古迷请进 | 今日入：${n} 📓`,
    (n) => `今日入手记 · 一只${n} 安静收好🤍`,
  ],
};

const OPENERS: Record<ViralStyle, string[]> = {
  scream: [
    '啊啊啊救命💔 我真的一眼沦陷',
    '姐妹些!!!🔥 这次真的不是滤镜',
    '原地心动 ❤️‍🔥 钱包已被掏空',
  ],
  heal: [
    '☕️ 一个安静的下午，遇到它',
    '🌿 窗边的光刚好落在上面',
    '🕯️ 没有滤镜，只是它本来的样子',
  ],
  story: [
    '👀 走进去的时候没打算买什么…',
    '📖 老板说这只有故事，我蹲下来听',
    '🫧 谁能想到，转角就遇到它',
  ],
  flex: [
    '🫣 随手翻筐翻到的，不声张',
    '✨ 一件不张扬的小物，懂的人会停下',
    '📓 今日记一笔：低调入手',
  ],
};

const CLOSERS: Record<ViralStyle, string[]> = {
  scream: ['真的求大家拦我!!!🛍️💳', '一秒下单 没有犹豫🥹', '冲冲冲 我先冲为敬🔥'],
  heal: ['慢慢用，慢慢看🤍', '把这份安静带回家🌙', '今天的小确幸+1☁️'],
  story: ['故事就到这里，剩下的请你自己来听📖', '这只它现在在店里等下一个人👀', '懂的人会读出后半段✨'],
  flex: ['懂的人自然懂🤍', '不必多言，缘分而已🫧', '挑回家慢慢养，比新货有故事📓'],
};

const FIRST_COMMENTS: Record<ViralStyle, string[]> = {
  scream: ['冲不冲！评论区扣 1 我帮你留着 🔥', '姐妹们觉得这只值不值？说说！💬'],
  heal: ['你最近遇到的小治愈是什么？☕️', '想看更多这种安静好物吗？🌿'],
  story: ['猜猜它真正的年代？评论区揭晓 👀', '想听完整故事的扣个 1，我接着写 📖'],
  flex: ['同好可以扣个 1，互相交流 🤍', '懂的来评论区接头 💎'],
};

const DEFAULT_TAGS = ['#中古好物', '#vintage', '#BOOMEROFF', '#中古杂货铺', '#古着'];
const STYLE_TAGS: Record<ViralStyle, string[]> = {
  scream: ['#闭眼入', '#必入清单', '#踩雷预警反向版', '#冲冲冲', '#省流好物'],
  heal: ['#治愈系好物', '#i人友好', '#周末小确幸', '#岁月静好', '#家居美学'],
  story: ['#中古故事', '#老物件', '#年代感', '#淘宝日记', '#探店日记'],
  flex: ['#藏家分享', '#昭和复古', '#中古迷请进', '#懂的人自然懂', '#低调炫耀'],
};

function pickPointsViral(sellingPoints: unknown, n = 3): string[] {
  const sp = normalizeSellingPoints(sellingPoints as any);
  return sp
    .map((p) => (typeof p === 'string' ? p : p?.text || ''))
    .map(cleanText)
    .filter(Boolean)
    .slice(0, n);
}

const EMOJI_POOL = ['✨', '💫', '🌙', '🤍', '🫧', '📖', '🥹', '🔥', '💎', '🌿', '☕️', '🕯️', '🛍️', '💘', '🥛'];
const decorate = (s: string, i: number) => `${s} ${EMOJI_POOL[i % EMOJI_POOL.length]}`;

export function buildXhsViral(input: ShareCopyInput, style: ViralStyle = 'scream'): ViralCopy {
  const name = cleanText(input.name) || '中古好物';
  const eraOrigin = [input.era, input.origin].filter(Boolean).join('·');
  const meta: string[] = [];
  if (input.brand) meta.push(`${input.brand}`);
  if (eraOrigin) meta.push(eraOrigin);
  if (input.material) meta.push(`${input.material}`);
  if (input.craft) meta.push(`${input.craft}`);

  const points = pickPointsViral(input.sellingPoints, 3);

  const title = pick(TITLE_TEMPLATES[style])(name);
  const opener = pick(OPENERS[style]);
  const closer = pick(CLOSERS[style]);

  const metaLine = meta.length ? decorate(meta.join(' ｜ '), 0) : '';
  const pointLines = points.length
    ? points.map((p, i) => decorate(p, i + 1)).join('\n')
    : decorate('细节经得起细看，上手就知道分量', 1);

  const body = [
    opener,
    '─────────',
    metaLine,
    pointLines,
    '─────────',
    closer,
  ].filter(Boolean).join('\n');

  const tags = Array.from(new Set([
    ...DEFAULT_TAGS,
    ...STYLE_TAGS[style],
    input.category ? `#${(CATEGORY_LABELS as Record<string, string>)[input.category] || input.category}` : '',
  ].filter(Boolean))).slice(0, 12) as string[];

  return {
    title: sanitizeShareCopy(title),
    body: sanitizeShareCopy(body),
    hashtags: tags,
    first_comment: sanitizeShareCopy(pick(FIRST_COMMENTS[style])),
    style,
  };
}
