import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildFastSurpriseFallback } from '../supabase/functions/_shared/surprise-script-performance.ts';
import { validateSurpriseScript } from '../supabase/functions/_shared/surprise-script-policy.ts';

test('快速兜底稿仍满足高密度五镜、字幕对齐和连续口播规则', () => {
  const script = buildFastSurpriseFallback({
    shopName: '上海中信泰富店',
    imageDescriptions: [
      { index: 0, summary: '商场地下一层开放式门头与 BOOMER OFF 招牌' },
      { index: 1, summary: '店内整排复古杂货货架' },
      { index: 2, summary: '玩具瓷器与老唱片细节' },
    ],
  });

  const validation = validateSurpriseScript(script, {
    factContext: '上海中信泰富店 中古杂货 玩具 瓷器 老唱片',
  });
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.dialogueLength >= 90 && validation.dialogueLength <= 100);
  assert.equal(script.publish_copy?.title.includes('中信泰富'), true);
});

test('惊喜一下只允许一次 DeepSeek 请求并使用快速模型', () => {
  const source = readFileSync(
    new URL('../supabase/functions/generate-marketing-video-script/index.ts', import.meta.url),
    'utf8',
  );
  assert.equal((source.match(/await requestDeepSeekJson\(/g) || []).length, 1);
  assert.doesNotMatch(source, /for \(let attempt = 0; attempt < 3/);
  assert.match(source, /deepseek-v4-flash/);
  assert.match(source, /buildFastSurpriseFallback/);
});
