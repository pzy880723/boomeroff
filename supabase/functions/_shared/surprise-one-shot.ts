// 「惊喜一下」15秒极速成片：一条连续中文口播 + 5 段等价对白时间锚点。
// 店员看五段清晰脚本，Seedance 朗读同一份连续全文；切镜只切画面，不重开人声。

export interface SurpriseClip {
  scene?: string;
  action?: string;
  dialogue?: string;
  subtitle?: string;
  image_index?: number | null;
  duration_s?: number;
  motion?: string;
  cut_on_keyword?: string;
  [key: string]: unknown;
}

export interface SurpriseVisualBeat {
  start_s: number;
  end_s: number;
  visual: string;
  action: string;
  motion: string;
  image_index: number | null;
  cut_on_keyword: string;
}

export interface SurpriseScript {
  hook: SurpriseClip;
  scenes: SurpriseClip[];
  outro: SurpriseClip;
  total_duration_s?: number;
  aspect?: string;
  continuous_dialogue?: string;
  dialogue_char_count?: number;
  speech_start_s?: number;
  speech_end_s?: number;
  speech_rate?: string;
  max_silence_s?: number;
  visual_beats?: SurpriseVisualBeat[];
  [key: string]: unknown;
}

export interface SurpriseReferenceDescription {
  index: number;
  summary?: string;
  role?: string;
}

export interface SurpriseReferenceItem {
  sourceIndex: number;
  referenceNumber: number;
  url: string;
  summary: string;
  role: string;
}

export interface SurpriseReferencePlan {
  urls: string[];
  items: SurpriseReferenceItem[];
  referenceNumberBySourceIndex: Record<number, number>;
}

const BEAT_WINDOWS: Array<[number, number]> = [
  [0, 3],
  [3, 6],
  [6, 9],
  [9, 12],
  [12, 15],
];

const BEAT_LABELS = ['强钩子', '进店发现', '上手体验', '核心种草', '行动召唤'];

// 15 秒原生 Seedance 人声：60–72 汉字是自然偏快（约 270–320 字/分钟）且不吞字的安全区间。
export const SURPRISE_MIN_CN = 60;
export const SURPRISE_MAX_CN = 72;
// 兜底轮次（最后一次校验）允许的宽松区间，仍以 72 为硬上限。
export const SURPRISE_RELAXED_MIN_CN = 52;
export const SURPRISE_RELAXED_MAX_CN = 72;
// 单个节拍建议字数
export const SURPRISE_BEAT_MIN_CN = 8;
export const SURPRISE_BEAT_MAX_CN = 18;

// 会拖慢连续口播的语气词/客套词，一律清掉
const FILLER_PATTERNS: RegExp[] = [
  /大家好[，,、!！。.]?/g,
  /各位姐妹[，,、!！。.]?/g,
  /姐妹们好[，,、!！。.]?/g,
  /嗯+/g,
  /啊+/g,
  /呃+/g,
  /哎+/g,
  /那个+/g,
  /然后+/g,
  /就是说+/g,
  /其实就是+/g,
  /就是+/g,
  /所以说+/g,
];

const FALLBACK_DIALOGUES = [
  '来上海别错过这家中古宝藏店',
  '一走进店满眼复古杂货和老物件',
  '玩具瓷器唱片随手一拿都有故事',
  '预算不高也能挑到独特小惊喜',
  '放进攻略到店认真翻上一圈',
];

const FALLBACK_SUBTITLES = [
  '藏满惊喜的中古空间',
  '每排都值得认真翻',
  '每件小物都有故事',
  '低预算也能淘到惊喜',
  '放进攻略现在就来',
];

function chineseLength(value: string): number {
  return (value || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
}

function stripFillers(value: string): string {
  let out = value || '';
  for (const p of FILLER_PATTERNS) out = out.replace(p, '');
  return out;
}

function normalizePunctuation(value: string): string {
  return (value || '')
    // 句号 / 感叹号 / 省略号 → 逗号，保持一条不停的语流
    .replace(/[。.!！?？]+/g, '，')
    .replace(/…{2,}|\.{2,}/g, '，')
    .replace(/[;；:：]+/g, '，')
    // 合并重复逗号 / 顿号
    .replace(/[，,、]{2,}/g, '，')
    // 全部改成中文逗号
    .replace(/,/g, '，')
    // 去除首尾标点和空白
    .replace(/^[，、\s]+/, '')
    .replace(/[，、\s]+$/, '')
    .replace(/\s+/g, '');
}

function truncateToChinese(value: string, maxCn: number): string {
  let count = 0;
  let out = '';
  for (const ch of value) {
    const isHan = /[\u4e00-\u9fa5]/.test(ch);
    if (isHan) {
      if (count >= maxCn) break;
      count += 1;
    }
    out += ch;
  }
  return out.replace(/[，、,]+$/u, '');
}

function dialogueChunksFromClips(script: SurpriseScript): string[] {
  const clips = [script.hook, ...(script.scenes || []), script.outro];
  return clips
    .map((c) => stripFillers(String(c?.dialogue || '').trim()))
    .map(normalizePunctuation);
}

function splitContinuousDialogue(value: string): string[] {
  const chunks = normalizePunctuation(stripFillers(value || ''))
    .split(/[，、]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 5) return chunks;
  if (chunks.length < 5) return [];

  const groups: string[] = [];
  let remainingLength = chunks.reduce((sum, chunk) => sum + chineseLength(chunk), 0);
  let cursor = 0;
  for (let groupIndex = 0; groupIndex < 5; groupIndex += 1) {
    const remainingGroups = 5 - groupIndex;
    const target = Math.max(1, Math.round(remainingLength / remainingGroups));
    const group: string[] = [];
    let length = 0;
    while (cursor < chunks.length && (group.length === 0 || length < target)) {
      const chunksLeft = chunks.length - cursor;
      if (chunksLeft <= remainingGroups - 1 && group.length > 0) break;
      const chunk = chunks[cursor];
      group.push(chunk);
      length += chineseLength(chunk);
      cursor += 1;
    }
    groups.push(group.join('、'));
    remainingLength -= length;
  }
  return groups.length === 5 && groups.every(Boolean) ? groups : [];
}

function splitFlatIntoFive(flat: string): string[] {
  const chars = flat.replace(/[，、\s]/g, '');
  if (!chars) return [];
  const base = Math.floor(chars.length / 5);
  const extra = chars.length % 5;
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < 5; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    out.push(chars.slice(cursor, cursor + size));
    cursor += size;
  }
  return out.every(Boolean) ? out : [];
}

// 硬上限：连续口播不得超过 SURPRISE_MAX_CN 个汉字（吞字/卡顿的主因）。
// 只做截断，绝不重复内容去补下限。
function clampBeatDialogues(chunks: string[]): string[] {
  if (chunks.length !== 5 || !chunks.every(Boolean)) return chunks;
  const total = chineseLength(chunks.join('，'));
  if (total <= SURPRISE_MAX_CN) return chunks;
  const clipped = truncateToChinese(chunks.join('，'), SURPRISE_MAX_CN);
  const byComma = splitContinuousDialogue(clipped);
  if (byComma.length === 5 && byComma.every(Boolean)) return byComma;
  const flat = splitFlatIntoFive(clipped);
  return flat.length === 5 ? flat : chunks;
}

function ensureBeatDialogues(raw: string, script: SurpriseScript): string[] {
  const clipChunks = dialogueChunksFromClips(script);
  const rawChunks = splitContinuousDialogue(raw);
  const inRange = (chunks: string[]) => {
    if (chunks.length !== 5 || !chunks.every(Boolean)) return false;
    const length = chineseLength(chunks.join('，'));
    return length >= SURPRISE_MIN_CN && length <= SURPRISE_MAX_CN;
  };
  // 优先使用长度合格的一套；模型经常把 continuous_dialogue 写对、五段写歪（或反过来）。
  const balanced = (chunks: string[]) =>
    chunks.every((chunk) => {
      const length = chineseLength(chunk);
      return length >= SURPRISE_BEAT_MIN_CN && length <= SURPRISE_BEAT_MAX_CN;
    });
  const rebalance = (chunks: string[]) => {
    if (balanced(chunks)) return chunks;
    const byComma = splitContinuousDialogue(chunks.join('，'));
    if (byComma.length === 5 && byComma.every(Boolean) && balanced(byComma)) return byComma;
    // 逗号分组仍然畸形（模型把两三句塞进一段），按字数均切，内容顺序保持不变。
    const cut = splitFlatIntoFive(chunks.join(''));
    return cut.length === 5 ? cut : (byComma.length === 5 && byComma.every(Boolean) ? byComma : chunks);
  };

  if (inRange(clipChunks)) return clampBeatDialogues(rebalance(clipChunks));
  if (inRange(rawChunks)) return clampBeatDialogues(rebalance(rawChunks));

  const source = clipChunks.length === 5 && clipChunks.every(Boolean) ? clipChunks : rawChunks;
  if (source.length === 5 && source.every(Boolean)) {
    // 内容不改，只把逗号短句重新均分成 5 段，避免出现 30 字/8 字这种畸形分段。
    const rebalanced = splitContinuousDialogue(source.join('，'));
    const picked = rebalanced.length === 5 && rebalanced.every(Boolean) ? rebalanced : source;
    return clampBeatDialogues(picked);
  }
  // 只有模型完全没有返回可用五段结构时，才使用保底脚本避免空对象继续向下游扩散。
  return [...FALLBACK_DIALOGUES];
}

const SILENT_ACTION_WORDS = /停下来|停下|停顿|静默|沉默|思考|等待|闭嘴|不说话/g;
const SPEAKING_ACTION_HINT =
  /(?:边|一边).{0,24}(?:说|讲|喊|口播|介绍)|(?:继续|持续).{0,12}(?:说|讲|喊|口播)|对镜头.{0,16}(?:说|讲|喊|口播|介绍)/;

function ensureSpeakingAction(value: string, index: number): string {
  let action = String(value || '').replace(SILENT_ACTION_WORDS, '').replace(/[，,、]{2,}/g, '，').trim();
  action = action.replace(/^[，,、]+|[，,、]+$/g, '');
  if (!action) action = `${BEAT_LABELS[index]}镜头跟随`;
  if (!SPEAKING_ACTION_HINT.test(action)) action = `${action}，边演示边对镜头继续说`;
  return action;
}


function normalizeClip(value: unknown): SurpriseClip {
  const clip = value && typeof value === 'object' ? { ...(value as SurpriseClip) } : {};
  return {
    ...clip,
    scene: String(clip.scene || '').trim(),
    action: String(clip.action || '').trim(),
    dialogue: String(clip.dialogue || '').trim(),
    subtitle: String(clip.subtitle || '').trim(),
    image_index: Number.isInteger(clip.image_index) && Number(clip.image_index) >= 0
      ? Number(clip.image_index)
      : null,
    duration_s: 3,
    motion: String(clip.motion || '手持跟拍').trim(),
    cut_on_keyword: String(clip.cut_on_keyword || '').trim(),
  };
}

function deriveVisualBeats(script: SurpriseScript, continuous: string): SurpriseVisualBeat[] {
  const clips = [script.hook, ...(script.scenes || []), script.outro];
  // 从连续口播中挑关键词做画面切点：把 dialogue 按逗号切成若干短句，取第 1/2/3/4/5 段的头几字。
  const chunks = continuous.split(/[，、]/).filter(Boolean);
  const chunkOf = (i: number) => (chunks[i] || chunks[chunks.length - 1] || '').slice(0, 6);
  return BEAT_WINDOWS.map(([start, end], i) => {
    const clip = clips[i] || {};
    const scene = String(clip.scene || '').trim();
    const action = String(clip.action || '').trim();
    const motion = String(clip.motion || (i === 0 ? '手持推镜' : i === 4 ? '拉镜定格' : '手持跟拍')).trim();
    const imgIdx = Number.isInteger(clip.image_index) && Number(clip.image_index) >= 0
      ? Number(clip.image_index)
      : null;
    const keyword = String(clip.cut_on_keyword || chunkOf(i)).trim();
    return {
      start_s: start,
      end_s: end,
      visual: scene || `${BEAT_LABELS[i]}画面`,
      action: action || `${BEAT_LABELS[i]}对镜头继续说`,
      motion,
      image_index: imgIdx,
      cut_on_keyword: keyword,
    };
  });
}

export function normalizeSurpriseScript(input: SurpriseScript): SurpriseScript {
  const script = input && typeof input === 'object' ? { ...input } : ({} as SurpriseScript);
  const hook = normalizeClip(script.hook);
  const outro = normalizeClip(script.outro);
  const scenes = Array.isArray(script.scenes)
    ? script.scenes.slice(0, 3).map(normalizeClip)
    : [];

  while (scenes.length < 3) {
    const index = scenes.length;
    scenes.push(normalizeClip({
      scene: hook.scene || 'BOOMER·OFF 店内货架与翻筐区',
      action: '边逛边拿起一件好物对镜头继续说话',
      dialogue: FALLBACK_DIALOGUES[index + 1],
      subtitle: FALLBACK_SUBTITLES[index + 1],
      image_index: null,
      motion: '手持跟拍',
    }));
  }

  const nextScript: SurpriseScript = {
    ...script,
    hook,
    scenes,
    outro,
    total_duration_s: 15,
    aspect: '9:16',
    one_shot_prompt: '',
    speech_start_s: 0.2,
    speech_end_s: 14.5,
    speech_rate: 'natural_fast_clear',
    speech_cpm_min: 270,
    speech_cpm_max: 320,
    min_pause_s: 0.15,
    max_silence_s: 0.35,
  };

  const clips = [nextScript.hook, ...nextScript.scenes, nextScript.outro];
  const dialogues = ensureBeatDialogues(String(script.continuous_dialogue || ''), nextScript);
  clips.forEach((clip, index) => {
    clip.dialogue = dialogues[index];
    // 字幕只允许来自最终对白，避免模型同时返回两套文本后发生错位。
    clip.subtitle = dialogues[index];
    // 动作必须是“边演边连续说”，否则 Seedance 会在切镜处停声。
    clip.action = ensureSpeakingAction(String(clip.action || ''), index);
  });

  const continuous = dialogues.join('，');
  nextScript.continuous_dialogue = continuous;
  nextScript.dialogue_char_count = chineseLength(continuous);

  // 用 AI 提供的 visual_beats（若合法）或按 clips 派生。
  const providedBeats = Array.isArray(script.visual_beats) ? script.visual_beats : null;
  const beats = providedBeats && providedBeats.length === 5
    ? providedBeats.map((b, i) => ({
        start_s: BEAT_WINDOWS[i][0],
        end_s: BEAT_WINDOWS[i][1],
        visual: String(b?.visual || '').trim() || `${BEAT_LABELS[i]}画面`,
        action: String(b?.action || '').trim() || `${BEAT_LABELS[i]}对镜头继续说`,
        motion: String(b?.motion || '手持跟拍').trim(),
        image_index: Number.isInteger(b?.image_index) && Number(b?.image_index) >= 0
          ? Number(b?.image_index) : null,
        cut_on_keyword: String(b?.cut_on_keyword || '').trim(),
      }))
    : deriveVisualBeats(nextScript, continuous);
  nextScript.visual_beats = beats;

  return nextScript;
}

export function bindSurpriseReferences(input: SurpriseScript, imageCount: number): SurpriseScript {
  const script = normalizeSurpriseScript(input);
  const count = Math.max(0, Math.floor(Number(imageCount) || 0));
  if (!count) return script;

  const clips = [script.hook, ...script.scenes, script.outro];
  clips.forEach((clip, clipIndex) => {
    const requested = clip.image_index;
    if (typeof requested === 'number' && Number.isInteger(requested) && requested >= 0 && requested < count) return;
    clip.image_index = Math.min(clipIndex, count - 1);
  });

  // visual_beats 与 clips 保持一致
  (script.visual_beats || []).forEach((beat, i) => {
    const clip = clips[i];
    if (clip && Number.isInteger(clip.image_index) && Number(clip.image_index) >= 0) {
      beat.image_index = Number(clip.image_index);
    } else if (!Number.isInteger(beat.image_index) || Number(beat.image_index) < 0 || Number(beat.image_index) >= count) {
      beat.image_index = Math.min(i, count - 1);
    }
  });
  return script;
}

export function surpriseSpokenText(script: SurpriseScript): string {
  const normalized = normalizeSurpriseScript(script);
  return String(normalized.continuous_dialogue || '').trim();
}

export function buildSurpriseReferencePlan(
  script: SurpriseScript,
  imageUrls: string[],
  descriptions: SurpriseReferenceDescription[] = [],
): SurpriseReferencePlan {
  const descriptionByIndex = new Map(
    descriptions
      .filter((entry) => Number.isInteger(entry?.index) && entry.index >= 0)
      .map((entry) => [entry.index, entry]),
  );
  const urls: string[] = [];
  const items: SurpriseReferenceItem[] = [];
  const referenceNumberBySourceIndex: Record<number, number> = {};
  const seen = new Map<string, number>();
  const clips = [script.hook, ...(script.scenes || []), script.outro];
  const boundIndexes = new Set(
    clips
      .map((clip) => clip?.image_index)
      .filter((index): index is number => Number.isInteger(index) && Number(index) >= 0),
  );
  if (!boundIndexes.size && imageUrls.length) boundIndexes.add(0);

  imageUrls.slice(0, 9).forEach((rawUrl, sourceIndex) => {
    if (!boundIndexes.has(sourceIndex)) return;
    const url = String(rawUrl || '').trim();
    if (!url) return;
    const duplicateNumber = seen.get(url);
    if (duplicateNumber) {
      referenceNumberBySourceIndex[sourceIndex] = duplicateNumber;
      return;
    }
    const referenceNumber = urls.length + 1;
    const description = descriptionByIndex.get(sourceIndex);
    const role = description?.role || (sourceIndex === 0 ? 'storefront' : 'scene');
    const summary = String(description?.summary || (role === 'storefront' ? '门头和开放式店面' : `店内实景${referenceNumber}`))
      .replace(/\s+/g, ' ').trim().slice(0, 120);
    seen.set(url, referenceNumber);
    referenceNumberBySourceIndex[sourceIndex] = referenceNumber;
    urls.push(url);
    items.push({ sourceIndex, referenceNumber, url, summary, role });
  });

  return { urls, items, referenceNumberBySourceIndex };
}

function compactText(value: unknown, maxLength: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function compileSurpriseOneShotPrompt(options: {
  script: SurpriseScript;
  referencePlan: SurpriseReferencePlan;
  styleLabel?: string;
  personaDirective?: string;
  shopContext?: string;
  globalConstraints?: string[];
}): string {
  const script = normalizeSurpriseScript(options.script);
  const continuous = String(script.continuous_dialogue || '').trim();
  const beats = script.visual_beats || deriveVisualBeats(script, continuous);

  const lines: string[] = [];
  lines.push('【生成任务】严格生成一条15秒、9:16、真人写实、高密度门店种草短视频。全片使用同一条连续中文口播音轨，人物从头说到尾，切镜时声音继续，不停顿、不重开、不重复。');
  lines.push(`【整体风格】${compactText(options.styleLabel || '高能真实探店 vlog，手持跟拍，明亮自然，节奏紧凑。', 180)}`);
  if (options.shopContext) lines.push(`【门店事实】${compactText(options.shopContext, 900)}`);

  if (options.referencePlan.items.length) {
    lines.push('【参考图片绑定，编号与请求中的图片顺序完全一致】');
    for (const item of options.referencePlan.items) {
      lines.push(`图片${item.referenceNumber}：${item.summary}。仅用于锁定该门店的真实场景、商品、陈列或构图，不得改为无关内容。`);
    }
  }

  lines.push(`【唯一主角】${compactText(options.personaDirective || '全片只有同一位原创虚构探店博主。锁定同一张脸、发型、年龄、身形、服装和声音，禁止换人、换装、分身或突然出现其他主角。', 300)}`);

  // === 15 秒连续口播 ===
  lines.push('');
  lines.push('【15秒连续口播】');
  lines.push('口播全文：');
  lines.push(`"${continuous}"`);
  lines.push('');
  lines.push('【声音硬规则】');
  lines.push('1. 这是全片唯一的一条连续中文口播音轨，由 Seedance 直接生成同步人声，不使用后配 TTS。');
  lines.push('2. 0.2 秒左右自然开口，说到 14.5 秒左右自然收尾。');
  lines.push('3. 语速自然偏快且清晰，约每分钟 270–320 汉字；宁可稍慢一点，也必须每个字咬清楚，不得吞字、含糊或加速赶字。');
  lines.push('4. 允许在逗号、句号处有 0.15–0.35 秒的自然微停顿和换气，其余位置保持连贯，不要出现长时间静默。');
  lines.push('5. 切换镜头时人声继续，不得在切镜处重新起句、重开这段话或重新自我介绍。');
  lines.push('6. 严格按最终口播全文只读一次，不得改写、遗漏、合并或增加对白。');
  lines.push('7. 严禁重复词、重复短语、回读同一句、卡顿式重启、结巴或结尾拖音。');
  lines.push('8. 背景音乐和环境声保持低音量，不得遮挡人声。');

  const clips = [script.hook, ...script.scenes, script.outro];
  lines.push('');
  lines.push('【五段对白时间锚点】以下五段连接后就是上面的唯一口播全文，只用于对齐画面、字幕和切点，不是五次重新开口。相邻段之间零停顿、零吸气空白，声音必须跨切镜连续。');
  clips.forEach((clip, index) => {
    const [start, end] = BEAT_WINDOWS[index];
    lines.push(`${start}-${end} 秒｜对白："${compactText(clip.dialogue, 80)}"｜字幕："${compactText(clip.subtitle, 40)}"`);
  });

  // === 画面切点 ===
  lines.push('');
  lines.push('【画面切点】画面根据下方切点切换，声音在整条 15 秒内不间断。禁止等到某句说完再切镜；所有切镜必须发生在连续口播过程中。');
  beats.forEach((beat, i) => {
    const label = BEAT_LABELS[i];
    const start = beat.start_s.toFixed(1).replace(/\.0$/, '');
    const end = beat.end_s.toFixed(1).replace(/\.0$/, '');
    const sourceIndex = beat.image_index;
    const referenceNumber = typeof sourceIndex === 'number'
      ? options.referencePlan.referenceNumberBySourceIndex[sourceIndex]
      : undefined;
    const refText = referenceNumber
      ? `画面严格参考图片${referenceNumber}`
      : '延续前后镜头已经确定的同一门店环境';
    const keyword = beat.cut_on_keyword ? `（切点关键词："${beat.cut_on_keyword}"，切镜发生在念到该关键词时，口播不停）` : '';
    lines.push(
      `${start}-${end} 秒｜${label}：${refText}；画面：${compactText(beat.visual, 160)}；` +
      `动作与运镜：${compactText(beat.action, 200)}，${compactText(beat.motion, 80)}${keyword}。`,
    );
  });

  lines.push('');
  lines.push('【连续性】五段是同一次探店经历，人物身份、衣着、声音、门店空间、商品外观、光线和色调必须连续一致；转场使用自然硬切或动作匹配剪辑，不做黑场、不做慢淡。');
  lines.push('【禁止】不得偏离上述口播，不得虚构价格、品牌、商场、商品或活动；不得出现街道、马路、推门、拉门、第三方 Logo、无关人物、重复人物、乱码文字、长时间空镜或任何超过 0.1 秒的静默。');
  for (const constraint of (options.globalConstraints || []).slice(0, 4)) {
    if (constraint?.trim()) lines.push(compactText(constraint, 240));
  }

  return lines.join('\n');
}
