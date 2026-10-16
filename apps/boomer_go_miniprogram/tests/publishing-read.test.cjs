const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');
const SHOP = '00000000-0000-4000-8000-000000000701';
const JOB = '00000000-0000-4000-8000-000000000702';
const TARGET = '00000000-0000-4000-8000-000000000703';
const OTHER = '00000000-0000-4000-8000-000000000704';
const config = { supabaseUrl: 'https://example.test', publicKey: 'public' };
function row() { return { id: JOB, shop_id: SHOP, title: '门店视频', kind: 'video', status: 'partial', created_at: '2026-10-16T01:00:00Z', schedule_at: null, social_publish_targets: [{ platform: 'xiaohongshu' }, { platform: 'douyin' }, { platform: 'douyin' }], worker_file_path: 'private', body: 'not selected' }; }
function detail() { return { job: row(), targets: [{ id: TARGET, job_id: JOB, status: 'success', progress: 100, platform: 'xiaohongshu', platform_post_url: 'https://example.test/post/1', error_message: null, account: { account_name: '店铺账号', platform: 'xiaohongshu', worker_account_key: 'never-render' }, worker_claim_token: 'never-render' }] }; }
function setup(reply) {
  let revision = 1, user = { userId: 'employee', shop: { id: SHOP }, scopeVersion: 1 }, fresh = 0;
  const requests = [];
  const session = { get: () => user, revision: () => revision, token: () => 'employee-token', ensureFresh: async () => { fresh++; } };
  const transport = createTransport({ request(r) { requests.push(r); if (reply) reply(r); else r.success({ statusCode: 200, data: r.method === 'GET' ? [row()] : detail() }); } }, config, session.token);
  return { api: createApi({ wx: {}, config, session, invoke: transport }), requests, session, fresh: () => fresh, change() { revision++; user = { ...user, shop: { id: OTHER } }; }, noShop() { user = { ...user, shop: null }; } };
}

test('publishing history uses only a fixed caller-JWT GET with current shop and a recent50 projection', async () => {
  const h = setup(); const result = await h.api.publishHistory(); const r = h.requests[0];
  assert.equal(r.method, 'GET'); assert.equal(r.data, undefined); assert.equal(r.header.Authorization, 'Bearer employee-token');
  const url = new URL(r.url); assert.equal(url.pathname, '/rest/v1/social_publish_jobs');
  assert.equal(url.searchParams.get('shop_id'), 'eq.' + SHOP); assert.equal(url.searchParams.get('order'), 'created_at.desc'); assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('select'), 'id,shop_id,title,kind,status,created_at,schedule_at,social_publish_targets(platform)');
  assert.equal(result.shopId, SHOP); assert.equal(result.limit, 50); assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].platforms, ['xiaohongshu', 'douyin']);
  assert.equal(result.items[0].worker_file_path, undefined); assert.equal(result.items[0].body, undefined); assert.equal(h.fresh(), 2);
});

for (const [name, mutate] of [
  ['wrong shop', x => { x[0].shop_id = OTHER; }], ['missing id', x => { delete x[0].id; }],
  ['array id', x => { x[0].id = [JOB]; }],
  ['bad date', x => { x[0].created_at = 'bad'; }], ['duplicate', x => { x.push(row()); }],
  ['over50', x => { for (let n = 0; n < 50; n++) x.push(row()); }], ['bad platform relation', x => { x[0].social_publish_targets = {}; }]
]) test('history refuses malformed or mismatched ' + name, async () => {
  const h = setup(r => { const items = [row()]; mutate(items); r.success({ statusCode: 200, data: items }); });
  await assert.rejects(h.api.publishHistory());
});

test('history no-shop and stale-return reads do not expose another context', async () => {
  const none = setup(); none.noShop(); await assert.rejects(none.api.publishHistory()); assert.equal(none.requests.length, 0);
  const stale = setup(r => { stale.change(); r.success({ statusCode: 200, data: [row()] }); });
  await assert.rejects(stale.api.publishHistory(), e => e.code === 'stale_operation');
});

test('status projects exact job and target bindings and uses the real platform_post_url field', async () => {
  const h = setup(); const result = await h.api.publishStatus(JOB);
  assert.equal(h.requests[0].url, config.supabaseUrl + '/functions/v1/dispatch-job-status');
  assert.deepEqual(h.requests[0].data, { job_id: JOB });
  assert.equal(result.job.id, JOB); assert.equal(result.targets[0].postUrl, 'https://example.test/post/1');
  assert.equal(JSON.stringify(result).includes('never-render'), false); assert.equal(JSON.stringify(result).includes('worker_file_path'), false);
  assert.equal(h.fresh(), 2);
});

for (const [name, mutate] of [
  ['job ID', x => { x.job.id = OTHER; }], ['shop ID', x => { x.job.shop_id = OTHER; }],
  ['target job ID', x => { x.targets[0].job_id = OTHER; }], ['target ID', x => { x.targets[0].id = ''; }],
  ['array target ID', x => { x.targets[0].id = [TARGET]; }],
  ['target array', x => { x.targets = null; }]
]) test('status refuses mismatched ' + name, async () => {
  const h = setup(r => { const value = detail(); mutate(value); r.success({ statusCode: 200, data: value }); });
  await assert.rejects(h.api.publishStatus(JOB));
});

test('unknown statuses stay explicit, progress is bounded and unsafe links are not copy candidates', async () => {
  const h = setup(r => { const value = detail(); value.job.status = 'constructor'; value.targets[0].status = 'new-worker-state'; value.targets[0].progress = 900; value.targets[0].platform_post_url = 'javascript:alert(1)'; r.success({ statusCode: 200, data: value }); });
  const value = await h.api.publishStatus(JOB);
  assert.match(value.job.statusLabel, /constructor/); assert.match(value.targets[0].statusLabel, /new-worker-state/);
  assert.equal(value.targets[0].progress, 100); assert.equal(value.targets[0].postUrl, '');
});

test('fixed history transport rejects tokenless, foreign-query or generic table requests before network', async () => {
  let calls = 0; const call = createTransport({ request() { calls++; } }, config, () => null);
  await assert.rejects(call('rest:publish-history', { shop_id: SHOP }));
  await assert.rejects(call('rest:publish-history', { shop_id: SHOP, select: '*' }));
  await assert.rejects(call('rest:other-table', { shop_id: SHOP }));
  assert.equal(calls, 0);
  const authenticated = createTransport({ request() { calls++; } }, config, () => 'current-token');
  await assert.rejects(authenticated('rest:publish-history', { shop_id: SHOP, select: '*' }));
  await assert.rejects(authenticated('rest:publish-history', { shop_id: [SHOP] }));
  assert.equal(calls, 0);
});

test('status authentication failures are preserved without retries or fake empty history', async () => {
  const h = setup(r => r.success({ statusCode: 401, data: {} }));
  await assert.rejects(h.api.publishStatus(JOB), e => e.status === 401 && e.requestRevision === 1);
  assert.equal(h.requests.length, 1);
});

test('unreported progress stays unavailable instead of inventing zero', async () => {
  for (const progress of [null, undefined, '40', NaN]) {
    const h = setup(r => { const value = detail(); value.targets[0].progress = progress; r.success({ statusCode: 200, data: value }); });
    assert.equal((await h.api.publishStatus(JOB)).targets[0].progress, null);
  }
});
