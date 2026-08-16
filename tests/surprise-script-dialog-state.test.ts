import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveSurpriseScriptView } from '../src/lib/surpriseScriptView.ts';

test('脚本失败且没有结果时显示错误，不得继续显示加载动画', () => {
  assert.equal(resolveSurpriseScriptView({
    hasActiveJob: false,
    picking: false,
    hasPick: false,
    scriptError: '当前门店还没有实景图',
  }), 'error');
});

test('后台仍在生成脚本时保持加载状态', () => {
  assert.equal(resolveSurpriseScriptView({
    hasActiveJob: false,
    picking: true,
    hasPick: false,
    scriptError: null,
  }), 'loading');
});

test('前端确认规则和后端 90-100 字高密度规则一致', () => {
  const source = readFileSync(
    new URL('../src/components/marketing/SurpriseVideoDialog.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /length < 18 \|\| length > 21/);
  assert.match(source, /count < 90 \|\| count > 100/);
  assert.doesNotMatch(source, /60.72/);
});
