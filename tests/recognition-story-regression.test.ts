import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('深度补全必须生成商品故事并淘汰旧的无故事缓存', () => {
  const source = read('supabase/functions/enrich-recognition/index.ts');

  assert.match(source, /const ENRICH_VERSION = 2/);
  assert.match(source, /required:\s*\[[^\]]*['"]story['"]/s);
  assert.match(source, /story 180-260 字/);
  assert.doesNotMatch(source, /不需要再写长故事段/);
  assert.match(source, /cached\?\.version === ENRICH_VERSION/);
  assert.match(source, /version:\s*ENRICH_VERSION/);
});

test('识别结果页立即展示基础卖点并在补全后展示商品故事', () => {
  const source = read('src/components/recognition/ProductDetailCard.tsx');

  assert.match(source, /商品卖点/);
  assert.match(source, /商品故事/);
  assert.match(source, /pitch\?\.story/);
  assert.match(source, /pitch\?\.opener/);
  assert.match(source, /pitch\?\.highlight/);
  assert.match(source, /sellingPoints\.map/);
});

test('深度补全失败后允许同一商品再次尝试', () => {
  const source = read('src/components/dashboard/LiveStreamPanel.tsx');

  assert.match(source, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(source, /catch \(e\) \{[\s\S]*enrichKeyRef\.current = null;[\s\S]*\[Enrich\] failed/);
});

test('前端保留后端返回的新版商品品类用于故事补全', () => {
  const source = read('src/hooks/useProductRecognition.tsx');

  assert.match(source, /'jp_porcelain'/);
  assert.match(source, /'anime_toy'/);
  assert.match(source, /'ccd'/);
  assert.match(source, /'vintage_jewelry'/);
});
