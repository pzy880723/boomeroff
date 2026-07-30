import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sau = () => read('../supabase/functions/_shared/sau.ts');
const login = () => read('../supabase/functions/dispatch-account-login/index.ts');
const callback = () => read('../supabase/functions/worker-callback/index.ts');
const cron = () => read('../supabase/functions/worker-cron-tick/index.ts');

test('SAU 平台表同时接受 wechat_channels 与 wechat_video，都是 code 2', () => {
  const s = sau();
  assert.match(s, /wechat_channels:\s*2/);
  assert.match(s, /wechat_video:\s*2/);
  assert.match(s, /dianping:\s*7/);
});

test('SAU 暴露 canonicalPlatform，把 wechat_channels 归一为 wechat_video', () => {
  const s = sau();
  assert.match(s, /export function canonicalPlatform/);
  assert.match(s, /wechat_channels["']?\s*:\s*["']wechat_video["']/);
});

test('SAU 暴露账号 cookie 健康判定，兼容历史 active 与 valid', () => {
  const s = sau();
  assert.match(s, /export const HEALTHY_COOKIE_STATUSES/);
  assert.match(s, /["']active["']/);
  assert.match(s, /["']valid["']/);
  assert.match(s, /export function isHealthyCookieStatus/);
});

test('扫码登录先归一平台名再取 SAU code，并按 canonical 平台落库', () => {
  const s = login();
  assert.match(s, /canonicalPlatform/);
  assert.match(s, /platform:\s*canonicalPlatform\(|const platform = canonicalPlatform\(/);
});

test('worker-callback 的 account.bound / account.checked 统一写 valid', () => {
  const s = callback();
  assert.doesNotMatch(s, /cookie_status:\s*["']active["']/);
  assert.match(s, /cookie_status:\s*["']valid["']/);
  assert.match(s, /isHealthyCookieStatus|HEALTHY_COOKIE_STATUSES/);
});

test('worker-cron-tick 在领单前剔除 cookie 失效账号并标记 failed', () => {
  const s = cron();
  assert.match(s, /account_cookie_invalid/);
  assert.match(s, /isHealthyCookieStatus/);
  assert.match(s, /status:\s*["']failed["']/);
  assert.match(s, /rollupJobStatus/);
});
