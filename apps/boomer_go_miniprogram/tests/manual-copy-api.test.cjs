const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const USER = id(901), SHOP = id(902), ENTRY = id(903), OTHER = id(904);
const context = { userId: USER, shopId: SHOP };
function domain() { return require('../miniprogram/shared/manual-copy'); }
function row(text = '旧文案') { return { id: ENTRY, user_id: USER, shop_id: SHOP, kind: 'copy', output_text: text, meta: { source: 'manual_upload', asset_class: 'upload', candidates: [{ title: '旧标题' }], custom: { keep: true } }, created_at: '2026-10-16T09:20:00.123456+08:00' }; }
function deferred() { let resolve; const promise = new Promise(a => { resolve = a; }); return { promise, resolve }; }
function harness(options = {}) {
  let revision = 1, user = USER, shop = SHOP, token = 'synthetic-caller-token', fresh = 0, restores = 0;
  const requests = [];
  const session = { get: () => ({ userId: user, shop: shop ? { id: shop } : null, scopeVersion: 1 }), token: () => token, revision: () => revision,
    async ensureFresh() { fresh++; if (options.fresh) await options.fresh(fresh); }, async restore() { restores++; } };
  const config = { supabaseUrl: 'https://example.invalid', publicKey: 'synthetic-public' };
  const wx = { request(r) { requests.push(r); if (options.network) options.network(r); else r.success({ statusCode: 200, data: [row()] }); } };
  const transport = createTransport(wx, config, session.token);
  return { api: createApi({ wx, config, session, invoke: transport }), transport, requests, session, fresh: () => fresh, restores: () => restores,
    change(kind) { revision++; if (kind === 'user') user = OTHER; if (kind === 'shop') shop = OTHER; }, noShop() { shop = null; }, noToken() { token = null; } };
}
const fields = 'id,user_id,shop_id,kind,output_text,meta,created_at';
function filters(r) {
  const url = new URL(r.url); assert.equal(url.origin, 'https://example.invalid'); assert.equal(url.pathname, '/rest/v1/marketing_assets');
  assert.equal(url.searchParams.get('select'), fields); assert.equal(url.searchParams.get('id'), 'eq.' + ENTRY);
  assert.equal(url.searchParams.get('user_id'), 'eq.' + USER); assert.equal(url.searchParams.get('shop_id'), 'eq.' + SHOP);
  assert.equal(url.searchParams.get('kind'), 'eq.copy'); assert.equal(url.searchParams.get('meta->>source'), 'eq.manual_upload');
  assert.equal(r.header.Authorization, 'Bearer synthetic-caller-token'); return url;
}

test('plain manual copy keeps its title fallback, JSON candidates preserve all unknown members safely', () => {
  const m = domain(), base = row(); assert.deepEqual(m.candidates(base), [{ title: '旧标题', body: '旧文案' }]);
  const original = JSON.parse('[{"title":"一","body":"正文","hashtags":["#原有"],"first_comment":"首评","extra":{"keep":true},"__proto__":{"polluted":true}},{"title":"二","body":"不改","legacy":99}]');
  const json = row(JSON.stringify(original)), result = m.candidates(json);
  assert.deepEqual(result, original); result[0].extra.keep = false; assert.equal(m.candidates(json)[0].extra.keep, true); assert.equal({}.polluted, undefined);
  const intent = m.updateIntent(context, json, 0, { title: '新标题', body: '新正文' }), changed = JSON.parse(intent.outputText);
  assert.equal(changed[0].title, '新标题'); assert.equal(changed[0].body, '新正文');
  for (const k of ['hashtags','first_comment','extra','__proto__']) assert.deepEqual(changed[0][k], original[0][k]);
  assert.deepEqual(changed[1], original[1]); assert.equal(intent.baseOutputText, json.output_text); assert.equal({}.polluted, undefined);
});

test('create uses a frozen client UUID and JSON candidate payload without photo or AI metadata', () => {
  const m = domain(), intent = m.createIntent(context, { title: ' 标题 ', body: ' 正文 ' });
  assert.match(intent.id, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i); assert.equal(intent.operation, 'create');
  assert.equal(intent.userId, USER); assert.equal(intent.shopId, SHOP); assert.equal(intent.baseOutputText, null);
  assert.deepEqual(JSON.parse(intent.outputText), [{ title: '标题', body: '正文', hashtags: [] }]);
  assert.deepEqual(intent.meta, { source: 'manual_upload', asset_class: 'upload' });
  assert.ok(Object.isFrozen(intent)); assert.ok(Object.isFrozen(intent.meta));
  assert.equal(m.key(context), m.key(context, '')); assert.notEqual(m.key(context, ENTRY), m.key({ ...context, shopId: OTHER }, ENTRY));
});

for (const draft of [{ title: 'x'.repeat(61), body: '正文' }, { title: '', body: 'x'.repeat(1001) }, { title: '', body: '  ' }, { title: {}, body: '正文' }, { title: '', body: '正文', meta: { source: 'generated' } }]) {
  test('draft validation rejects without truncation or a hidden metadata channel: ' + Object.keys(draft).join(',' ) + String(typeof draft.title), () => {
    const m = domain(); assert.throws(() => m.createIntent(context, draft)); assert.throws(() => m.updateIntent(context, row(), 0, draft));
  });
}

test('owner, store, kind/source, candidate index and malformed structured text never become writable', () => {
  const m = domain();
  for (const patch of [{ user_id: OTHER }, { shop_id: OTHER }, { kind: 'photo' }, { meta: { source: 'generated' } }, { id: [ENTRY] }]) {
    assert.throws(() => m.updateIntent(context, { ...row(), ...patch }, 0, { title: '', body: '正文' })); assert.throws(() => m.deleteIntent(context, { ...row(), ...patch }));
  }
  for (const value of [-1, 1, 0.5, '0']) assert.throws(() => m.updateIntent(context, row(), value, { title: '', body: '正文' }));
  for (const value of ['[]', '[1]', '[{"title":"x","body":{}}]', '{"body":"unsupported object"}']) assert.throws(() => m.candidates(row(value)));
});

test('matching proves current bound content only; another owner or missing row never matches', () => {
  const m = domain(), intent = m.updateIntent(context, row(), 0, { title: '标题', body: '正文' });
  assert.equal(m.matches(intent, { ...row(), output_text: intent.outputText }), true);
  for (const bad of [null, { ...row(), output_text: 'different' }, { ...row(), user_id: OTHER }, { ...row(), meta: { source: 'generated' } }]) assert.equal(m.matches(intent, bad), false);
});

test('read has fixed exact owner/shop/manual filters, caller token and pre/post freshness', async () => {
  const h = harness(), data = await h.api.manualCopyRead(ENTRY), request = h.requests[0];
  filters(request); assert.equal(request.method, 'GET'); assert.equal(request.data, undefined); assert.equal(h.fresh(), 2);
  assert.deepEqual(data, row());
});

test('read absence is null, not a fabricated row; forbidden/malformed responses reject', async () => {
  const empty = harness({ network: r => r.success({ statusCode: 200, data: [] }) }); assert.equal(await empty.api.manualCopyRead(ENTRY), null);
  for (const bad of [null, {}, [row(), row()], [{ ...row(), id: OTHER }], [{ ...row(), user_id: OTHER }], [{ ...row(), shop_id: OTHER }], [{ ...row(), meta: { source: 'generated' } }], [{ ...row(), created_at: 'bad' }]]) {
    const h = harness({ network: r => r.success({ statusCode: 200, data: bad }) }); await assert.rejects(h.api.manualCopyRead(ENTRY));
  }
});

test('create is one POST representation with frozen ID, no upsert and only whitelisted fields', async () => {
  const m = domain(), intent = m.createIntent(context, { title: '标题', body: '正文' });
  const h = harness({ network(r) { r.success({ statusCode: 201, data: [{ ...row(), ...r.data }] }); } });
  const response = await h.api.manualCopyWrite(intent), request = h.requests[0]; const url = new URL(request.url);
  assert.equal(request.method, 'POST'); assert.equal(url.pathname, '/rest/v1/marketing_assets'); assert.equal(url.searchParams.get('select'), fields);
  assert.equal(request.header.Prefer, 'return=representation'); assert.equal(request.header['x-upsert'], undefined);
  assert.equal(request.data.id, intent.id); assert.equal(request.data.user_id, USER); assert.equal(request.data.shop_id, SHOP); assert.equal(request.data.kind, 'copy');
  assert.equal(request.data.output_text, intent.outputText); assert.deepEqual(request.data.meta, intent.meta);
  assert.deepEqual(Object.keys(request.data).sort(), ['id','kind','meta','output_text','shop_id','user_id']);
  assert.equal(response.operation, 'create'); assert.equal(response.id, intent.id); assert.equal(m.matches(intent, response.row), true);
  assert.equal(h.requests.length, 1); assert.equal(h.fresh(), 2);
});

test('update writes output_text only with the exact old string predicate and preserves every other field', async () => {
  const base = row('旧 "引号", %20 & 括号( )\n行'), intent = domain().updateIntent(context, base, 0, { title: '标题', body: '正文' });
  const h = harness({ network: r => r.success({ statusCode: 200, data: [{ ...base, output_text: r.data.output_text }] }) });
  const result = await h.api.manualCopyWrite(intent), request = h.requests[0], url = filters(request);
  assert.equal(request.method, 'PATCH'); assert.equal(url.searchParams.get('output_text'), 'eq.' + base.output_text);
  assert.equal(request.header.Prefer, 'return=representation'); assert.deepEqual(request.data, { output_text: intent.outputText }); assert.equal(result.row.meta.custom.keep, true);
});

// Standalone text eq uses pRequestFilter -> pOpExpr pSingleVal (many anyChar),
// not pLogicSingleVal/pQuotedValue. Model only that branch after URI decoding;
// this is not execution of the official Haskell parser or a PostgREST service.
// https://github.com/PostgREST/postgrest/blob/v14.0/src/PostgREST/ApiRequest/QueryParams.hs#L639-L650
const scalarEqCases = [
  ['plain', '旧文案'],
  ['JSON candidates', JSON.stringify([{ title: '旧题', body: '正文', hashtags: ['#保留'], extra: { keep: true } }, { title: '其他候选', body: '不改' }])],
  ['backslashes and quotes', '目录 C:\\素材\\原稿，含"引号"及\\\\双反斜线'],
  ['newlines and tabs', '第一行\n第二行\r\n\t最后一行'],
  ['reserved characters', '(a,b):c.d &injected=1&output_text=eq.foreign ?# / + = %22 * _'],
  ['literal enclosing quotes', '"原文自带双引号"'],
  ['empty non-NULL text', ''],
  ['spaces and unicode', '  中文 😀 𠮷 + %20  '],
];
for (const operation of ['update', 'delete']) for (const [name, text] of scalarEqCases) {
  test(operation + ' scalar eq matches the exact stored text under documented parser semantics: ' + name, async () => {
    const base = row(text), m = domain();
    const intent = operation === 'delete' ? m.deleteIntent(context, base) : m.updateIntent(context, base, 0, { title: '新题', body: '新正文' });
    let matched = false;
    const h = harness({ network(r) {
      const url = filters(r), scalar = url.searchParams.get('output_text');
      assert.ok(scalar.startsWith('eq.')); assert.equal(url.searchParams.getAll('output_text').length, 1);
      assert.equal(url.searchParams.get('meta->>asset_class'), 'eq.upload');
      assert.equal(url.searchParams.has('injected'), false); assert.equal(url.hash, '');
      assert.equal(/[\r\n\t]/.test(r.url), false);
      const operand = scalar.slice(3);
      matched = operand === base.output_text;
      r.success({ statusCode: 200, data: matched ? [{ ...base, ...(operation === 'update' ? { output_text: r.data.output_text } : {}) }] : [] });
    } });
    const result = await h.api.manualCopyWrite(intent);
    assert.equal(matched, true); assert.equal(result.operation, operation); assert.equal(result.id, ENTRY);
    assert.equal(h.requests.length, 1); assert.equal(h.restores(), 0); assert.equal(h.fresh(), 2);
    if (operation === 'delete') assert.equal(result.deleted, true);
    else { assert.equal(m.matches(intent, result.row), true); assert.deepEqual(h.requests[0].data, { output_text: intent.outputText }); }
  });
}

test('nullable base text uses is.null; delete is row-only representation and no automatic readback or storage/job deletion', async () => {
  const base = row(null), intent = domain().deleteIntent(context, base);
  const h = harness({ network: r => r.success({ statusCode: 200, data: [base] }) }); const response = await h.api.manualCopyWrite(intent), r = h.requests[0];
  assert.equal(r.method, 'DELETE'); assert.equal(filters(r).searchParams.get('output_text'), 'is.null');
  assert.equal(r.data, undefined); assert.equal(r.header.Prefer, 'return=representation');
  assert.deepEqual(response, { operation: 'delete', id: ENTRY, deleted: true }); assert.equal(h.requests.length, 1);
});

for (const op of ['create','update','delete']) test(op + ' empty, malformed or wrong representation is not acknowledged', async () => {
  const m = domain(), intent = op === 'create' ? m.createIntent(context, { title: '', body: '正文' }) : op === 'update' ? m.updateIntent(context, row(), 0, { title: '', body: '正文' }) : m.deleteIntent(context, row());
  const expected = { ...row(), id: intent.id, output_text: op === 'delete' ? intent.baseOutputText : intent.outputText, ...(op === 'create' ? { meta: intent.meta } : {}) };
  for (const bad of [[], {}, [expected, expected], [{ ...expected, user_id: OTHER }], [{ ...expected, output_text: 'changed' }]]) {
    const h = harness({ network: r => r.success({ statusCode: 200, data: bad }) }); await assert.rejects(h.api.manualCopyWrite(intent)); assert.equal(h.requests.length, 1);
  }
});

test('scope loss before network makes zero calls; postresponse scope loss cannot acknowledge a mutation', async () => {
  const intent = domain().updateIntent(context, row(), 0, { title: '', body: '正文' });
  for (const count of [1, 2]) {
    const h = harness({ fresh(n) { if (n === count) throw Object.assign(new Error('lease lost'), { status: 403, code: 'erp_scope_not_ready' }); }, network: r => r.success({ statusCode: 200, data: [{ ...row(), output_text: intent.outputText }] }) });
    await assert.rejects(h.api.manualCopyWrite(intent)); assert.equal(h.requests.length, count - 1); assert.equal(h.restores(), 0);
  }
});

for (const kind of ['user','shop','revision']) test(kind + ' change rejects late mutation success and late 401', async () => {
  for (const code of [200,401]) {
    const intent = domain().updateIntent(context, row(), 0, { title: '', body: '正文' }), gate = deferred(); let request;
    const h = harness({ network(r) { request = r; gate.resolve(); } }); const call = h.api.manualCopyWrite(intent); await gate.promise; h.change(kind);
    request.success({ statusCode: code, data: code === 200 ? [{ ...row(), output_text: intent.outputText }] : {} });
    await assert.rejects(call, e => e.code === 'stale_operation'); assert.equal(h.requests.length, 1);
  }
});

test('writes never retry network failures, 401 or pre-handler 403', async () => {
  const intent = domain().deleteIntent(context, row());
  for (const code of [0,401,403]) {
    const h = harness({ network(r) { if (!code) r.fail(); else r.success({ statusCode: code, data: { code: 'erp_scope_not_ready' } }); } });
    await assert.rejects(h.api.manualCopyWrite(intent)); assert.equal(h.requests.length, 1); assert.equal(h.restores(), 0);
  }
});

test('no selected shop/token, wrong intent binding and forged read IDs fail before any external request', async () => {
  const intent = domain().createIntent(context, { title: '', body: '正文' });
  for (const missing of ['noShop','noToken']) { const h = harness(); h[missing](); await assert.rejects(h.api.manualCopyWrite(intent)); await assert.rejects(h.api.manualCopyRead(ENTRY)); assert.equal(h.requests.length, 0); }
  const h = harness();
  for (const patch of [{ userId: OTHER }, { shopId: OTHER }, { id: [ENTRY] }, { operation: 'upsert' }, { url: 'https://foreign.invalid' }, { outputText: 'not-json' }]) await assert.rejects(h.api.manualCopyWrite({ ...intent, ...patch }));
  for (const value of ['', [ENTRY], ENTRY + '&id=other', undefined]) await assert.rejects(h.api.manualCopyRead(value)); assert.equal(h.requests.length, 0);
});

test('fixed transport rejects arbitrary tables, query overrides and non-text mutation payloads', async () => {
  const h = harness(), intent = domain().createIntent(context, { title: '', body: '正文' });
  for (const name of ['rest:manual-copy-upsert','rest:marketing-assets','rest:anything']) await assert.rejects(h.transport(name, intent));
  for (const body of [{ ...intent, select: '*' }, { ...intent, kind: 'photo' }, { ...intent, meta: { source: 'manual_upload', ai_tag_status: 'pending' } }, { ...intent, userId: USER + '&x=1' }]) await assert.rejects(h.transport('rest:manual-copy-create', body));
  assert.equal(h.requests.length, 0);
});

for (const [name, mutate] of [
  ['oversized edited body', x => { x[0].body = 'x'.repeat(1001); }],
  ['empty edited body', x => { x[0].body = ''; }],
  ['changed hashtags', x => { x[0].hashtags = []; }],
  ['lost unknown metadata', x => { delete x[0].legacy; }],
  ['removed other candidate', x => { x.pop(); }],
  ['edited two candidates', x => { x[1].body = 'also replaced'; }]
]) test('runtime update rejects a forged intent with ' + name + ' before network', async () => {
  const base = row(JSON.stringify([{ title: '一', body: '第一条', hashtags: ['保留'], legacy: { keep: true } }, { title: '二', body: '第二条', untouched: true }]));
  const intent = domain().updateIntent(context, base, 0, { title: '新标题', body: '新正文' }), rows = JSON.parse(intent.outputText); mutate(rows);
  const h = harness(); await assert.rejects(h.api.manualCopyWrite({ ...intent, outputText: JSON.stringify(rows) })); assert.equal(h.requests.length, 0);
});

test('a caller cannot replace the frozen create ID/payload while the preflight is awaiting freshness', async () => {
  const gate = deferred(), intent = { ...domain().createIntent(context, { title: '原标题', body: '原正文' }) }, originalId = intent.id;
  const h = harness({ fresh: n => n === 1 ? gate.promise : undefined, network: r => r.success({ statusCode: 201, data: [{ ...row(), ...r.data }] }) });
  const writing = h.api.manualCopyWrite(intent); intent.id = OTHER; intent.outputText = 'changed'; gate.resolve();
  const receipt = await writing; assert.equal(h.requests[0].data.id, originalId); assert.equal(receipt.id, originalId); assert.match(receipt.row.output_text, /原正文/);
});

test('only upload-class manual rows are manageable and match an intent', () => {
  const m = domain(), intent = m.deleteIntent(context, row());
  for (const asset_class of [undefined, null, 'base', 'generated']) {
    const bad = { ...row(), meta: { ...row().meta, asset_class } };
    assert.throws(() => m.ownedRow(context, bad));
    assert.throws(() => m.updateIntent(context, bad, 0, { title: '', body: '正文' }));
    assert.throws(() => m.deleteIntent(context, bad));
    assert.equal(m.matches(intent, bad), false);
  }
});

test('read rejects a wrong-class returned row instead of granting editor access', async () => {
  const bad = { ...row(), meta: { ...row().meta, asset_class: 'base' } };
  const h = harness({ network: r => r.success({ statusCode: 200, data: [bad] }) });
  await assert.rejects(h.api.manualCopyRead(ENTRY));
});

for (const operation of ['read', 'update', 'delete']) test(operation + ' has an exact upload-class filter and treats zero matches as unconfirmed/absent', async () => {
  const h = harness({ network(r) {
    assert.equal(new URL(r.url).searchParams.get('meta->>asset_class'), 'eq.upload');
    r.success({ statusCode: 200, data: [] });
  } });
  if (operation === 'read') assert.equal(await h.api.manualCopyRead(ENTRY), null);
  else {
    const m = domain(), intent = operation === 'delete' ? m.deleteIntent(context, row()) : m.updateIntent(context, row(), 0, { title: '', body: '正文' });
    await assert.rejects(h.api.manualCopyWrite(intent), e => e.code === 'manual_copy_unconfirmed');
  }
  assert.equal(h.requests.length, 1);
});

for (const operation of ['update', 'delete']) test(operation + ' rejects a wrong-class mutation representation', async () => {
  const m = domain(), intent = operation === 'delete' ? m.deleteIntent(context, row()) : m.updateIntent(context, row(), 0, { title: '', body: '正文' });
  const bad = { ...row(), output_text: operation === 'delete' ? intent.baseOutputText : intent.outputText, meta: { source: 'manual_upload', asset_class: 'base' } };
  const h = harness({ network: r => r.success({ statusCode: 200, data: [bad] }) });
  await assert.rejects(h.api.manualCopyWrite(intent)); assert.equal(h.requests.length, 1);
});

test('legacy plain copy clones first metadata candidate but trusts the current body and never promotes metadata alternatives', () => {
  const m = domain(), base = row('最新实际正文');
  base.meta.candidates = JSON.parse('[{"title":"原题","body":"过时正文","hashtags":["#保留"],"first_comment":"首评","extra":{"keep":true},"__proto__":{"polluted":true}},{"title":"仅元数据","body":"不提升为活动候选"}]');
  const result = m.candidates(base);
  assert.deepEqual(result, [{ ...base.meta.candidates[0], body: '最新实际正文' }]);
  result[0].extra.keep = false; assert.equal(base.meta.candidates[0].extra.keep, true);
  assert.equal({}.polluted, undefined);
});

test('legacy update preserves hashtags and unknown first-candidate metadata through real API validation', async () => {
  const m = domain(), base = row('最新实际正文');
  base.meta.candidates = [{ title: '原题', body: '过时正文', hashtags: ['#保留'], first_comment: '首评', extra: { keep: true } }, { title: '仅元数据', body: '原样保留' }];
  const original = JSON.parse(JSON.stringify(base)), intent = m.updateIntent(context, base, 0, { title: '新题', body: '新正文' });
  assert.deepEqual(intent.baseCandidate, { ...base.meta.candidates[0], body: base.output_text });
  assert.ok(Object.isFrozen(intent.baseCandidate)); assert.ok(Object.isFrozen(intent.baseCandidate.extra));
  assert.deepEqual(JSON.parse(intent.outputText), [{ ...base.meta.candidates[0], title: '新题', body: '新正文' }]);
  const h = harness({ network: r => r.success({ statusCode: 200, data: [{ ...base, output_text: r.data.output_text }] }) });
  const result = await h.api.manualCopyWrite(intent);
  assert.deepEqual(h.requests[0].data, { output_text: intent.outputText });
  assert.deepEqual(result.row.meta, original.meta); assert.deepEqual(base, original);
  assert.equal(m.matches(intent, result.row), true);
  const lost = JSON.parse(intent.outputText); delete lost[0].hashtags;
  await assert.rejects(h.api.manualCopyWrite({ ...intent, outputText: JSON.stringify(lost) }));
  assert.equal(h.requests.length, 1);
});

test('a supplied malformed legacy candidate is rejected rather than silently dropping metadata', () => {
  const m = domain();
  for (const candidate of [false, null, [], 'bad', { title: {} }]) {
    const base = row(); base.meta.candidates = [candidate];
    assert.throws(() => m.candidates(base));
    assert.throws(() => m.updateIntent(context, base, 0, { title: '', body: '正文' }));
  }
});
