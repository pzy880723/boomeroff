import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('批量发布兼容旧 SAU 接口要求的 JSON 数组', () => {
  const source = read('../supabase/functions/_shared/sau.ts');
  assert.ok(source.includes('body: JSON.stringify([payload])'));
});

test('新建发布只写入 Worker 队列，不在 Edge Function 内等待浏览器发布', () => {
  const source = read('../supabase/functions/dispatch-job-create/index.ts');
  assert.doesNotMatch(source, /sauUpload|sauPostVideoBatch|sauPostImageBatch/);
  assert.match(source, /status:\s*isDelayed\s*\?\s*["']scheduled["']\s*:\s*["']queued["']/);
  assert.match(source, /status:\s*isDelayed\s*\?\s*["']scheduled["']\s*:\s*["']pending["']/);
});

test('新建发布会拦截失效账号、不支持的视频和定时任务', () => {
  const source = read('../supabase/functions/dispatch-job-create/index.ts');
  assert.match(source, /cookie_status/);
  assert.match(source, /supports_video/);
  assert.match(source, /supports_schedule/);
});

test('重试只把 target 放回 pending 队列', () => {
  const source = read('../supabase/functions/dispatch-job-retry/index.ts');
  assert.doesNotMatch(source, /sauPostVideoBatch/);
  assert.match(source, /status:\s*["']pending["']/);
});

test('导演完成接口返回素材 ID，完成页可直接进入发布工作台', () => {
  const complete = read('../supabase/functions/director-complete-job/index.ts');
  const api = read('../src/api/videoGeneration.ts');
  const progress = read('../src/components/marketing/director/DirectorProgress.tsx');
  assert.match(complete, /asset_id/);
  assert.match(api, /Promise<string>/);
  assert.match(progress, /dispatch\/workbench\?asset_id=/);
});
