import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('1080p 视频转存使用流式上传而不是整段 arrayBuffer', () => {
  const mirror = read('../supabase/functions/_shared/mirror-tos-video.ts');
  assert.doesNotMatch(mirror, /upstream\.arrayBuffer\(\)/);
  assert.match(mirror, /upstream\.body/);
  assert.match(mirror, /x-upsert/i);
});

test('已成功任务会继续补做长期链接转存', () => {
  const poll = read('../supabase/functions/poll-marketing-video/index.ts');
  assert.match(poll, /job\.status === ["']succeeded["'][\s\S]*updateAssetMeta/);
});

test('临时转存错误不会把仍有效的视频永久标成过期', () => {
  const mirror = read('../supabase/functions/_shared/mirror-tos-video.ts');
  const refresh = read('../supabase/functions/mirror-marketing-asset/index.ts');
  assert.match(mirror, /sourceExpired/);
  assert.match(refresh, /result\.sourceExpired/);
  assert.match(refresh, /status:\s*["']mirror_failed["']/);
});

test('手机下载直接流式写入文件，不把 1080p 视频转成 Base64', () => {
  const gallery = read('../src/lib/saveToGallery.ts');
  const detail = read('../src/components/marketing/AssetDetailDialog.tsx');
  assert.match(gallery, /saveUrlToGallery/);
  assert.match(gallery, /Filesystem\.downloadFile/);
  assert.match(detail, /createSignedUrl/);
  assert.match(detail, /saveUrlToGallery/);
});

test('惊喜一下可修改五段脚本，并用修改后的唯一口播提交', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');
  assert.match(dialog, /编辑脚本/);
  assert.match(dialog, /onScriptChange/);
  assert.match(dialog, /continuous_dialogue/);
  assert.match(dialog, /script:\s*pick\.script/);
});
