import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildSurpriseContentScopePrompt,
  listSurpriseContentScopes,
  resolveSurpriseContentScope,
} from '../supabase/functions/_shared/surprise-content-scope.ts';

test('内容范围不再提供家居摆件', () => {
  const labels = listSurpriseContentScopes().map((item) => item.label);
  assert.deepEqual(labels, ['全品类', '瓷器餐具', '玩具公仔', '唱片音响', '首饰配饰']);
  assert.equal(labels.includes('家居摆件'), false);
});

test('瓷器餐具提示词使用已确认卖点和退休生活受众', () => {
  const scope = resolveSurpriseContentScope('ceramics');
  const prompt = buildSurpriseContentScopePrompt(scope);

  assert.equal(scope.key, 'ceramics');
  assert.match(prompt, /45-68/);
  assert.match(prompt, /中老年及退休人群/);
  assert.match(prompt, /全场商品6\.9元起/);
  assert.match(prompt, /日本瓷器/);
  assert.match(prompt, /欧洲瓷器/);
  assert.match(prompt, /款式丰富/);
  assert.match(prompt, /退休生活不要总待在家/);
  assert.match(prompt, /热情/);
  assert.match(prompt, /不得照抄示例/);
});

test('瓷器餐具素材匹配识别瓷器标签而不匹配玩具', () => {
  const scope = resolveSurpriseContentScope('ceramics');
  assert.equal(scope.matches({ category: '家居', tags: ['中古瓷器', '咖啡杯碟'] }), true);
  assert.equal(scope.matches({ category: '玩具', tags: ['奥特曼', '软胶玩具'] }), false);
});

test('惊喜视频生成器把客户端选择的内容范围写进真实脚本提示词', () => {
  const source = readFileSync(
    new URL('../supabase/functions/surprise-marketing-video/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /resolveSurpriseContentScope\(body\.content_scope\)/);
  assert.match(source, /buildSurpriseContentScopePrompt\(contentScope\)/);
  assert.match(source, /contentScopePrompt/);
});
