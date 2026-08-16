import { normalizeSurpriseScript, type SurpriseScript } from './surprise-one-shot.ts';

export const SURPRISE_MODEL_TIMEOUT_MS = 2_500;

interface FastFallbackOptions {
  shopName?: string | null;
  imageDescriptions?: Array<{ index: number; summary?: string | null }>;
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
