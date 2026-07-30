// 复现 2026-07-30 生产失败：generate-marketing-video-script 连续三次判定不合格。
// 日志中的真实拒因：分段长度 30/34/9/8、action 未写“边演边说”、五段连接 ≠ continuous_dialogue。
// 这些都能被确定性规范化修好，不该导致整条请求失败。
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateSurpriseScript,
  normalizeDeepSeekSurpriseScript,
} from '../supabase/functions/_shared/surprise-script-policy.ts';

const CONTINUOUS =
  '来上海别错过这家中古宝藏店，一进门满眼复古杂货和老物件，' +
  '玩具瓷器唱片随手一拿都有故事，预算不高也能挑到独特小惊喜，' +
  '放进攻略到店认真翻上一圈';

test('分段畸形 + 动作缺“边说” + 五段与全文不一致时，规范化后应通过校验', () => {
  const raw: any = {
    continuous_dialogue: CONTINUOUS,
    hook: { scene: '门头', action: '站定看向镜头', dialogue: '来上海别错过这家中古宝藏店一走进去满眼复古杂货', subtitle: '门头惊喜', image_index: 0 },
    scenes: [
      { scene: '货架', action: '思考停顿', dialogue: '每排货架都值得认真翻玩具瓷器唱片随手一拿都有故事', subtitle: '货架' },
      { scene: '特写', action: '拿起商品', dialogue: '预算不用太高', subtitle: '特写' },
      { scene: '体验', action: '翻找', dialogue: '也能挑到一件独特的旅行纪念', subtitle: '体验' },
    ],
    outro: { scene: '全景', action: '招手', dialogue: '放进攻略到店认真翻上一圈', subtitle: 'CTA' },
  };
  const normalized = normalizeDeepSeekSurpriseScript(raw);
  const result = validateSurpriseScript(normalized as any);
  assert.deepEqual(result.errors, []);
  assert.equal(normalized.total_duration_s, 15);
  assert.equal(normalized.scenes.length, 3);
  const clips = [normalized.hook, ...normalized.scenes, normalized.outro];
  assert.equal(clips.length, 5);
  clips.forEach((clip) => {
    assert.equal(clip.subtitle, clip.dialogue);
    assert.match(String(clip.action), /说|讲|口播|介绍/);
    assert.equal(clip.duration_s, 3);
  });
  assert.equal(clips.map((c) => c.dialogue).join('，'), normalized.continuous_dialogue);
});

test('全文偏短仍应被严格校验拦下，但宽松兜底可放行真实内容', () => {
  const short = ['来上海一定要逛这家中古店', '一进门满眼都是复古好物', '玩具瓷器唱片都很有故事', '预算不高也能淘到独特好物', '放进攻略现在就来逛逛'];
  const raw: any = {
    continuous_dialogue: short.join('，'),
    hook: { scene: '门头', action: '边走边说', dialogue: short[0], subtitle: short[0], image_index: 0 },
    scenes: short.slice(1, 4).map((d, i) => ({ scene: `场景${i}`, action: '边拿边说', dialogue: d, subtitle: d })),
    outro: { scene: '全景', action: '边招手边说', dialogue: short[4], subtitle: short[4] },
  };
  const normalized = normalizeDeepSeekSurpriseScript(raw);
  assert.ok(validateSurpriseScript(normalized as any).errors.length > 0);
  assert.deepEqual(validateSurpriseScript(normalized as any, { relaxed: true }).errors, []);
});
