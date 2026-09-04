import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/marketing/AssetDetailDialog.tsx', import.meta.url),
  'utf8',
);

test('原生 App 远程视频失败后会自动下载到缓存并改用本地地址播放', () => {
  assert.match(source, /Filesystem\.downloadFile/);
  assert.match(source, /Directory\.Cache/);
  assert.match(source, /Capacitor\.convertFileSrc/);
  assert.match(source, /prepareNativePlayback/);
  assert.match(source, /onError=\{handleVideoError\}/);
});

test('原生本地视频不携带 crossOrigin，避免 WKWebView 拒绝缓存文件', () => {
  assert.match(source, /crossOrigin=\{nativePlaybackUrl \? undefined : ['"]anonymous['"]\}/);
});

test('原生缓存下载期间忽略重复的 media error', () => {
  assert.match(source, /if \(nativePreparingRef\.current\) return;/);
  assert.match(source, /nativePreparingRef\.current = true/);
});

test('iOS 点击播放时保留封面按钮节点，避免触摸穿透到弹窗后的素材卡片', () => {
  assert.doesNotMatch(source, /if \(!active\) \{[\s\S]*?return \(\s*<button/);
  assert.match(source, /const handleActivate = \(event: React\.MouseEvent<HTMLButtonElement>\)/);
  assert.match(source, /disabled=\{active && !guardingActivation\}/);
  assert.match(source, /guardingActivation \? 'opacity-0 pointer-events-auto'/);
  assert.match(source, /window\.setTimeout\(\(\) => setGuardingActivation\(false\), 450\)/);
});
