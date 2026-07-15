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

const rawScript = {
  hook: {
    scene: '商场走廊正对 BOOMER·OFF 开放式门店',
    action: '博主边走进店边对镜头喊',
    dialogue: '',
    subtitle: '宝藏中古店',
    image_index: 0,
    duration_s: 3,
    motion: '手持推镜',
    cut_on_keyword: '姐妹们',
  },
  scenes: [
    { scene: '店内整面中古货架', action: '博主边指向密集货架边继续说', dialogue: '', subtitle: '', image_index: 1, duration_s: 3, motion: '广角横移', cut_on_keyword: '每排' },
    { scene: '中古杂货翻筐区', action: '博主边翻筐边继续说', dialogue: '', subtitle: '', image_index: 2, duration_s: 3, motion: '俯拍跟随', cut_on_keyword: '随手' },
    { scene: '复古陈列和试戴镜前', action: '博主边试戴边继续说', dialogue: '', subtitle: '', image_index: 3, duration_s: 3, motion: '中景推近', cut_on_keyword: '特别单品' },
  ],
  outro: {
    scene: 'BOOMER·OFF 店内全景',
    action: '博主边挥手边继续说',
    dialogue: '',
    subtitle: '周末来逛',
    image_index: 4,
    duration_s: 3,
    motion: '拉镜定格',
    cut_on_keyword: 'BOOMER',
  },
  continuous_dialogue: '姐妹们这家店真的太会藏惊喜了，一进来每排都想停下翻翻，随手拿起都是很有意思的特别单品，想找不一样的周末别犹豫直接来BOOMER认真逛一圈',
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

test('惊喜脚本产出一条 58-62 字连续口播并保留 5 段视觉切点', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  const clips = [script.hook, ...script.scenes, script.outro];

  assert.equal(clips.length, 5);
  assert.deepEqual(clips.map((c) => c.duration_s), [3, 3, 3, 3, 3]);
  assert.equal(script.speech_start_s, 0.2);
  assert.equal(script.speech_end_s, 14.8);
  assert.equal(script.max_silence_s, 0.15);

  const spoken = surpriseSpokenText(script);
  const cn = spoken.replace(/[^\u4e00-\u9fa5]/g, '').length;
  assert.ok(cn >= 58 && cn <= 62, `连续口播字数越界: ${cn}`);
  assert.doesNotMatch(spoken, /[。!！?？…]/);
  assert.doesNotMatch(spoken, /大家好|嗯|然后|就是/);

  assert.equal(script.visual_beats?.length, 5);
  assert.deepEqual(script.visual_beats?.map((b) => [b.start_s, b.end_s]), [
    [0, 2.8], [2.8, 5.8], [5.8, 8.8], [8.8, 11.8], [11.8, 15],
  ]);
});

test('一次成片提示词只包含一条连续口播、5 段画面切点和参考图职责', () => {
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
  assert.match(prompt, /0\.2 秒内立即开口/);
  assert.match(prompt, /14\.8 秒/);
  assert.match(prompt, /任何位置不得出现超过 0\.15 秒的停顿/);
  assert.match(prompt, /切换镜头时声音必须继续/);
  assert.match(prompt, /【画面切点】/);
  assert.match(prompt, /0-2\.8 秒/);
  assert.match(prompt, /2\.8-5\.8 秒/);
  assert.match(prompt, /5\.8-8\.8 秒/);
  assert.match(prompt, /8\.8-11\.8 秒/);
  assert.match(prompt, /11\.8-15 秒/);
  assert.match(prompt, /图片1.*门头和开放式店面/);
  assert.match(prompt, /图片2.*整面密集货架/);
  assert.ok(prompt.includes(`"${script.continuous_dialogue}"`), '提示词必须逐字包含连续口播');
  // 严禁再出现按镜逐字朗读的老式指令
  assert.doesNotMatch(prompt, /主角逐字说/);
  assert.doesNotMatch(prompt, /镜头\d+对白/);
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
  assert.match(prompt, /画面严格参考图片2/);
});

test('缺少 continuous_dialogue 时按 clips 合成并补齐到 58-62 字', () => {
  const raw = structuredClone(rawScript);
  delete (raw as any).continuous_dialogue;
  raw.hook.dialogue = '这家店真的绝了';
  raw.scenes[0].dialogue = '每排都想停下翻翻';
  raw.scenes[1].dialogue = '随手拿起都是好物';
  raw.scenes[2].dialogue = '平价好逛新手也能放心';
  raw.outro.dialogue = '姐妹周末快来逛';

  const script = normalizeSurpriseScript(raw);
  const cn = surpriseSpokenText(script).replace(/[^\u4e00-\u9fa5]/g, '').length;
  assert.ok(cn >= 58 && cn <= 62, `合成口播字数越界: ${cn}`);
});

test('门店结构约束只在画像明确时启用 B1 开放式规则', () => {
  assert.equal(usesOpenFrontMallConstraint('南京门店，参考图展示真实入口'), false);
  assert.match(resolveStorefrontConstraintZh('南京门店，参考图展示真实入口'), /严格服从当前门店画像与参考图/);
  assert.match(resolveStorefrontConstraintZh('商场 B1 层，八米宽开放式无门店面'), /8 米宽的开放式店面/);
});
