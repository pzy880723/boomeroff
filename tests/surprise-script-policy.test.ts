import assert from 'node:assert/strict';
import test from 'node:test';

import { pickPersonaSlotForTest } from '../supabase/functions/_shared/persona-generator.ts';
import { formatHolidayBrief, pickUpcomingHoliday } from '../supabase/functions/_shared/holiday-context.ts';
import {
  validateSurpriseScript,
  normalizeDeepSeekSurpriseScript,
} from '../supabase/functions/_shared/surprise-script-policy.ts';

test('中古和老物件标签不再把角色固定成老年人', () => {
  assert.equal(pickPersonaSlotForTest(['中古', '老物件'], [], 0.1).ageBucket, 'young');
  assert.equal(pickPersonaSlotForTest(['中古', '老物件'], [], 0.5).ageBucket, 'middle');
  assert.equal(pickPersonaSlotForTest(['中古', '老物件'], [], 0.9).ageBucket, 'senior');
});

test('七八月不再自动注入暑假热点', () => {
  assert.notEqual(pickUpcomingHoliday(new Date('2026-07-16T12:00:00+08:00'))?.name, '暑假');
  assert.notEqual(pickUpcomingHoliday(new Date('2026-08-02T12:00:00+08:00'))?.name, '暑假');
});

test('节日提示是可选背景而不是强制蹭热点', () => {
  const brief = formatHolidayBrief({
    name: '国庆', month: 10, day: 1, windowDays: 7, daysAway: 2,
    vibe: 'festive', hookHints: ['国庆来逛'],
  });
  assert.match(brief, /可选/);
  assert.doesNotMatch(brief, /请蹭|必须/);
});

test('DeepSeek 脚本规范化后五段对白、字幕和连续全文严格一致', () => {
  const script = normalizeDeepSeekSurpriseScript({
    title: '上海旅行隐藏副本',
    continuous_dialogue: '来上海旅行别错过这家藏满惊喜的中古宝藏店，一走进去满眼复古杂货每排货架都值得认真翻，昭和玩具日式瓷器老唱片随手一拿都很有故事，预算不用太高也能挑到一件独特的旅行纪念，现在把宝藏中古店放进攻略到店认真翻一圈',
    hook: { scene: '真实门头', action: '边走边说', dialogue: '来上海旅行别错过这家藏满惊喜的中古宝藏店', subtitle: '上海旅行隐藏副本', image_index: 0 },
    scenes: [
      { scene: '货架', action: '边走边说', dialogue: '一走进去满眼复古杂货每排货架都值得认真翻', subtitle: '每排都值得认真翻', image_index: 1 },
      { scene: '商品特写', action: '边拿边说', dialogue: '昭和玩具日式瓷器老唱片随手一拿都很有故事', subtitle: '玩具瓷器老唱片', image_index: 2 },
      { scene: '翻筐体验', action: '边翻边说', dialogue: '预算不用太高也能挑到一件独特的旅行纪念', subtitle: '低预算也有惊喜', image_index: 3 },
    ],
    outro: { scene: '店内全景', action: '边招手边说', dialogue: '现在把宝藏中古店放进攻略到店认真翻一圈', subtitle: '现在就来认真翻一圈', image_index: 4 },
  });
  const result = validateSurpriseScript(script);
  assert.deepEqual(result.errors, []);
  assert.equal(result.dialogueLength >= 90 && result.dialogueLength <= 100, true);
});

test('脚本校验拒绝空对白、空字幕和年龄错配话题', () => {
  const script: any = {
    continuous_dialogue: '暑假来这里玩',
    hook: { scene: '门头', action: '走入', dialogue: '', subtitle: '' },
    scenes: [{}, {}, {}],
    outro: {},
  };
  const result = validateSurpriseScript(script, { ageBucket: 'senior' });
  assert.ok(result.errors.some((error) => error.includes('dialogue')));
  assert.ok(result.errors.some((error) => error.includes('subtitle')));
  assert.ok(result.errors.some((error) => error.includes('暑假')));
});
