import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendSurpriseConversation,
  appendSurpriseScriptVersion,
  normalizeSurprisePersonaRevision,
  orderSurpriseReferenceAssets,
} from '../supabase/functions/_shared/surprise-script-revision.ts';

test('自然语言改稿对话只保留最近十二轮消息', () => {
  const existing = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `旧消息${index}`,
  }));
  const result = appendSurpriseConversation(existing, '更突出唱片区', '已经按唱片区重写');

  assert.equal(result.length, 12);
  assert.deepEqual(result.at(-2), { role: 'user', content: '更突出唱片区' });
  assert.deepEqual(result.at(-1), { role: 'assistant', content: '已经按唱片区重写' });
});

test('脚本版本限制为最近八版并记录来源', () => {
  const existing = Array.from({ length: 8 }, (_, index) => ({ at: `old-${index}`, source: 'manual', script: { index } }));
  const result = appendSurpriseScriptVersion(existing, { index: 9 }, 'conversation', '强调黑胶');

  assert.equal(result.length, 8);
  assert.equal(result.at(-1)?.source, 'conversation');
  assert.equal(result.at(-1)?.instruction, '强调黑胶');
  assert.deepEqual(result.at(-1)?.script, { index: 9 });
});

test('更换参考图始终把原来的真实门头放在第一张并按用户顺序去重', () => {
  const storefront = { asset_id: 'front', url: 'front.jpg', summary: '真实门头', role: 'storefront' };
  const selected = [
    { id: 'b', output_url: 'b.jpg', description: '唱片区' },
    { id: 'a', output_url: 'a.jpg', description: '玩具区' },
    { id: 'b', output_url: 'b.jpg', description: '重复唱片区' },
  ];

  const result = orderSurpriseReferenceAssets(storefront, selected);

  assert.deepEqual(result.map((item) => item.asset_id), ['front', 'b', 'a']);
  assert.equal(result[0].role, 'storefront');
  assert.equal(result[1].role, 'scene');
  assert.deepEqual(result.map((item) => item.index), [0, 1, 2]);
});

test('人物修改会生成完整且年龄段一致的新人物设定', () => {
  const current = {
    label: '中年探店博主', gender: 'male', age: 42, visual: '短发夹克', vibe: '稳重',
    pace: 'medium', tone_label: '真诚', opener: '你看', catchphrase: ['真不错'], cta: '来逛逛',
    group_type: 'solo', age_bucket: 'middle', companions: [],
  };
  const revised = normalizeSurprisePersonaRevision(current, {
    label: '年轻女生探店博主', gender: 'female', age: 25, visual: '黑色长发与复古夹克', vibe: '活泼',
    pace: 'fast', tone_label: '兴奋', opener: '快看', catchphrase: ['太会淘了'], cta: '马上来',
  });

  assert.equal(revised.gender, 'female');
  assert.equal(revised.age, 25);
  assert.equal(revised.age_bucket, 'young');
  assert.equal(revised.pace, 'fast');
});
