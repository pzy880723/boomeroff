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
    hook: { scene: '真实门头', action: '边走边说', dialogue: '来上海旅行别错过这家藏满惊喜的中古宝藏店', subtitle: '来上海旅行别错过这家藏满惊喜的中古宝藏店', image_index: 0 },
    scenes: [
      { scene: '货架', action: '边走边说', dialogue: '一走进去满眼复古杂货每排货架都值得认真翻', subtitle: '一走进去满眼复古杂货每排货架都值得认真翻', image_index: 1 },
      { scene: '商品特写', action: '边拿边说', dialogue: '昭和玩具日式瓷器老唱片随手一拿都很有故事', subtitle: '昭和玩具日式瓷器老唱片随手一拿都很有故事', image_index: 2 },
      { scene: '翻筐体验', action: '边翻边说', dialogue: '预算不用太高也能挑到一件独特的旅行纪念', subtitle: '预算不用太高也能挑到一件独特的旅行纪念', image_index: 3 },
    ],
    outro: { scene: '店内全景', action: '边招手边说', dialogue: '现在把宝藏中古店放进攻略到店认真翻一圈', subtitle: '现在把宝藏中古店放进攻略到店认真翻一圈', image_index: 4 },
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

test('脚本校验拒绝字幕与最终对白不一致', () => {
  const dialogues = [
    '来上海一定要逛这家藏满惊喜的中古宝藏店',
    '一进门满眼复古货架每一排都值得认真翻找',
    '昭和玩具日式瓷器老唱片随手拿都有故事感',
    '预算不用太高也能挑到独特又实用的纪念好物',
    '把这家店放进攻略今天就来认真翻上一圈吧',
  ];
  const script: any = {
    continuous_dialogue: dialogues.join('，'),
    hook: { scene: '门头', action: '边走边说', dialogue: dialogues[0], subtitle: '门头惊喜' },
    scenes: dialogues.slice(1, 4).map((dialogue, i) => ({
      scene: `店内场景${i + 1}`,
      action: '边拿商品边说',
      dialogue,
      subtitle: `完全不同的概括字幕${i + 1}`,
    })),
    outro: { scene: '店内全景', action: '边招手边说', dialogue: dialogues[4], subtitle: '马上来逛' },
  };
  const result = validateSurpriseScript(script);
  assert.ok(result.errors.some((error) => error.includes('字幕') && error.includes('对白')));
});

test('脚本校验拒绝五段之间重复的对白短语', () => {
  const repeated = '这家店真的值得现在马上过来认真逛一圈';
  const dialogues = [repeated, repeated, repeated, repeated, repeated];
  const script: any = {
    continuous_dialogue: dialogues.join('，'),
    hook: { scene: '门头', action: '边走边说', dialogue: dialogues[0], subtitle: dialogues[0] },
    scenes: dialogues.slice(1, 4).map((dialogue, i) => ({
      scene: `店内场景${i + 1}`,
      action: '边拿商品边说',
      dialogue,
      subtitle: dialogue,
    })),
    outro: { scene: '店内全景', action: '边招手边说', dialogue: dialogues[4], subtitle: dialogues[4] },
  };
  const result = validateSurpriseScript(script);
  assert.ok(result.errors.some((error) => error.includes('重复')));
});

test('脚本校验拒绝对白不足，不能用固定台词补齐', () => {
  const dialogues = [
    '来上海就要逛这家中古宝藏店',
    '一进门满眼都是复古好物',
    '玩具瓷器唱片随手都很惊喜',
    '预算不高也能淘到独特好物',
    '把这家店放进攻略马上来逛',
  ];
  const script: any = {
    continuous_dialogue: dialogues.join('，'),
    hook: { scene: '门头', action: '边走边说', dialogue: dialogues[0], subtitle: dialogues[0] },
    scenes: dialogues.slice(1, 4).map((dialogue, i) => ({
      scene: `店内场景${i + 1}`,
      action: '边拿商品边说',
      dialogue,
      subtitle: dialogue,
    })),
    outro: { scene: '店内全景', action: '边招手边说', dialogue: dialogues[4], subtitle: dialogues[4] },
  };
  const result = validateSurpriseScript(script);
  assert.ok(result.errors.some((error) => error.includes('第 1 段对白必须 18-21')));
});
