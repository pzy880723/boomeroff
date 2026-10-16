const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');
const USER = '00000000-0000-4000-8000-000000000902', ID = '00000000-0000-4000-8000-000000000903', OTHER = '00000000-0000-4000-8000-000000000904';
const context = { userId: USER };
const fields = ['id','title','body','type','active','expires_at','created_by','created_at','image_url','category','summary'];
const dto = extra => ({ id: ID, title: '原始标题', body: '正文', type: 'legacy-unknown', active: false,
  expires_at: '2026-10-20T01:02:03.123456+08:00', created_by: OTHER, created_at: '2026-10-16T09:20:00.654321+08:00', image_url: null, category: 'news', summary: null, ...extra });
const draft = extra => ({ title: ' 新通知 ', body: ' 正文 ', active: true, expires_at: null, ...extra });
function model() { return require('../miniprogram/shared/notification-manage'); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(options = {}) {
  let revision = 1, fresh = 0, restores = 0, permissions = options.permissions === undefined ? ['role.manage'] : options.permissions;
  let user = USER, shop = ID, scope = 1, token = 'synthetic-caller-token';
  const requests = [];
  const session = { get: () => ({ userId: user, shop: shop ? { id: shop } : null, scopeVersion: scope, isHeadquarters: true,
    permissions: ['role.manage'], bootstrap: { permissions } }), token: () => token, revision: () => revision,
    async ensureFresh() { fresh++; if (options.fresh) await options.fresh(fresh); }, async restore() { restores++; } };
  const wx = { request(r) {
    requests.push(r);
    if (options.network) return options.network(r);
    r.success({ statusCode: 200, data: r.url.includes('/rpc/') ? true : [dto()] });
  } };
  const transport = createTransport(wx, { supabaseUrl: 'https://example.invalid', publicKey: 'synthetic-public' }, session.token);
  return { api: createApi({ wx, session, config: {}, invoke: transport }), transport, requests, fresh: () => fresh, restores: () => restores,
    change(kind) { revision++; if (kind === 'user') user = OTHER; if (kind === 'shop') shop = OTHER; if (kind === 'scope') scope++; },
    changeActorOnly() { user = OTHER; token = 'synthetic-other-caller-token'; },
    setPermissions(p) { permissions = p; }, noShop() { shop = null; }, noToken() { token = null; } };
}
const rest = h => h.requests.filter(r => new URL(r.url).pathname === '/rest/v1/notifications');
const perms = h => h.requests.filter(r => r.url.includes('/rpc/user_has_permission'));
function network(r, response = [dto()]) { r.success({ statusCode: 200, data: r.url.includes('/rpc/') ? true : response }); }
function requestScope(r) {
  const url = new URL(r.url); assert.equal(url.origin, 'https://example.invalid'); assert.equal(url.pathname, '/rest/v1/notifications');
  assert.deepEqual(url.searchParams.get('select').split(','), fields); assert.equal(url.searchParams.has('shop_id'), false);
  assert.equal(r.header.Authorization, 'Bearer synthetic-caller-token'); return url;
}

test('public notification management methods exist without adding a generic table writer', () => {
  const h = harness();
  for (const name of ['notificationManageCapabilities','notificationManageList','notificationManageRead','notificationManageWrite']) assert.equal(typeof h.api[name], 'function', name);
  assert.equal(h.api.tableWrite, undefined);
});

test('capability intersects fresh current bootstrap and strict same-caller permission RPC with exact SQL arguments', async () => {
  const h = harness(); assert.deepEqual(await h.api.notificationManageCapabilities(), { can_manage: true });
  assert.equal(perms(h).length, 1); assert.deepEqual(perms(h)[0].data, { _user_id: USER, _perm: 'role.manage' });
  assert.equal(perms(h)[0].header.Authorization, 'Bearer synthetic-caller-token'); assert.equal(rest(h).length, 0); assert.equal(h.fresh(), 2);
});

test('missing bootstrap permission cannot be inferred from HQ or cached user.permissions', async () => {
  for (const permissions of [undefined, [], ['shop.kb.write'], ['role.manage-other'], null, 'role.manage']) {
    const h = harness({ permissions: permissions === undefined ? [] : permissions });
    assert.deepEqual(await h.api.notificationManageCapabilities(), { can_manage: false }); assert.equal(h.requests.length, 0);
    await assert.rejects(h.api.notificationManageList(), e => e.status === 403); assert.equal(h.requests.length, 0);
  }
});

test('strict false permission denies, but malformed/failed permission is never interpreted as a valid capability', async () => {
  const denied = harness({ network: r => r.success({ statusCode: 200, data: false }) });
  assert.deepEqual(await denied.api.notificationManageCapabilities(), { can_manage: false }); await assert.rejects(denied.api.notificationManageList(), e => e.status === 403); assert.equal(rest(denied).length, 0);
  for (const data of [null, {}, [true], JSON.stringify('true'), 1]) {
    const h = harness({ network: r => r.success({ statusCode: 200, data }) }); await assert.rejects(h.api.notificationManageCapabilities()); assert.equal(rest(h).length, 0);
  }
});

test('capability rechecks bootstrap after the RPC, and global management never requires/invents a selected shop', async () => {
  let h; h = harness({ fresh(n) { if (n === 2) h.setPermissions([]); } });
  assert.deepEqual(await h.api.notificationManageCapabilities(), { can_manage: false });
  const global = harness(); global.noShop(); assert.deepEqual(await global.api.notificationManageCapabilities(), { can_manage: true });
});

test('list is caller-RLS latest50 in stable created_at/id order including inactive and expired rows', async () => {
  const h = harness(), response = await h.api.notificationManageList(), r = rest(h)[0], url = requestScope(r);
  assert.deepEqual(response, { items: [dto()] }); assert.equal(r.method, 'GET'); assert.equal(r.data, undefined);
  assert.equal(url.searchParams.get('order'), 'created_at.desc,id.desc'); assert.equal(url.searchParams.get('limit'), '50');
  for (const key of ['active','expires_at','created_by','type']) assert.equal(url.searchParams.has(key), false);
  assert.equal(perms(h).length, 2); assert.equal(h.fresh(), 4);
});

test('exact-ID read returns row or null, never page-one substitution or a false empty on query failure', async () => {
  const h = harness(); assert.deepEqual(await h.api.notificationManageRead(ID), dto()); assert.equal(requestScope(rest(h)[0]).searchParams.get('id'), 'eq.' + ID);
  const absent = harness({ network: r => network(r, []) }); assert.equal(await absent.api.notificationManageRead(ID), null);
  const bad = harness({ network: r => r.success({ statusCode: r.url.includes('/rpc/') ? 200 : 500, data: r.url.includes('/rpc/') ? true : { message: 'private' } }) });
  await assert.rejects(bad.api.notificationManageRead(ID));
});

test('row parser projects exactly eleven fields, preserves microseconds and accepts historical type/length values unchanged', () => {
  const m = model(), raw = dto({ title: '字'.repeat(100), body: '文'.repeat(1000), secret: 'not-projected' }), out = m.row(raw);
  assert.deepEqual(Object.keys(out).sort(), fields.slice().sort()); assert.equal(out.title, raw.title); assert.equal(out.body, raw.body);
  assert.equal(out.created_at, raw.created_at); assert.equal(out.expires_at, raw.expires_at); out.title = 'local'; assert.equal(raw.title.length, 100);
});

test('row parser rejects missing/null required values, truthy booleans, invalid identity/timestamps and wrong nullable types', () => {
  const m = model();
  for (const patch of [{ id: [ID] }, { title: null }, { body: {} }, { type: null }, { active: 'false' }, { created_at: 'bad' }, { created_at: '2026-02-30T00:00:00Z' }, { created_by: 'bad' }, { expires_at: false }, { image_url: {} }, { category: [] }, { summary: false }]) assert.throws(() => m.row(dto(patch)));
  for (const key of fields) { const raw = dto(); delete raw[key]; assert.throws(() => m.row(raw), key); }
});

test('expiry converts strict Shanghai calendar end-of-day, clears explicitly and rejects normalized invalid dates', () => {
  const m = model(); assert.equal(m.expiry(''), null); assert.equal(m.expiry('2028-02-29'), '2028-02-29T15:59:59.000Z');
  assert.equal(m.expiry('2026-10-17'), '2026-10-17T15:59:59.000Z');
  for (const value of [null, {}, '2026-02-29','2026-02-30','2026-13-01','2026-1-01','2026-10-17x','0000-01-01']) assert.throws(() => m.expiry(value));
});

test('create freezes UUID/actor/payload without a shop, receipt/version or arbitrary metadata', () => {
  const m = model(), value = m.create(context, draft());
  assert.deepEqual(Object.keys(value).sort(), ['operation','id','userId','base','payload'].sort()); assert.equal(value.operation, 'create'); assert.equal(value.base, null); assert.equal(value.userId, USER);
  assert.match(value.id, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i); assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.payload));
  assert.deepEqual(value.payload, { title: '新通知', body: '正文', active: true, expires_at: null, type: 'announcement', created_by: USER });
  assert.equal(m.key(context), m.key(context, '')); assert.notEqual(m.key(context, ID), m.key({ userId: OTHER }, ID));
});

for (const bad of [{ title: '' }, { title: '字'.repeat(61) }, { body: '文'.repeat(501) }, { active: 'true' }, { shop_id: ID }, { type: 'backup' }, { image_url: 'https://foreign.invalid' }, { created_by: OTHER }, { expires_at: 'bad' }]) {
  test('create rejects malformed/extra fields without truncation: ' + Object.keys(bad)[0], () => { const m = model(); assert.throws(() => m.create(context, draft(bad))); });
}

test('update validates only changed legacy fields, preserves all eleven base values and patches only controlled fields', () => {
  const m = model(), base = dto({ title: '字'.repeat(90), body: '文'.repeat(900) });
  const intent = m.update(context, base, { title: base.title, body: base.body, expires_at: base.expires_at, active: true });
  assert.deepEqual(intent.payload, { active: true }); assert.deepEqual(intent.base, base); assert.equal(intent.id, ID);
  assert.ok(Object.isFrozen(intent.base)); base.title = 'mutated'; assert.equal(intent.base.title.length, 90);
  for (const patch of [{ type: 'announcement' }, { created_by: USER }, { summary: 'replace' }, { id: OTHER }, { active: 1 }, { title: '' }, { body: 'x'.repeat(501) }, {}]) assert.throws(() => m.update(context, dto(), patch));
});

test('matching checks complete expected known row, preserves nullable fields and compares timestamps at full microsecond precision', () => {
  const m = model(), base = dto(), intent = m.update(context, base, { title: '新标题' }), expected = dto({ title: '新标题' });
  assert.equal(m.match(intent, expected), true);
  assert.equal(m.match(intent, { ...expected, created_at: '2026-10-16T01:20:00.654321Z', expires_at: '2026-10-19T17:02:03.123456Z' }), true);
  for (const patch of [{ id: OTHER }, { type: 'announcement' }, { category: null }, { summary: '' }, { created_by: USER }, { created_at: '2026-10-16T09:20:00.654322+08:00' }, { expires_at: '2026-10-20T01:02:03.123455+08:00' }]) assert.equal(m.match(intent, { ...expected, ...patch }), false);
});

test('create is one POST with frozen ID/creator, representation and no upsert or automatic readback', async () => {
  const intent = model().create(context, draft());
  const h = harness({ network(r) { network(r, [{ ...dto({ category: null }), ...r.data }]); } });
  const result = await h.api.notificationManageWrite(intent), r = rest(h)[0]; requestScope(r);
  assert.equal(r.method, 'POST'); assert.deepEqual(r.data, { id: intent.id, ...intent.payload }); assert.equal(r.header.Prefer, 'return=representation'); assert.equal(r.header['x-upsert'], undefined);
  assert.equal(rest(h).length, 1); assert.equal(result.operation, 'create'); assert.equal(model().match(intent, result.row), true); assert.equal(h.restores(), 0);
});

test('update uses a full eleven-field snapshot CAS, raw scalar operands and is.null, preserving unchanged metadata', async () => {
  const base = dto({ title: '旧 "引号" \\ (a,b):x.y &injected=1\n第二行', image_url: null, category: null, summary: null, created_by: null, expires_at: null });
  const intent = model().update(context, base, { body: ' 新正文 ' });
  const h = harness({ network: r => network(r, [{ ...base, ...r.data }]) });
  const result = await h.api.notificationManageWrite(intent), r = rest(h)[0], url = requestScope(r);
  assert.equal(r.method, 'PATCH'); assert.deepEqual(r.data, { body: '新正文' });
  for (const key of fields) assert.equal(url.searchParams.get(key), base[key] === null ? 'is.null' : 'eq.' + base[key], key);
  assert.equal(url.searchParams.has('injected'), false); assert.equal(url.hash, ''); assert.equal(result.row.created_at, base.created_at); assert.equal(result.row.type, base.type);
});

test('delete requires an exact unique old-row representation, returns no assumed absence/success and makes only one REST request', async () => {
  const intent = model().remove(context, dto()), h = harness(); const result = await h.api.notificationManageWrite(intent), r = rest(h)[0], url = requestScope(r);
  assert.equal(r.method, 'DELETE'); assert.equal(r.data, undefined); assert.equal(r.header.Prefer, 'return=representation');
  for (const key of fields) assert.equal(url.searchParams.get(key), intent.base[key] === null ? 'is.null' : 'eq.' + intent.base[key]);
  assert.deepEqual(result, { operation: 'delete', id: ID, deleted: true }); assert.equal(rest(h).length, 1);
});

for (const operation of ['create','update','delete']) test(operation + ' empty/malformed/wrong representation never acknowledges a mutation', async () => {
  const m = model(), intent = operation === 'create' ? m.create(context, draft()) : operation === 'update' ? m.update(context, dto(), { title: '新标题' }) : m.remove(context, dto());
  const expected = operation === 'create' ? { ...dto({ category: null }), ...intent.payload, id: intent.id } : { ...dto(), ...intent.payload };
  for (const response of [[], {}, null, [expected, expected], [{ ...expected, id: OTHER }], [{ ...expected, title: '错正文' }], [{ ...expected, created_by: null }]]) {
    const h = harness({ network: r => network(r, response) }); await assert.rejects(h.api.notificationManageWrite(intent)); assert.equal(rest(h).length, 1);
  }
});

test('list/read reject malformed DTOs, duplicate IDs or over50 results rather than projecting false empty/success', async () => {
  for (const data of [null, {}, [dto({ active: 1 })], [dto(), dto()], Array.from({ length: 51 }, (_, i) => dto({ id: idFor(i) }))]) {
    const h = harness({ network: r => network(r, data) }); await assert.rejects(h.api.notificationManageList());
  }
  for (const data of [[dto({ id: OTHER })], [dto(), dto()], [dto({ title: null })]]) {
    const h = harness({ network: r => network(r, data) }); await assert.rejects(h.api.notificationManageRead(ID));
  }
});
function idFor(n) { return '00000000-0000-4000-8000-' + String(n).padStart(12, '0'); }

test('each data call intersects authority before and after I/O; post-response revocation is never a successful return', async () => {
  for (const operation of ['list','read','write']) {
    let calls = 0; const h = harness({ network(r) { if (r.url.includes('/rpc/')) return r.success({ statusCode: 200, data: ++calls === 1 }); network(r); } });
    const fn = operation === 'list' ? () => h.api.notificationManageList() : operation === 'read' ? () => h.api.notificationManageRead(ID) : () => h.api.notificationManageWrite(model().remove(context, dto()));
    await assert.rejects(fn(), e => e.status === 403); assert.equal(rest(h).length, 1); assert.equal(perms(h).length, 2);
  }
});

for (const kind of ['user','shop','scope','revision']) test(kind + ' change rejects late success/401, never installing a new identity or restarting the request', async () => {
  for (const status of [200,401]) {
    const gate = deferred(); let request; const h = harness({ network(r) { if (r.url.includes('/rpc/')) return network(r); request = r; gate.resolve(); } });
    const work = h.api.notificationManageRead(ID); await gate.promise; h.change(kind); request.success({ statusCode: status, data: status === 200 ? [dto()] : {} });
    await assert.rejects(work, e => e.code === 'stale_operation'); assert.equal(rest(h).length, 1); assert.equal(h.restores(), 0);
  }
});

test('scope change while permission RPC awaits prevents any REST request', async () => {
  const gate = deferred(); let request; const h = harness({ network(r) { request = r; gate.resolve(); } });
  const work = h.api.notificationManageList(); await gate.promise; h.change('revision'); request.success({ statusCode: 200, data: true });
  await assert.rejects(work, e => e.code === 'stale_operation'); assert.equal(rest(h).length, 0);
});

test('missing caller token, invalid/extra arguments and forged intent authority fail closed before REST', async () => {
  const h = harness();
  for (const fn of [() => h.api.notificationManageCapabilities({ userId: OTHER }), () => h.api.notificationManageList({ limit: 500 }), () => h.api.notificationManageRead(ID, { userId: OTHER }), () => h.api.notificationManageRead([ID])]) await assert.rejects(fn());
  const intent = model().create(context, draft());
  for (const patch of [{ userId: OTHER }, { id: [ID] }, { shop_id: ID }, { operation: 'upsert' }, { payload: { ...intent.payload, created_by: OTHER } }, { payload: { ...intent.payload, type: 'backup' } }]) await assert.rejects(h.api.notificationManageWrite({ ...intent, ...patch }));
  assert.equal(rest(h).length, 0);
  const empty = harness(); empty.noToken(); await assert.rejects(empty.api.notificationManageList()); assert.equal(empty.requests.length, 0);
});

test('caller mutations cannot rewrite the frozen intent while initial freshness is pending', async () => {
  const gate = deferred(), intent = structuredClone(model().create(context, draft())), original = structuredClone(intent);
  const h = harness({ fresh: n => n === 1 ? gate.promise : undefined, network: r => network(r, [{ ...dto({ category: null }), ...original.payload, id: original.id }]) });
  const work = h.api.notificationManageWrite(intent); intent.id = OTHER; intent.payload.title = 'late'; gate.resolve();
  const result = await work; assert.equal(result.id, original.id); assert.deepEqual(rest(h)[0].data, { id: original.id, ...original.payload });
});

test('network failure/current401/current403/server500 never trigger a mutation retry or restore', async () => {
  for (const status of [0,401,403,500]) {
    const h = harness({ network(r) { if (r.url.includes('/rpc/')) return network(r); if (!status) r.fail(); else r.success({ statusCode: status, data: { code: 'erp_scope_not_ready', message: 'raw-private' } }); } });
    await assert.rejects(h.api.notificationManageWrite(model().remove(context, dto())), e => { assert.notEqual(e.message, 'raw-private'); if (status === 401) assert.equal(e.requestRevision, 1); return true; });
    assert.equal(rest(h).length, 1); assert.equal(h.restores(), 0);
  }
});

test('fixed transport rejects arbitrary notification paths/queries and never falls back to a public bearer', async () => {
  const h = harness();
  for (const name of ['rest:notifications','rest:notification-manage-upsert','rest:notification-manage-list/../other']) await assert.rejects(h.transport(name, {}));
  for (const body of [{ userId: USER, limit: 500 }, { userId: USER, table: 'other' }, { userId: [USER] }]) await assert.rejects(h.transport('rest:notification-manage-list', body));
  assert.equal(h.requests.length, 0);
  await h.transport('rest:notification-manage-list', context, { public: true, accessToken: 'foreign-token' }); assert.equal(rest(h)[0].header.Authorization, 'Bearer synthetic-caller-token');
});

function afterMicrotasks(depth, action) { if (depth) queueMicrotask(() => afterMicrotasks(depth - 1, action)); else action(); }
function operationIntent(operation) {
  const m = model(); return operation === 'create' ? m.create(context, draft()) : operation === 'update' ? m.update(context, dto(), { title: '新标题' }) : m.remove(context, dto());
}
function operationRow(intent) { return intent.operation === 'create' ? { ...dto({ category: null }), ...intent.payload, id: intent.id } : { ...dto(), ...intent.payload }; }

for (const operation of ['create', 'update', 'delete']) for (const change of ['identity', 'revision']) test(operation + ' never dispatches in the permission-to-REST microtask gap: ' + change, async () => {
  const intent = operationIntent(operation); let h;
  h = harness({ fresh(n) {
    // Real createApi/transport: cross the final permission freshness await, before REST dispatch.
    if (n === 2) afterMicrotasks(4, () => change === 'identity' ? h.changeActorOnly() : h.change('revision'));
  }, network: r => network(r, [operationRow(intent)]) });
  await assert.rejects(h.api.notificationManageWrite(intent), e => e.code === 'stale_operation');
  assert.equal(perms(h).length, 1); assert.equal(rest(h).length, 0); assert.equal(h.restores(), 0);
});

for (const change of ['identity', 'revision']) test('permission RPC cannot start after freshness resolves into a changed context: ' + change, async () => {
  let h; h = harness({ fresh(n) { if (n === 1) afterMicrotasks(3, () => change === 'identity' ? h.changeActorOnly() : h.change('revision')); } });
  await assert.rejects(h.api.notificationManageCapabilities(), e => e.code === 'stale_operation');
  assert.equal(h.requests.length, 0);
});

for (const operation of ['capability', 'list', 'read', 'write']) test(operation + ' cannot return a result after the last gate-to-return microtask change', async () => {
  const intent = operationIntent('update'); let h;
  h = harness({ fresh(n) { if (n === (operation === 'capability' ? 2 : 4)) afterMicrotasks(operation === 'capability' ? 4 : 5, () => h.changeActorOnly()); }, network: r => network(r, [operationRow(intent)]) });
  const work = operation === 'capability' ? h.api.notificationManageCapabilities() : operation === 'list' ? h.api.notificationManageList()
    : operation === 'read' ? h.api.notificationManageRead(ID) : h.api.notificationManageWrite(intent);
  await assert.rejects(work, e => e.code === 'stale_operation');
  assert.equal(rest(h).length, operation === 'capability' ? 0 : 1); assert.equal(h.restores(), 0);
});

for (const operation of ['create', 'update', 'delete']) test(operation + ' unchanged-context control still sends exactly once with original actor', async () => {
  const intent = operationIntent(operation), h = harness({ network: r => network(r, [operationRow(intent)]) });
  const response = await h.api.notificationManageWrite(intent); assert.equal(response.operation, operation);
  assert.equal(rest(h).length, 1); assert.equal(perms(h).length, 2); assert.equal(rest(h)[0].header.Authorization, 'Bearer synthetic-caller-token');
  assert.equal(h.restores(), 0);
});
