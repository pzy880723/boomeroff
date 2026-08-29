import { normalizeSurpriseScript, type SurpriseScript } from './surprise-one-shot.ts';
import {
  DEFAULT_DEEPSEEK_SCRIPT_MODEL,
  DeepSeekRequestError,
  requestDeepSeekJson,
} from './deepseek-client.ts';
import {
  buildSurpriseRepairInstruction,
  normalizeDeepSeekSurpriseScript,
  validateSurpriseScript,
} from './surprise-script-policy.ts';

export const SURPRISE_MODEL_TIMEOUT_MS = 12_000;

interface FastFallbackOptions {
  shopName?: string | null;
  imageDescriptions?: Array<{ index: number; summary?: string | null }>;
  /** 每次生成传入的随机 nonce，用于让兜底稿在同一主旨下确定性地换一套文案。 */
  variationKey?: string | null;
}

interface FastGenerationOptions extends FastFallbackOptions {
  apiKey?: string | null;
  factContext: string;
  character?: Record<string, unknown> | null;
  ageBucket?: 'young' | 'middle' | 'senior' | null;
  model?: string;
}

const SAFE_BEAT_EXTENSIONS = [
  '现在就值得专程进来认真看看',
  '每排货架都能慢慢发现不同惊喜',
  '拿在手里越看细节越有意思',
  '认真挑选总能找到合眼缘的好物',
  '记得放进攻略到店完整逛上一圈',
];

function chineseLength(value: unknown): number {
  return String(value || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
}

function fillToChineseLength(value: unknown, suffix: string, target = 18): string {
  let output = String(value || '').replace(/[。.!！?？…;；:：,，、\s]+$/g, '').trim();
  let suffixCursor = 0;
  while (chineseLength(output) < target && suffixCursor < suffix.length) {
    output += suffix[suffixCursor];
    suffixCursor += 1;
  }
  return output;
}

/**
 * DeepSeek 偶尔会返回结构和内容都合格、但每段偏短的稿子。
 * 保留模型生成的主题和画面，仅用不引入价格/活动/地址的安全短语补齐口播预算，
 * 避免把整份个性化脚本丢掉并换成固定兜底稿。
 */
export function completeShortGeneratedScript(candidate: Record<string, unknown>): SurpriseScript {
  const script = normalizeDeepSeekSurpriseScript(candidate as any);
  const clips = [script.hook, ...script.scenes, script.outro];
  if (clips.length !== 5 || clips.some((clip) => !String(clip?.dialogue || '').trim())) return script;
  clips.forEach((clip, index) => {
    const dialogue = fillToChineseLength(clip.dialogue, SAFE_BEAT_EXTENSIONS[index], 18);
    clip.dialogue = dialogue;
    clip.subtitle = dialogue;
  });
  script.continuous_dialogue = clips.map((clip) => clip.dialogue).join('，');
  return normalizeSurpriseScript(script);
}

export async function generateFastSurpriseScript(options: FastGenerationOptions): Promise<SurpriseScript> {
  const startedAt = Date.now();
  let script: SurpriseScript | null = null;
  let provider = 'fast_fallback';
  let providerReason = options.apiKey ? 'unknown' : 'missing_api_key';
  const requestedModel = String(options.model || '').trim();
  const model = /^deepseek-(?:chat|reasoner)$/.test(requestedModel)
    ? requestedModel
    : DEFAULT_DEEPSEEK_SCRIPT_MODEL;

  if (options.apiKey) {
    try {
      const systemPrompt = '你是 BOOMER OFF 门店短视频编剧。只输出 JSON。写一条15秒高密度探店口播：严格5个连续镜头，每镜对白18-21个汉字，合计90-100字；字幕逐字等于对白；首镜必须使用真实门店入口和BOOMER OFF门头；最后一镜必须给出完整明确的到店行动号召；不得重复短语或编造价格活动。';
      const baseUserPrompt = `真实门店、素材与脚本规则：\n${options.factContext.slice(0, 7000)}\n\n` +
        `主角：${JSON.stringify(options.character || {})}\n参考图：${JSON.stringify((options.imageDescriptions || []).slice(0, 8))}\n` +
        '输出字段：title,continuous_dialogue,hook,scenes,outro,publish_copy,bgm,total_duration_s,aspect,mode。hook/scenes/outro每段包含scene,action,dialogue,subtitle,image_index,duration_s=3,motion；scenes正好3段。只输出JSON。';

      let lastErrors: string[] = [];
      let lastCandidate: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 2 && !script; attempt += 1) {
        const repair = attempt > 0 ? buildSurpriseRepairInstruction(lastErrors) : '';
        const candidate = await requestDeepSeekJson({
          apiKey: options.apiKey,
          model,
          temperature: attempt > 0 ? 0.45 : 0.8,
          maxTokens: 1800,
          timeoutMs: SURPRISE_MODEL_TIMEOUT_MS,
          systemPrompt,
          userPrompt: repair
            ? `${baseUserPrompt}\n\n${repair}\n上一次结果：${JSON.stringify(lastCandidate)}`
            : baseUserPrompt,
        });
        lastCandidate = candidate;
        const normalized = normalizeDeepSeekSurpriseScript(candidate as any);
        const validation = validateSurpriseScript(normalized, {
          ageBucket: options.ageBucket || null,
          factContext: options.factContext,
        });
        if (!validation.errors.length) {
          script = normalized;
          provider = 'deepseek';
          providerReason = attempt === 0 ? 'generated' : 'repaired';
        } else {
          lastErrors = validation.errors;
          providerReason = `validation_failed:${validation.errors.join('|')}`;
          console.warn(`[surprise-fast] DeepSeek candidate rejected attempt=${attempt + 1} model=${model}`, validation.errors);
        }
      }
      if (!script && lastCandidate) {
        const completed = completeShortGeneratedScript(lastCandidate);
        const completedValidation = validateSurpriseScript(completed, {
          ageBucket: options.ageBucket || null,
          factContext: options.factContext,
        });
        if (!completedValidation.errors.length) {
          script = completed;
          provider = 'deepseek';
          providerReason = 'locally_completed_after_validation';
        } else {
          providerReason = `local_completion_failed:${completedValidation.errors.join('|')}`;
          console.warn(`[surprise-fast] completed DeepSeek candidate rejected model=${model}`, completedValidation.errors);
        }
      }
    } catch (error) {
      const status = error instanceof DeepSeekRequestError ? error.status : 0;
      providerReason = `request_failed:${status || 'unknown'}:${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[surprise-fast] DeepSeek unavailable model=${model} status=${status}; using fallback`, error);
    }
  }

  if (!script) script = buildFastSurpriseFallback(options);
  script.script_provider = provider;
  script.script_provider_model = model;
  script.script_provider_reason = providerReason.slice(0, 800);
  script.script_generation_ms = Date.now() - startedAt;
  return script;
}

function cleanShopName(value: unknown): string {
  return String(value || 'BOOMER OFF')
    .replace(/上海|温州|门店|店铺|总部/g, '')
    .trim()
    .slice(0, 8) || 'BOOMER OFF';
}

/** 五个节拍各自的候选口播（均为 18-21 个汉字，不含价格/活动/地址等未经证实的事实）。 */
const FALLBACK_BEAT_POOLS: string[][] = [
  [
    '这家中古杂货铺我真想立刻安利给所有人',
    '路过这块门头千万别错过里面比想象好逛',
    '门口这块招牌一看就知道是我喜欢的调调',
    '找了很久终于让我发现这家宝藏中古小店',
    '站在门头前就已经忍不住想冲进去看看',
  ],
  [
    '一进门整排复古老物件真的让人挪不开眼',
    '推门进来满屋子年代感直接把我拿捏住了',
    '刚走进来就被层层叠叠的旧时光包围住了',
    '进店第一眼就是密密麻麻的怀旧陈列柜子',
    '门一推开扑面而来全是熟悉的童年味道',
  ],
  [
    '玩具瓷器老唱片每次翻到一件都像拆盲盒',
    '摆件杯子和铁皮小车细节保存得特别完整',
    '随手拿起一只旧杯子花纹居然做得这么讲究',
    '老徽章旧相机还有绝版公仔挨个看不过来',
    '每个格子里都藏着小时候梦寐以求的东西',
  ],
  [
    '不用追爆款这里随手挑一件都很有故事感',
    '慢慢逛慢慢挑比起网购多了太多真实乐趣',
    '淘到合眼缘那一刻成就感真的会立刻上头',
    '一件旧物就能撑起整个房间的独特氛围感',
    '和朋友一起来从头翻到尾都不会觉得腻',
  ],
  [
    '想找独特小物就来认真翻一圈再带走惊喜',
    '周末安排上亲自到店慢慢逛一定不虚此行',
    '记好这家店下次直接过来挑属于你的那件',
    '别只看视频了亲自来店里翻一次更过瘾',
    '带上朋友直接来店里逛一圈总能有收获',
  ],
];

const FALLBACK_ACTIONS: string[][] = [
  [
    '博主快步走近门头，边指向招牌边对镜头连续说话',
    '博主站定在门口，边推门边对镜头连续说话',
  ],
  [
    '博主走入货架之间，边环顾商品边对镜头连续说话',
    '博主沿着陈列往里走，边打量边对镜头连续说话',
  ],
  [
    '博主快速拿起三件小物，边展示细节边对镜头连续说话',
    '博主举起一件小物凑近镜头，边翻看边连续说话',
  ],
  [
    '博主边翻找边举起刚发现的小物，对镜头连续说话',
    '博主抱着挑好的几件小物，边比较边对镜头连续说话',
  ],
  [
    '博主抱着选中的小物边招手边对镜头连续说话',
    '博主走向门口回头挥手，边邀请边对镜头连续说话',
  ],
];

function hashVariationKey(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function pickFallbackDialogues(variationKey: string): string[] {
  const hash = hashVariationKey(variationKey || 'default');
  const base = FALLBACK_BEAT_POOLS.map((pool, beat) =>
    Math.floor(hash / Math.pow(5, beat)) % pool.length
  );
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const picked = FALLBACK_BEAT_POOLS.map((pool, beat) => pool[(base[beat] + (attempt ? attempt + beat : 0)) % pool.length]);
    const total = picked.reduce((sum, line) => sum + chineseLength(line), 0);
    if (total >= 90 && total <= 100) return picked;
  }
  return FALLBACK_BEAT_POOLS.map((pool) => pool[0]);
}

export function buildFastSurpriseFallback(options: FastFallbackOptions = {}): SurpriseScript {
  const images = Array.isArray(options.imageDescriptions) ? options.imageDescriptions : [];
  const summary = (index: number, fallback: string) =>
    String(images[index]?.summary || images[images.length ? index % images.length : -1]?.summary || fallback).trim();
  const imageIndex = (index: number) => images.length ? Number(images[index % images.length]?.index ?? 0) : null;
  const shopLabel = cleanShopName(options.shopName);
  const variationKey = String(options.variationKey || 'default');
  const variationHash = hashVariationKey(variationKey);
  const dialogues = pickFallbackDialogues(variationKey);
  const action = (beat: number) => FALLBACK_ACTIONS[beat][(variationHash >>> beat) % FALLBACK_ACTIONS[beat].length];
  const scenes = [
    '当前门店真实入口与 BOOMER OFF 门头招牌',
    '店内整排中古杂货和复古老物件货架',
    '玩具瓷器唱片等中古小物近景细节',
    '店内翻筐挑选和发现独特小物的真实体验',
    '门店货架环绕的真实店内全景',
  ];
  const motions = ['手持推镜', '广角横移', '俯拍跟随', '中景推近', '拉镜定格'];
  const clips = dialogues.map((dialogue, beat) => ({
    scene: summary(beat, scenes[beat]),
    action: action(beat),
    dialogue,
    subtitle: dialogue,
    image_index: imageIndex(beat),
    duration_s: 3,
    motion: motions[beat],
  }));

  return normalizeSurpriseScript({
    title: `${shopLabel}中古淘货攻略`,
    continuous_dialogue: dialogues.join('，'),
    hook: clips[0],
    scenes: clips.slice(1, 4),
    outro: clips[4],
    publish_copy: {
      title: `${shopLabel}这家中古店真的太好逛`,
      body: `一进门就被整排复古老物件吸引，玩具、瓷器和唱片每一件都值得慢慢翻。来${shopLabel}认真逛一圈，把独特惊喜带回家。`,
      topics: ['#中古杂货', '#复古好物', '#探店', '#淘货攻略'],
    },
    bgm: '轻快复古节拍',
    total_duration_s: 15,
    aspect: '9:16',
    mode: 'text2video',
    script_provider: 'fast_fallback',
  } as SurpriseScript);
}
