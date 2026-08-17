import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const callbackSource = readFileSync(
  new URL('../supabase/functions/cover-callback/index.ts', import.meta.url),
  'utf8',
);

test('封面回调会把腾讯云 Fast Start 成片覆盖回长期素材地址', () => {
  assert.match(callbackSource, /optimized_video_url/);
  assert.match(callbackSource, /mirrorTosVideoToStorage/);
  assert.match(callbackSource, /stream_faststart:\s*true/);
  assert.match(callbackSource, /stream_optimized_at/);
});
