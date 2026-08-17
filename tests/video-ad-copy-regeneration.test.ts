import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const edgeSource = readFileSync(
  new URL('../supabase/functions/generate-marketing-video-copy/index.ts', import.meta.url),
  'utf8',
);
const dialogSource = readFileSync(
  new URL('../src/components/marketing/AssetDetailDialog.tsx', import.meta.url),
  'utf8',
);

test('广告文案接口只缓存 video_copy，不把脚本 publish_copy 当最终文案', () => {
  assert.match(edgeSource, /const force = body\.force === true/);
  assert.match(edgeSource, /const savedCopy = meta\.video_copy/);
  assert.doesNotMatch(edgeSource, /const savedCopy = meta\.video_copy \|\| meta\.publish_copy/);
  assert.match(edgeSource, /if \(!force && savedCopy/);
});

test('素材详情支持首次自动升级旧文案，并可显式强制重新生成', () => {
  assert.match(dialogSource, /force: opts\?\.force === true/);
  assert.match(dialogSource, /generateVideoCopy\(\{ force: true \}\)/);
  assert.match(dialogSource, /shouldGenerateVideoAssetCopy\(asset\.meta\)/);
});
