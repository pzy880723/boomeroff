// 2026-07-30：15 秒原生 Seedance 人声出现吞字/卡顿/重复。
// 口播总量降到 60–72 汉字（硬上限 72），语速改为自然偏快 270–320 字/分钟，允许 0.15–0.35 秒微停顿。
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SURPRISE_MAX_CN,
  SURPRISE_MIN_CN,
  buildSurpriseReferencePlan,
  compileSurpriseOneShotPrompt,
  normalizeSurpriseScript,
  surpriseSpokenText,
} from '../supabase/functions/_shared/surprise-one-shot.ts';

const cn = (value: string) => value.replace(/[^\u4e00-\u9fa5]/g, '').length;

function makeScript(dialogues: string[]) {
  return {
    hook: { scene: '门头', action: '边走边说', dialogue: dialogues[0], subtitle: dialogues[0], image_index: 0 },
    scenes: dialogues.slice(1, 4).map((d, i) => ({ scene: `店内${i}`, action: '边拿边说', dialogue: d, subtitle: d, image_index: i + 1 })),
    outro: { scene: '全景', action: '边招手边说', dialogue: dialogues[4], subtitle: dialogues[4], image_index: 4 },
    continuous_dialogue: dialogues.join('，'),
  } as any;
}

test('口播区间收敛到 60-72 汉字，硬上限 72', () => {
  assert.equal(SURPRISE_MIN_CN, 60);
  assert.equal(SURPRISE_MAX_CN, 72);
});

test('超长脚本会被截断到 72 汉字以内，且不靠重复补长', () => {
  const long = [
    '来上海旅行别错过这家藏满惊喜的中古宝藏店真的很好逛',
    '一走进去满眼复古杂货每排货架都值得认真翻上很久',
    '昭和玩具日式瓷器老唱片随手一拿都很有故事感',
    '预算不用太高也能挑到一件独特的旅行纪念带回家',
    '现在就把这家宝藏中古店放进攻略到店认真翻一圈',
  ];
  const script = normalizeSurpriseScript(makeScript(long));
  const spoken = surpriseSpokenText(script);
  assert.ok(cn(spoken) <= SURPRISE_MAX_CN, `超出硬上限: ${cn(spoken)}`);

  const clips = [script.hook, ...script.scenes, script.outro];
  assert.equal(clips.length, 5);
  assert.ok(clips.every((clip) => String(clip.dialogue || '').trim()), '五段对白都必须非空');
  assert.ok(clips.every((clip) => clip.subtitle === clip.dialogue));
  // 不得为了补长度重复任何一段
  const unique = new Set(clips.map((clip) => clip.dialogue));
  assert.equal(unique.size, 5);
});

test('偏短脚本不会被重复内容强行补到下限', () => {
  const short = ['来上海就要逛这家店', '一进门都是复古好物', '玩具瓷器唱片很惊喜', '预算不高也能淘好物', '放进攻略马上来逛'];
  const script = normalizeSurpriseScript(makeScript(short));
  const clips = [script.hook, ...script.scenes, script.outro];
  assert.deepEqual(clips.map((clip) => clip.dialogue), short);
  assert.ok(cn(surpriseSpokenText(script)) < SURPRISE_MIN_CN);
});

test('编译后的提示词使用自然偏快语速与微停顿规则，不再含旧约束', () => {
  const script = normalizeSurpriseScript(
    makeScript(['来上海别错过这家中古宝藏店', '一进门满眼复古杂货和老物件', '玩具瓷器唱片随手一拿都有故事', '预算不高也能挑到独特小惊喜', '放进攻略到店认真翻上一圈']),
  );
  const referencePlan = buildSurpriseReferencePlan(script, [
    'https://cdn.example.com/1.jpg',
    'https://cdn.example.com/2.jpg',
    'https://cdn.example.com/3.jpg',
    'https://cdn.example.com/4.jpg',
    'https://cdn.example.com/5.jpg',
  ]);
  const prompt = compileSurpriseOneShotPrompt({ script, referencePlan });

  assert.match(prompt, /270–320 汉字/);
  assert.match(prompt, /0\.15–0\.35 秒的自然微停顿/);
  assert.match(prompt, /严禁重复词、重复短语、回读同一句、卡顿式重启/);
  assert.match(prompt, /严格按最终口播全文只读一次/);
  assert.doesNotMatch(prompt, /390–430/);
  assert.doesNotMatch(prompt, /任何位置不得出现超过 0\.1 秒的停顿/);
  assert.doesNotMatch(prompt, /零停顿、零吸气/);
  // 画面顺序与参考图绑定保持不变
  assert.match(prompt, /0-3 秒/);
  assert.match(prompt, /12-15 秒/);
  assert.match(prompt, /画面严格参考图片1/);
  assert.match(prompt, /画面严格参考图片5/);
});
