import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const marketing = readFileSync(new URL('../src/pages/MyMarketing.tsx', import.meta.url), 'utf8');
const shopHook = readFileSync(new URL('../src/hooks/useShops.ts', import.meta.url), 'utf8');

test('营销中心首屏展示当前门店和切换入口', () => {
  assert.match(marketing, /MarketingShopSwitcher/);
  assert.match(marketing, /当前门店/);
});

test('门店切换事件同步同一页面中的脚本、素材和发布功能', () => {
  assert.match(shopHook, /boomer\.marketing\.shop\.change/);
  assert.doesNotMatch(shopHook, /if \(!isAdmin\) return/);
});
