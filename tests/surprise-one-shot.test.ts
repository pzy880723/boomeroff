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
    dialogue: '这家店真的绝了',
    subtitle: '宝藏中古店',
    image_index: 0,
    duration_s: 2,
    motion: '手持推镜',
  },
  scenes: [
    {
      scene: '店内整面中古货架',
      action: '博主边指向密集货架边介绍',
      dialogue: '三万多件好物真的逛不完',
      subtitle: '三万多件好物',
      image_index: 1,
      duration_s: 4,
      motion: '广角横移',
    },
    {
      scene: '中古杂货翻筐区',
      action: '博主边翻筐边拿起一件好物',
      dialogue: '随手一翻都可能遇到惊喜',
      subtitle: '翻筐太上头',
      image_index: 2,
      duration_s: 2,
      motion: '俯拍跟随',
    },
    {
      scene: '复古陈列和试戴镜前',
      action: '博主边试戴边转向镜头展示',
      dialogue: '平价好逛新手也能放心淘',
      subtitle: '平价好淘',
      image_index: 3,
      duration_s: 4,
      motion: '中景推近',
    },
  ],
  outro: {
    scene: 'BOOMER·OFF 店内全景',
    action: '博主边挥手边指向身后的货架',
    dialogue: '姐妹周末快来逛',
    subtitle: '周末来逛',
    image_index: 4,
    duration_s: 3,
    motion: '拉镜定格',
  },
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

test('惊喜脚本固定为五段三秒并保持连续口播预算', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  const clips = [script.hook, ...script.scenes, script.outro];

  assert.equal(clips.length, 5);
  assert.deepEqual(clips.map((clip) => clip.duration_s), [3, 3, 3, 3, 3]);
  assert.ok(clips.every((clip) => clip.dialogue.trim().length > 0));

  const spoken = surpriseSpokenText(script);
  const chineseCount = spoken.replace(/[^\u4e00-\u9fa5]/g, '').length;
  assert.ok(chineseCount >= 48, `口播过短: ${chineseCount}`);
  assert.ok(chineseCount <= 52, `口播过长: ${chineseCount}`);
});

test('一次成片提示词严格包含脚本时间轴、逐字台词和参考图职责', () => {
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
    personaDirective: '全片唯一主角是同一位原创虚构女博主，黑色短发，红色夹克，语速快且真诚。',
    shopContext: 'BOOMER·OFF 中古杂货店，海量、平价、适合翻筐寻宝。',
  });

  assert.deepEqual(referencePlan.urls, imageUrls);
  assert.match(prompt, /图片1.*门头和开放式店面/);
  assert.match(prompt, /图片2.*整面密集货架/);
  assert.match(prompt, /0-3秒/);
  assert.match(prompt, /3-6秒/);
  assert.match(prompt, /6-9秒/);
  assert.match(prompt, /9-12秒/);
  assert.match(prompt, /12-15秒/);
  for (const line of [script.hook, ...script.scenes, script.outro].map((clip) => clip.dialogue)) {
    assert.ok(prompt.includes(`“${line}”`), `提示词缺少逐字台词: ${line}`);
  }
  assert.match(prompt, /不得改写、删减、合并或新增台词/);
  assert.match(prompt, /由 Seedance 在成片中直接生成同步中文对白/);
  assert.match(prompt, /不使用后配 TTS/);
  assert.match(prompt, /0\.5秒内开始说话/);
  assert.doesNotMatch(prompt, /自由发挥/);
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
  assert.doesNotMatch(prompt, /该段不绑定参考图/);
  assert.match(prompt, /画面严格参考图片2/);
});

test('超长门店资料不会截掉五段时间轴和最终硬约束', () => {
  const script = normalizeSurpriseScript(structuredClone(rawScript));
  const referencePlan = buildSurpriseReferencePlan(script, imageUrls);
  const prompt = compileSurpriseOneShotPrompt({
    script,
    referencePlan,
    shopContext: `超长门店资料${'真实店铺卖点'.repeat(800)}`,
    globalConstraints: ['【验收硬约束】结尾必须完整保留。'],
  });

  assert.match(prompt, /12-15秒/);
  assert.match(prompt, /【验收硬约束】结尾必须完整保留/);
});

test('空台词兜底不虚构数量价格且五段全部绑定实景图', () => {
  const blank = structuredClone(rawScript);
  blank.scenes.forEach((scene) => { scene.dialogue = ''; scene.image_index = null; });
  const bound = bindSurpriseReferences(normalizeSurpriseScript(blank), 2);
  const clips = [bound.hook, ...bound.scenes, bound.outro];
  const spoken = surpriseSpokenText(bound);

  assert.deepEqual(clips.map((clip) => clip.image_index), [0, 1, 1, 1, 1]);
  assert.doesNotMatch(spoken, /三万|平价|最低|活动价/);
});

test('门店结构约束只在画像明确时启用 B1 开放式规则', () => {
  const generic = resolveStorefrontConstraintZh('南京门店，参考图展示真实入口');
  const locked = resolveStorefrontConstraintZh('商场 B1 层，八米宽开放式无门店面');

  assert.equal(usesOpenFrontMallConstraint('南京门店，参考图展示真实入口'), false);
  assert.match(generic, /严格服从当前门店画像与参考图/);
  assert.match(locked, /8 米宽的开放式店面/);
});
