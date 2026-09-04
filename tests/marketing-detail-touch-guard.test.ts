import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/marketing/MarketingLibrary.tsx', import.meta.url),
  'utf8',
);

test('素材详情打开期间忽略 iOS 延迟触摸，避免切换到背后的卡片', () => {
  assert.match(source, /const detailTouchGuardRef = useRef<string \| null>\(null\)/);
  assert.match(source, /if \(detailTouchGuardRef\.current\) return;/);
  assert.match(source, /detailTouchGuardRef\.current = asset\.id/);
  assert.match(source, /onClick=\{\(\) => \{ if \(manageMode\) toggleSel\(it\.id\); else openAssetDetail\(it\); \}\}/);
});

test('关闭详情后延迟释放触摸锁，避免关闭按钮穿透并重新打开素材', () => {
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /detailTouchGuardRef\.current = null/);
  assert.match(source, /}, 650\)/);
  assert.match(source, /onOpenChange=\{\(nextOpen\) => !nextOpen && closeAssetDetail\(\)\}/);
});
