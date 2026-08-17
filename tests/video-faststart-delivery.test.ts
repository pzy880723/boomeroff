import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const callbackSource = readFileSync(
  new URL('../supabase/functions/cover-callback/index.ts', import.meta.url),
  'utf8',
);
const nginxSource = readFileSync(
  new URL('../deploy/nginx/ai-boomeroff.com.conf', import.meta.url),
  'utf8',
);
const mirrorSource = readFileSync(
  new URL('../supabase/functions/mirror-marketing-asset/index.ts', import.meta.url),
  'utf8',
);
const downloadSource = readFileSync(
  new URL('../supabase/functions/download-marketing-asset/index.ts', import.meta.url),
  'utf8',
);

test('封面回调会把腾讯云 Fast Start 成片覆盖回长期素材地址', () => {
  assert.match(callbackSource, /optimized_video_url/);
  assert.match(callbackSource, /mirrorTosVideoToStorage/);
  assert.match(callbackSource, /stream_faststart:\s*true/);
  assert.match(callbackSource, /stream_optimized_at/);
});

test('视频预览使用腾讯云同源地址，Supabase 只保留长期备份', () => {
  assert.match(callbackSource, /delivery_video_url/);
  assert.match(callbackSource, /storage_backup_url/);
  assert.match(callbackSource, /stableVideoUrl\s*=\s*deliveryVideoUrl/);
  assert.match(nginxSource, /location \^~ \/media\/generated-videos\//);
  assert.match(nginxSource, /alias \/var\/www\/aigc-cover\/optimized-videos\//);
});

test('腾讯云视频路由允许原生 WebView 跨域读取和 Range 播放', () => {
  assert.match(nginxSource, /Access-Control-Allow-Origin\s+"\*"\s+always/);
  assert.match(nginxSource, /Access-Control-Allow-Headers\s+"Range"\s+always/);
  assert.match(nginxSource, /Access-Control-Expose-Headers\s+"Content-Length, Content-Range, Accept-Ranges"\s+always/);
});

test('刷新和下载接口认可腾讯云视频交付地址', () => {
  assert.match(mirrorSource, /isTencentDeliveryUrl/);
  assert.match(mirrorSource, /isTencentDeliveryUrl\(url\)/);
  assert.match(downloadSource, /ai\.boomeroff\.com/);
});
