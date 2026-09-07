// 真实 HTTP 服务器 + 真实 Response 流：验证 ACK 严格判定与「超时覆盖完整 body 读取」。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  decideAckOutcome,
  decidePullOutcome,
  erpFetchJson,
} from '../supabase/functions/_shared/erp-http.ts';

type Route = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const routes: Record<string, Route> = {
  '/json-ok': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  },
  '/json-not-ok': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, code: 'version_mismatch' }));
  },
  '/json-missing-ok': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'received' }));
  },
  '/empty-200': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('');
  },
  '/html-200': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!DOCTYPE html><html><body>ok</body></html>');
  },
  '/invalid-json-200': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok": tru');
  },
  '/array-200': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[{"ok":true}]');
  },
  '/string-200': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('"ok"');
  },
  // 头很快、body 很慢：只覆盖 headers 的超时会误判成功
  '/slow-body': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"ok"');
    setTimeout(() => res.end(': true}'), 3_000).unref?.();
  },
  '/http-500': (_q, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  },
  '/pull-ok': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: { erp_user_id: 'e1', scope_version: 7 } }));
  },
};

let server: http.Server;
let origin = '';

test.before(async () => {
  server = http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    const route = routes[path];
    if (!route) {
      res.writeHead(404);
      res.end('nope');
      return;
    }
    route(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

test.after(() => {
  server.close();
});

function call(path: string, timeoutMs = 2_000) {
  return erpFetchJson({
    url: `${origin}${path}`,
    init: { method: 'POST', headers: { Accept: 'application/json' }, body: '{}' },
    timeoutMs,
    expectedOrigin: origin,
  });
}

test('ACK: 对象且 ok===true 才算成功', async () => {
  assert.deepEqual(decideAckOutcome(await call('/json-ok')), { ok: true, code: 'acked' });
});

test('ACK: 200 空 body -> ack_bad_response（绝不算成功）', async () => {
  assert.deepEqual(decideAckOutcome(await call('/empty-200')), { ok: false, code: 'ack_bad_response' });
});

test('ACK: 200 HTML -> ack_bad_response', async () => {
  assert.deepEqual(decideAckOutcome(await call('/html-200')), { ok: false, code: 'ack_bad_response' });
});

test('ACK: 200 非法 JSON -> ack_bad_response', async () => {
  assert.deepEqual(decideAckOutcome(await call('/invalid-json-200')), { ok: false, code: 'ack_bad_response' });
});

test('ACK: 200 顶层数组 / 字符串 -> ack_bad_response', async () => {
  assert.equal(decideAckOutcome(await call('/array-200')).code, 'ack_bad_response');
  assert.equal(decideAckOutcome(await call('/string-200')).code, 'ack_bad_response');
});

test('ACK: 缺少 ok 字段 -> ack_rejected（不是成功）', async () => {
  assert.deepEqual(decideAckOutcome(await call('/json-missing-ok')), { ok: false, code: 'ack_rejected' });
});

test('ACK: ok:false 带 code -> 透传该 code', async () => {
  assert.deepEqual(decideAckOutcome(await call('/json-not-ok')), { ok: false, code: 'version_mismatch' });
});

test('ACK: HTTP 500 -> ack_http_500', async () => {
  assert.deepEqual(decideAckOutcome(await call('/http-500')), { ok: false, code: 'ack_http_500' });
});

test('ACK: 慢 body（头已到、body 未完）在超时内必须中断 -> ack_timeout', async () => {
  const t0 = Date.now();
  const r = await call('/slow-body', 600);
  const elapsed = Date.now() - t0;
  assert.deepEqual(decideAckOutcome(r), { ok: false, code: 'ack_timeout' });
  assert.ok(elapsed < 2_500, `应在超时后立刻返回，实际 ${elapsed}ms`);
});

test('ACK: 连接不上 -> ack_unreachable', async () => {
  const r = await erpFetchJson({
    url: 'http://127.0.0.1:1/x',
    init: { method: 'POST' },
    timeoutMs: 2_000,
    expectedOrigin: 'http://127.0.0.1:1',
  });
  assert.deepEqual(decideAckOutcome(r), { ok: false, code: 'ack_unreachable' });
});

test('ACK: origin 不符 -> ack_origin_mismatch，且不解析 body', async () => {
  const r = await erpFetchJson({
    url: `${origin}/json-ok`,
    init: { method: 'POST' },
    timeoutMs: 2_000,
    expectedOrigin: 'https://erp.boomeroff.com',
  });
  assert.deepEqual(decideAckOutcome(r), { ok: false, code: 'ack_origin_mismatch' });
});

test('PULL: 正常返回 data', async () => {
  const r = decidePullOutcome(await call('/pull-ok'));
  assert.equal(r.ok, true);
  assert.deepEqual((r as { ok: true; data: unknown }).data, { erp_user_id: 'e1', scope_version: 7 });
});

test('PULL: 200 空 body / HTML -> erp_bad_response，不写镜像', async () => {
  assert.deepEqual(decidePullOutcome(await call('/empty-200')), { ok: false, code: 'erp_bad_response' });
  assert.deepEqual(decidePullOutcome(await call('/html-200')), { ok: false, code: 'erp_bad_response' });
});

test('PULL: 慢 body 超时 -> erp_timeout（不续租）', async () => {
  const r = decidePullOutcome(await call('/slow-body', 600));
  assert.deepEqual(r, { ok: false, code: 'erp_timeout' });
});

test('PULL: HTTP 500 -> erp_http_500', async () => {
  assert.deepEqual(decidePullOutcome(await call('/http-500')), { ok: false, code: 'erp_http_500' });
});

test('超时定时器在正常返回后被清理（进程不会被挂住）', async () => {
  let cleared = 0;
  await erpFetchJson({
    url: `${origin}/json-ok`,
    init: { method: 'POST' },
    timeoutMs: 2_000,
    expectedOrigin: origin,
    clearTimeoutFn: (h) => {
      cleared += 1;
      clearTimeout(h as NodeJS.Timeout);
    },
  });
  assert.equal(cleared, 1);
});
