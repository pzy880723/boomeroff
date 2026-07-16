import assert from 'node:assert/strict';
import test from 'node:test';

import { requestDeepSeekJson } from '../supabase/functions/_shared/deepseek-client.ts';

test('DeepSeek 客户端使用 v4-pro 非思考 JSON 模式且不改写密钥', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  let authHeader = '';
  globalThis.fetch = (async (_url: any, init: any) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    authHeader = String(init?.headers?.Authorization || '');
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"title":"测试脚本"}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await requestDeepSeekJson({
      apiKey: 'test-secret',
      systemPrompt: '只输出 JSON',
      userPrompt: '生成 JSON 脚本',
    });
    assert.equal(result.title, '测试脚本');
    assert.equal(authHeader, 'Bearer test-secret');
    assert.equal(requestBody.model, 'deepseek-v4-pro');
    assert.deepEqual(requestBody.response_format, { type: 'json_object' });
    assert.deepEqual(requestBody.thinking, { type: 'disabled' });
    assert.equal(requestBody.stream, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
