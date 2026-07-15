export interface SurpriseClip {
  scene?: string;
  action?: string;
  dialogue?: string;
  subtitle?: string;
  image_index?: number | null;
  duration_s?: number;
  motion?: string;
  [key: string]: unknown;
}

export interface SurpriseScript {
  hook: SurpriseClip;
  scenes: SurpriseClip[];
  outro: SurpriseClip;
  total_duration_s?: number;
  aspect?: string;
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

const MID_FALLBACKS = [
  '这里每一排都有新鲜发现',
  '每个角落都值得慢慢逛逛',
  '想找特别单品就来这里逛',
];

const MID_TAILS = [
  '越逛越有惊喜',
  '每排都值得细看',
  '新手也能放心淘',
];

function chineseLength(value: string): number {
  return (value || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
}

function truncateChinese(value: string, maxChinese: number): string {
  let count = 0;
  let output = '';
  for (const char of (value || '').trim()) {
    if (/\p{Script=Han}/u.test(char)) {
      if (count >= maxChinese) break;
      count += 1;
    }
    output += char;
  }
  return output.replace(/[，,、：:]$/u, '').trim();
}

function compactText(value: unknown, maxLength: number): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function ensureDialogue(
  value: unknown,
  minChinese: number,
  maxChinese: number,
  fallback: string,
  tail?: string,
): string {
  let output = String(value || '').trim();
  if (chineseLength(output) < minChinese && output && tail) {
    output = `${output}，${tail}`;
  }
  output = truncateChinese(output, maxChinese);
  if (chineseLength(output) < minChinese) {
    output = truncateChinese(fallback, maxChinese);
  }
  return output;
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
  };
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
      action: '探店博主边逛边拿起一件好物对镜头介绍',
      dialogue: MID_FALLBACKS[index],
      subtitle: MID_TAILS[index],
      image_index: null,
      motion: '手持跟拍',
    }));
  }

  hook.dialogue = ensureDialogue(hook.dialogue, 6, 8, '这家店真的绝了', '快跟我进来逛');
  outro.dialogue = ensureDialogue(outro.dialogue, 6, 8, '姐妹周末快来逛', '周末快来逛');
  scenes.forEach((scene, index) => {
    scene.dialogue = ensureDialogue(
      scene.dialogue,
      11,
      12,
      MID_FALLBACKS[index],
      MID_TAILS[index],
    );
  });

  // Respect complete AI-written lines. Only strengthen middle lines when the
  // whole 15-second read is too short to sustain continuous speech.
  let spokenCount = chineseLength([
    hook.dialogue,
    ...scenes.map((scene) => scene.dialogue),
    outro.dialogue,
  ].join(''));
  for (let index = 0; index < scenes.length && spokenCount < 48; index += 1) {
    const before = chineseLength(String(scenes[index].dialogue || ''));
    scenes[index].dialogue = truncateChinese(
      `${scenes[index].dialogue || ''}，${MID_TAILS[index]}`,
      12,
    );
    spokenCount += chineseLength(String(scenes[index].dialogue || '')) - before;
  }

  return {
    ...script,
    hook,
    scenes,
    outro,
    total_duration_s: 15,
    aspect: '9:16',
    one_shot_prompt: '',
  };
}

export function bindSurpriseReferences(input: SurpriseScript, imageCount: number): SurpriseScript {
  const script = normalizeSurpriseScript(input);
  const count = Math.max(0, Math.floor(Number(imageCount) || 0));
  if (!count) return script;

  const clips = [script.hook, ...script.scenes, script.outro];
  clips.forEach((clip, clipIndex) => {
    const requested = clip.image_index;
    if (typeof requested === 'number' && Number.isInteger(requested) && requested >= 0 && requested < count) return;
    // Spread the five beats across the available real images. With fewer than
    // five photos, deterministic reuse is safer than inventing an unbound scene.
    clip.image_index = Math.min(clipIndex, count - 1);
  });
  return script;
}

export function surpriseSpokenText(script: SurpriseScript): string {
  return [script.hook, ...(script.scenes || []), script.outro]
    .map((clip) => String(clip?.dialogue || '').trim())
    .filter(Boolean)
    .join('，');
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
  // Keep one storefront anchor even when a generated script omitted its index.
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
    const summary = compactText(
      description?.summary || (role === 'storefront' ? '门头和开放式店面' : `店内实景${referenceNumber}`),
      120,
    );
    seen.set(url, referenceNumber);
    referenceNumberBySourceIndex[sourceIndex] = referenceNumber;
    urls.push(url);
    items.push({ sourceIndex, referenceNumber, url, summary, role });
  });

  return { urls, items, referenceNumberBySourceIndex };
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
  const clips = [script.hook, ...script.scenes, script.outro];
  const labels = ['强钩子', '进店发现', '上手体验', '核心种草', '行动召唤'];
  const lines: string[] = [
    '【生成任务】严格生成一条完整的15秒、9:16、真人写实、高密度门店种草短视频。一次生成中自然完成5次剪辑，不要黑场，不要空镜，不要停顿。',
    `【整体风格】${compactText(options.styleLabel || '高能真实探店 vlog，手持跟拍，明亮自然，节奏紧凑。', 180)}`,
  ];

  if (options.shopContext) lines.push(`【门店事实】${compactText(options.shopContext, 900)}`);
  if (options.referencePlan.items.length) {
    lines.push('【参考图片绑定，编号与请求中的图片顺序完全一致】');
    for (const item of options.referencePlan.items) {
      lines.push(`图片${item.referenceNumber}：${item.summary}。只用于锁定该门店的真实场景、商品、陈列或构图，不得改成无关内容。`);
    }
  }

  lines.push(`【唯一主角】${compactText(options.personaDirective || '全片只有同一位原创虚构探店博主。锁定同一张脸、发型、年龄、身形、服装和声音，禁止换人、换装、分身或突然出现其他主角。', 300)}`);
  lines.push('【原生声音】由 Seedance 在成片中直接生成同步中文对白和环境声，不使用后配 TTS。0.5秒内开始说话，至少13秒持续有清晰中文人声。以下引号内台词必须逐字、按顺序说出，不得改写、删减、合并或新增台词；人物必须边行动边说话并保持口型同步，镜头切换时声音连续，不留静默。');
  lines.push('【15秒时间轴，必须逐段执行】');

  clips.forEach((clip, index) => {
    const start = index * 3;
    const end = start + 3;
    const sourceIndex = clip.image_index;
    const requestedReferenceNumber = typeof sourceIndex === 'number'
      ? options.referencePlan.referenceNumberBySourceIndex[sourceIndex]
      : undefined;
    const fallbackReference = options.referencePlan.items[index % Math.max(1, options.referencePlan.items.length)];
    const referenceNumber = requestedReferenceNumber || fallbackReference?.referenceNumber;
    const reference = referenceNumber
      ? `画面严格参考图片${referenceNumber}`
      : '该段不绑定参考图，只能延续前后镜头已经确定的同一门店环境';
    lines.push(
      `[${start}-${end}秒｜${labels[index]}] ${reference}；` +
      `场景：${compactText(clip.scene || 'BOOMER·OFF 店内实景', 180)}；` +
      `动作与运镜：${compactText(clip.action || '探店博主边走边对镜头介绍', 220)}，${compactText(clip.motion || '手持跟拍', 80)}；` +
      `主角逐字说：“${clip.dialogue}”。`,
    );
  });

  lines.push('【连续性】五段是同一次探店经历，人物身份、衣着、声音、门店空间、商品外观、光线和色调必须连续一致；转场使用自然硬切或动作匹配剪辑。');
  lines.push('【禁止】不得偏离上述脚本，不得虚构价格、品牌、商场、商品、门店或活动；不得出现街道、马路、推门、拉门、第三方 Logo、无关人物、重复人物、乱码文字、长时间空镜或无声停顿。');
  for (const constraint of (options.globalConstraints || []).slice(0, 4)) {
    if (constraint?.trim()) lines.push(compactText(constraint, 240));
  }

  return lines.join('\n');
}
