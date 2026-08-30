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
  assert.doesNotMatch(gallery, /Media\.saveVideo\(\{ path: url \}\)/);
  assert.ok(
    gallery.indexOf('Filesystem.downloadFile') < gallery.indexOf("Media.saveVideo({ path: fileUri })"),
    '1080p 视频必须先下载到本地缓存，再交给相册插件保存',
  );
  assert.match(detail, /createSignedUrl/);
  assert.match(detail, /saveUrlToGallery/);
});

test('下载接口按 storage_path 生成新签名，不依赖可能过期的 output_url', () => {
  const download = read('../supabase/functions/download-marketing-asset/index.ts');
  assert.match(download, /meta\?\.storage_path/);
  assert.match(download, /createSignedUrl\(storagePath/);
});

test('成片详情分开交付视频和封面，下载前立即复制固定文案', () => {
  const detail = read('../src/components/marketing/AssetDetailDialog.tsx');
  assert.match(detail, /成片交付/);
  assert.match(detail, /保存视频/);
  assert.match(detail, /保存封面/);
  assert.match(detail, /copyTextFromUserAction/);
  assert.ok(
    detail.indexOf('const copyPromise = txt ? copyTextFromUserAction(txt)') < detail.indexOf('setDownloading(true)'),
    '剪贴板复制必须在耗时下载开始前触发',
  );
});

test('新生成的视频素材直接带入脚本的 publish_copy', () => {
  const render = read('../supabase/functions/render-marketing-video/index.ts');
  assert.equal((render.match(/publish_copy:\s*script\.publish_copy\s*\|\|\s*null/g) || []).length, 2);
});

test('惊喜一下可修改五段脚本，并只提交服务端脚本任务 ID', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');
  assert.match(dialog, /编辑脚本/);
  assert.match(dialog, /onScriptChange/);
  assert.match(dialog, /continuous_dialogue/);
  assert.match(dialog, /await saveSurpriseScriptJob\(scriptJobId, pick\.script\)/);
  assert.match(dialog, /script_job_id:\s*scriptJobId/);
  assert.doesNotMatch(dialog, /script:\s*finalScript/);
  assert.ok(!dialog.includes("['subtitle', '字幕']"));
});
