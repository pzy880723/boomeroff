import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindSurpriseReferences,
  buildSurpriseReferencePlan,
  compileSurpriseOneShotPrompt,
  normalizeSurpriseScript,
  surpriseSpokenText,
} from '../supabase/functions/_shared/surprise-one-shot.ts';
import {
  resolveStorefrontConstraintZh,
  usesOpenFrontMallConstraint,
} from '../supabase/functions/_shared/storefront-constraints.ts';
import {
  pickStorefrontAsset,
  scoreStorefrontAsset,
} from '../supabase/functions/_shared/storefront-assets.ts';

const rawScript = {
  hook: {
    scene: '商场走廊正对 BOOMER·OFF 开放式门店',
    action: '博主边走进店边对镜头喊',
    dialogue: '来上海旅行别错过这家藏在商场里的中古宝藏店',
    subtitle: '上海旅行隐藏副本',
    image_index: 0,
    duration_s: 3,
    motion: '手持推镜',
    cut_on_keyword: '姐妹们',
  },
  scenes: [
    { scene: '店内整面中古货架', action: '博主边指向密集货架边继续说', dialogue: '一进门满眼复古杂货每排货架都值得认真翻找', subtitle: '每排货架都值得认真翻找', image_index: 1, duration_s: 3, motion: '广角横移', cut_on_keyword: '一进门' },
    { scene: '中古杂货翻筐区', action: '博主边翻筐边继续说', dialogue: '昭和玩具日式瓷器老唱片随手一拿都很有故事', subtitle: '玩具瓷器老唱片都很有故事', image_index: 2, duration_s: 3, motion: '俯拍跟随', cut_on_keyword: '昭和玩具' },
    { scene: '复古陈列和试戴镜前', action: '博主边试戴边继续说', dialogue: '预算不用太高也能挑到一件独特的旅行纪念', subtitle: '预算不高也能挑到旅行纪念', image_index: 3, duration_s: 3, motion: '中景推近', cut_on_keyword: '预算不用太高' },
  ],
  outro: {
    scene: 'BOOMER·OFF 店内全景',
    action: '博主边挥手边继续说',
    dialogue: '现在就把这家宝藏中古店放进攻略马上来逛',
    subtitle: '现在就来认真翻一圈',
    image_index: 4,
    duration_s: 3,
    motion: '拉镜定格',
    cut_on_keyword: 'BOOMER',
  },
  continuous_dialogue: '来上海旅行别错过这家藏在商场里的中古宝藏店，一进门满眼复古杂货每排货架都值得认真翻找，昭和玩具日式瓷器老唱片随手一拿都很有故事，预算不用太高也能挑到一件独特的旅行纪念，现在就把这家宝藏中古店放进攻略马上来逛',
  total_duration_s: 15,
  aspect: '9:16',
};

const imageUrls = [
  'https://cdn.example.com/storefront.jpg',
  'https://cdn.example.com/shelves.jpg',
  'https://cdn.example.com/bin.jpg',
  'https://cdn.example.com/mirror.jpg',
  'https://cdn.example.com/wide.jpg',
];

test('惊喜脚本产出一条 90-100 字高密度连续口播并保留 5 段可读对白和字幕', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  const clips = [script.hook, ...script.scenes, script.outro];

  assert.equal(clips.length, 5);
  assert.deepEqual(clips.map((c) => c.duration_s), [3, 3, 3, 3, 3]);
  assert.equal(script.speech_start_s, 0.1);
  assert.equal(script.speech_end_s, 14.9);
  assert.equal(script.speech_rate, 'very_fast_clear');
  assert.equal(script.speech_cpm_min, 390);
  assert.equal(script.speech_cpm_max, 430);
  assert.equal(script.max_silence_s, 0.12);
  assert.equal(script.min_pause_s, 0.05);

  const spoken = surpriseSpokenText(script);
  const cn = spoken.replace(/[^\u4e00-\u9fa5]/g, '').length;
  assert.ok(cn >= 90 && cn <= 100, `连续口播字数越界: ${cn}`);
  assert.doesNotMatch(spoken, /[。!！?？…]/);
  assert.doesNotMatch(spoken, /大家好|嗯|然后|就是/);
  assert.ok(clips.every((clip) => String(clip.dialogue || '').trim()), '五段 dialogue 都必须非空');
  assert.ok(clips.every((clip) => String(clip.subtitle || '').trim()), '五段 subtitle 都必须非空');
  assert.equal(clips.map((clip) => clip.dialogue).join('，'), spoken);

  assert.equal(script.visual_beats?.length, 5);
  assert.deepEqual(script.visual_beats?.map((b) => [b.start_s, b.end_s]), [
    [0, 3], [3, 6], [6, 9], [9, 12], [12, 15],
  ]);
});

test('一次成片提示词只包含一条连续口播、概括导演稿和完整收尾', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  const referencePlan = buildSurpriseReferencePlan(script, imageUrls, [
    { index: 0, summary: 'BOOMER·OFF 门头和开放式店面', role: 'storefront' },
    { index: 1, summary: '店内整面密集货架', role: 'scene' },
    { index: 2, summary: '中古杂货翻筐区', role: 'scene' },
    { index: 3, summary: '复古陈列和试戴镜', role: 'scene' },
    { index: 4, summary: '店内全景', role: 'scene' },
  ]);
  const prompt = compileSurpriseOneShotPrompt({
    script,
    referencePlan,
    styleLabel: '高能真实探店 vlog',
    personaDirective: '全片唯一主角是同一位原创虚构女博主。',
    shopContext: 'BOOMER·OFF 中古杂货店，海量、平价、适合翻筐寻宝。',
  });

  assert.match(prompt, /【15秒连续口播】/);
  assert.match(prompt, /【声音硬规则】/);
  assert.match(prompt, /0\.1 秒内立即开口/);
  assert.match(prompt, /14\.9 秒前完整说完/);
  assert.match(prompt, /0\.05–0\.12 秒的节奏换气/);
  assert.match(prompt, /390–430 汉字/);
  assert.match(prompt, /严禁重复词、重复短语、回读同一句、卡顿式重启/);
  assert.doesNotMatch(prompt, /270–320/);
  assert.match(prompt, /切换镜头时人声继续/);
  assert.match(prompt, /【导演内容】/);
  assert.match(prompt, /【画面素材概括】/);
  assert.match(prompt, /【完整收尾】/);
  assert.match(prompt, /最后约 2\.5–3 秒必须保留给行动号召/);
  assert.doesNotMatch(prompt, /【五段对白时间锚点】/);
  assert.doesNotMatch(prompt, /对白：/);
  assert.match(prompt, /图片1.*门头和开放式店面/);
  assert.match(prompt, /真实门头原件/);
  assert.match(prompt, /不得重绘、改字、替换、修复或生成任何 Logo、门头或招牌/);
  assert.match(prompt, /第一帧就必须出现同一位探店博主/);
  assert.match(prompt, /边说边快步入画、回头招手/);
  assert.match(prompt, /带着顾客走进店内/);
  assert.match(prompt, /禁止把门头参考图直接静止展示/);
  assert.doesNotMatch(prompt, /直接保持真实门头照片/);
  assert.match(prompt, /图片2.*整面密集货架/);
  assert.ok(prompt.includes(`"${script.continuous_dialogue}"`), '提示词必须逐字包含连续口播');
  // 严禁再出现按镜逐字朗读的老式指令
  assert.doesNotMatch(prompt, /主角逐字说/);
  assert.doesNotMatch(prompt, /镜头\d+对白/);
});

test('门头选择必须优先真实入口店招，不能把店内陈列误判成门头', () => {
  const wrongInterior = {
    id: 'wrong-interior',
    category: '店铺',
    tags: ['佐藤象', '卡通餐具', '店面陈列', '门头'],
    meta: {
      summary: '佐藤象大摆件与满墙的卡通主题餐具陈列。',
      ai_caption: { summary: '佐藤象大摆件与满墙的卡通主题餐具陈列。' },
    },
  };
  const realStorefront = {
    id: 'real-storefront',
    category: '店铺',
    tags: ['店铺门头', '复古氛围', '中古杂货'],
    meta: {
      summary: '店铺入口全景，明亮的招牌与温馨的复古陈设。',
      ai_caption: { summary: '店铺入口全景，明亮的招牌与温馨的复古陈设。' },
    },
  };
  const curatedFullEntrance = {
    id: 'curated-full-entrance',
    category: '店铺',
    tags: ['探店首图', '中古店', '复古招牌', '杂货铺'],
    meta: {
      summary: '中古店全景门头，招牌醒目，店内堆满琳琅满目的杂货。',
    },
  };

  assert.ok(scoreStorefrontAsset(realStorefront) > scoreStorefrontAsset(wrongInterior));
  assert.equal(
    pickStorefrontAsset([wrongInterior, realStorefront, curatedFullEntrance])?.id,
    'curated-full-entrance',
  );
  assert.equal(pickStorefrontAsset([wrongInterior]), null);
});

test('无效图片索引会确定性回退到真实参考图', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  script.scenes[1].image_index = 99;
  const bound = bindSurpriseReferences(script, 2);
  const referencePlan = buildSurpriseReferencePlan(bound, imageUrls.slice(0, 2), [
    { index: 0, summary: '门头', role: 'storefront' },
    { index: 1, summary: '货架', role: 'scene' },
  ]);
  const prompt = compileSurpriseOneShotPrompt({ script: bound, referencePlan });

  assert.equal(referencePlan.urls.length, 2);
  assert.equal(bound.scenes[1].image_index, 1);
  assert.doesNotMatch(prompt, /图片100/);
  assert.match(prompt, /参考图片2/);
});

test('有门头素材时首镜头和首个画面切点必须锁定真实门头', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  script.hook.image_index = 3;
  script.visual_beats![0].image_index = 4;

  const bound = bindSurpriseReferences(script, 5, [
    { index: 0, summary: 'BOOMER·OFF 门头和 Logo', role: 'storefront' },
    { index: 1, summary: '店内货架', role: 'scene' },
  ]);

  assert.equal(bound.hook.image_index, 0);
  assert.equal(bound.visual_beats?.[0].image_index, 0);
  assert.match(String(bound.hook.scene), /门头|店招|入口|Logo/i);
  assert.match(String(bound.hook.action), /第一帧/);
  assert.match(String(bound.hook.action), /带顾客走进店内/);
  assert.match(String(bound.hook.motion), /不停顿不定格/);
  assert.equal(bound.visual_beats?.[0].action, bound.hook.action);
  assert.equal(bound.visual_beats?.[0].motion, bound.hook.motion);
});

test('对白不足时不注入无关固定台词，而是保留原稿交给校验触发整条重写', () => {
  const raw = structuredClone(rawScript);
  delete (raw as any).continuous_dialogue;
  raw.hook.dialogue = '这家店真的绝了';
  raw.scenes[0].dialogue = '每排都想停下翻翻';
  raw.scenes[1].dialogue = '随手拿起都是好物';
  raw.scenes[2].dialogue = '平价好逛新手也能放心';
  raw.outro.dialogue = '姐妹周末快来逛';

  const script = normalizeSurpriseScript(raw);
  const cn = surpriseSpokenText(script).replace(/[^\u4e00-\u9fa5]/g, '').length;
  const clips = [script.hook, ...script.scenes, script.outro];
  assert.ok(cn < 60, `不足的原稿不应被固定台词伪装成合格脚本: ${cn}`);
  assert.deepEqual(clips.map((clip) => clip.dialogue), [
    '这家店真的绝了',
    '每排都想停下翻翻',
    '随手拿起都是好物',
    '平价好逛新手也能放心',
    '姐妹周末快来逛',
  ]);
  assert.ok(clips.every((clip) => clip.subtitle === clip.dialogue));
  assert.equal(clips.map((clip) => clip.dialogue).join('，'), script.continuous_dialogue);
});

test('门店结构约束只在画像明确时启用 B1 开放式规则', () => {
  assert.equal(usesOpenFrontMallConstraint('南京门店，参考图展示真实入口'), false);
  assert.match(resolveStorefrontConstraintZh('南京门店，参考图展示真实入口'), /严格服从当前门店画像与参考图/);
  assert.match(resolveStorefrontConstraintZh('商场 B1 层，八米宽开放式无门店面'), /8 米宽的开放式店面/);
});
