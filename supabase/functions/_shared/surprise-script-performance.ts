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
}

interface FastGenerationOptions extends FastFallbackOptions {
  apiKey?: string | null;
  factContext: string;
  character?: Record<string, unknown> | null;
  ageBucket?: 'young' | 'middle' | 'senior' | null;
  model?: string;
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

export function buildFastSurpriseFallback(options: FastFallbackOptions = {}): SurpriseScript {
  const images = Array.isArray(options.imageDescriptions) ? options.imageDescriptions : [];
  const summary = (index: number, fallback: string) =>
    String(images[index]?.summary || images[images.length ? index % images.length : -1]?.summary || fallback).trim();
  const imageIndex = (index: number) => images.length ? Number(images[index % images.length]?.index ?? 0) : null;
  const shopLabel = cleanShopName(options.shopName);
  const dialogues = [
    '这家中古杂货铺我真想立刻安利给所有人',
    '一进门整排复古老物件真的让人挪不开眼',
    '玩具瓷器老唱片每次翻到一件都像拆盲盒',
    '不用追着爆款买这里随手挑一件都很有故事',
    '想找独特小物就来认真翻一圈再带走惊喜',
  ];
  const clips = [
    {
      scene: summary(0, '当前门店真实入口与 BOOMER OFF 门头招牌'),
      action: '博主快步走近门头，边指向招牌边对镜头连续说话',
      dialogue: dialogues[0], subtitle: dialogues[0], image_index: imageIndex(0), duration_s: 3, motion: '手持推镜',
    },
    {
      scene: summary(1, '店内整排中古杂货和复古老物件货架'),
      action: '博主走入货架之间，边环顾商品边对镜头连续说话',
      dialogue: dialogues[1], subtitle: dialogues[1], image_index: imageIndex(1), duration_s: 3, motion: '广角横移',
    },
    {
      scene: summary(2, '玩具瓷器唱片等中古小物近景细节'),
      action: '博主快速拿起三件小物，边展示细节边对镜头连续说话',
      dialogue: dialogues[2], subtitle: dialogues[2], image_index: imageIndex(2), duration_s: 3, motion: '俯拍跟随',
    },
    {
      scene: summary(3, '店内翻筐挑选和发现独特小物的真实体验'),
      action: '博主边翻找边举起刚发现的小物，对镜头连续说话',
      dialogue: dialogues[3], subtitle: dialogues[3], image_index: imageIndex(3), duration_s: 3, motion: '中景推近',
    },
    {
      scene: summary(4, '门店货架环绕的真实店内全景'),
      action: '博主抱着选中的小物边招手边对镜头连续说话',
      dialogue: dialogues[4], subtitle: dialogues[4], image_index: imageIndex(4), duration_s: 3, motion: '拉镜定格',
    },
  ];

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
