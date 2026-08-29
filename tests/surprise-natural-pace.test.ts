// 15 秒员工极速成片：保持 90–100 字高密度口播，五镜持续发声并严格对齐字幕。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('口播区间统一为 90-100 汉字', () => {
  assert.equal(SURPRISE_MIN_CN, 90);
  assert.equal(SURPRISE_MAX_CN, 100);
});

test('脚本生成提示词与 90-100 字校验规则保持一致', () => {
  const source = readFileSync(
    new URL('../supabase/functions/generate-marketing-video-script/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /90[–-]100 个汉字/);
  assert.match(source, /18[–-]21 个汉字/);
  assert.doesNotMatch(source, /60[–-]72/);
  assert.doesNotMatch(source, /8[–-]18/);
});

test('超长脚本会被截断到 100 汉字以内，且不靠重复补长', () => {
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

test('编译后的提示词使用高密度语速和极短节奏换气', () => {
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

  assert.match(prompt, /390–430 汉字/);
  assert.match(prompt, /0\.05–0\.12 秒的节奏换气/);
  assert.match(prompt, /严禁重复词、重复短语、回读同一句、卡顿式重启/);
  assert.match(prompt, /严格按最终口播全文只读一次/);
  assert.doesNotMatch(prompt, /270–320/);
  assert.doesNotMatch(prompt, /零停顿、零吸气/);
  // 保留门头、素材顺序与完整收尾，但不再堆叠逐秒分镜口令
  assert.match(prompt, /0-3 秒/);
  assert.match(prompt, /【画面素材概括】/);
  assert.match(prompt, /参考图片1/);
  assert.match(prompt, /参考图片5/);
  assert.match(prompt, /最后约 2\.5–3 秒必须保留给行动号召/);
  assert.doesNotMatch(prompt, /12-15 秒｜对白/);
});
