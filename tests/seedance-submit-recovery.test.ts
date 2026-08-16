import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const submitSource = readFileSync(
  new URL('../supabase/functions/_shared/seedance-submit.ts', import.meta.url),
  'utf8',
);
const pollSource = readFileSync(
  new URL('../supabase/functions/poll-marketing-video/index.ts', import.meta.url),
  'utf8',
);

test('Seedance 创建任务有硬超时并返回可读错误', () => {
  assert.match(submitSource, /SEEDANCE_SUBMIT_TIMEOUT_MS\s*=\s*25_000/);
  assert.match(submitSource, /AbortSignal\.timeout\(SEEDANCE_SUBMIT_TIMEOUT_MS\)/);
  assert.match(submitSource, /Seedance 创建任务请求超时/);
});

test('提交异常不会留下 running 且没有 provider_task_id 的孤儿任务', () => {
  assert.match(pollSource, /recoverSeedanceSubmission/);
  assert.match(pollSource, /status:\s*"queued"/);
  assert.match(pollSource, /submit_attempts/);
  assert.match(pollSource, /submit_retry_at/);
});

test('轮询会自动恢复超过一分钟且没有任务 ID 的提交任务', () => {
  assert.match(pollSource, /SEEDANCE_SUBMIT_STALE_MS\s*=\s*60_000/);
  assert.match(pollSource, /SEEDANCE_SUBMIT_MAX_ATTEMPTS\s*=\s*2/);
  assert.match(pollSource, /isStaleSeedanceSubmission/);
  assert.match(pollSource, /submit_attempts[^\n]*>=\s*SEEDANCE_SUBMIT_MAX_ATTEMPTS/);
});
