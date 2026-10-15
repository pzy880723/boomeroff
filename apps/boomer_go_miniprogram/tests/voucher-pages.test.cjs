const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages/voucher');
const model = fs.existsSync(path.join(root, 'model.js')) ? require(path.join(root, 'model.js')) : {};
const SHOP = '10000000-0000-4000-8000-000000000001';
const CLAIM = '20000000-0000-4000-8000-000000000021';
const CODE = 'DEMO1234';
const NOW = '2026-10-16T09:20:00+08:00';
const caps = (extra = {}) => ({ shop_id: SHOP, can_lookup: true, can_manage: false, can_redeem: true, ...extra });
const lookup = (extra = {}) => ({ shop_id: SHOP, claim: { id: CLAIM, code: CODE, status: 'claimed', claimed_at: NOW, expires_at: '2026-10-20T00:00:00+08:00', redeemed_at: null, recipient_name_masked: '顾*', recipient_phone_tail: '1234', recipient_name: 'DO_NOT_RENDER_NAME', recipient_phone: 'DO_NOT_RENDER_PHONE', voucher: { id: '20000000-0000-4000-8000-000000000022', name: '体验券', threshold_type: 'min_spend', discount_amount: 20, min_spend: 100, template_terms: '每单限用一张', starts_at: NOW, ends_at: null, active: true } }, can_redeem: true, reason: null, server_time: NOW, ...extra });
const receipt = (params, extra = {}) => ({ ...params, claim_id: CLAIM, status: 'redeemed', redeemed_at: NOW, redeemed_by_me: true, replay: false, ...extra });
const input = (value) => ({ detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function nativePage(handler, options = {}) {
  assert.ok(fs.existsSync(path.join(root, 'index.js')), 'native voucher page must exist');
  let definition;
  const environment = options.environment || { revision: 1, current: options.current === undefined ? { userId: 'employee-a', shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } : options.current };
  const calls = [], modals = [];
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, showToast() {}, reLaunch(o) { wx.relaunched = o.url; } };
  const session = environment.session || (environment.session = { get: () => environment.current, revision: () => environment.revision, signOut() { environment.current = null; environment.revision++; } });
  const api = { async action(action, params) { calls.push({ action, params: JSON.parse(JSON.stringify(params)) }); return handler(action, params); } };
  const app = environment.app || (environment.app = { session, preview: !!options.preview, ensureSession: async () => !!environment.current });
  app.api = api;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {
    require(id) {
      if (id === '../../shared/page') {
        const shared = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: shared, getApp: () => app, wx });
        return shared.exports;
      }
      return require(path.resolve(root, id));
    },
    Page(spec) { definition = spec; }, getApp: () => app, wx, Date, Math, Object
  }, { filename: path.join(root, 'index.js') });
  const page = Object.assign({}, definition, { data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); } });
  return { page, calls, modals, wx, app, environment, async start() { await page.onLoad({}); await page.onShow(); return page; }, change(kind) { environment.revision++; if (kind === 'shop') environment.current = { ...environment.current, shop: { id: 'other-shop', name: '另一门店' } }; if (kind === 'user') environment.current = { ...environment.current, userId: 'employee-b' }; if (kind === 'scope') environment.current = { ...environment.current, scopeVersion: 2 }; } };
}
async function loaded(handler, options) {
  const h = nativePage(handler || (async action => action === 'voucher-capabilities' ? caps() : lookup()), options);
  await h.start(); h.page.onInput(input(CODE)); await h.page.query(); return h;
}

test('parser accepts only exact approved HTTPS redemption URLs or eight ASCII bare codes without URL API', () => {
  assert.equal(typeof model.parseCode, 'function', 'voucher parser is required');
  for (const value of [' demo1234 ', CODE, 'https://ai.boomeroff.com/me/vouchers/redeem/demo1234', 'https://ai.boomeroff.com:443/me/vouchers/redeem/DEMO1234/']) assert.equal(model.parseCode(value), CODE);
  for (const value of ['', 'ABCDEFG', 'ABCDEFGHI', 'ＤＥＭＯ1234', 'DEMO12\n34', 'http://ai.boomeroff.com/me/vouchers/redeem/DEMO1234', 'https://ai.boomeroff.com:444/me/vouchers/redeem/DEMO1234', 'https://x.ai.boomeroff.com/me/vouchers/redeem/DEMO1234', 'https://ai.boomeroff.com.evil/me/vouchers/redeem/DEMO1234', 'https://a@ai.boomeroff.com/me/vouchers/redeem/DEMO1234', 'https://ai.boomeroff.com/me/vouchers/redeem/DEMO1234?q=1', 'https://ai.boomeroff.com/me/vouchers/redeem/DEMO1234#', 'https://ai.boomeroff.com/x/me/vouchers/redeem/DEMO1234', 'https://ai.boomeroff.com/me/vouchers/redeem/DEMO1234/extra', 'https://ai.boomeroff.com/u/c/DEMO1234', 'https://ai.boomeroff.com/me/vouchers/redeem/%44EMO1234']) assert.equal(model.parseCode(value), '', value);
});

test('capabilities and real lookup DTO render only masked data, separate template terms and missing money', async () => {
  const { page, calls } = await loaded();
  assert.deepEqual(calls.map(c => c.action), ['voucher-capabilities', 'voucher-lookup']);
  assert.equal(page.data.canSubmit, true);
  assert.equal(page.data.lookup.amount, '¥20');
  assert.match(page.data.lookup.rule, /100/);
  assert.equal(page.data.lookup.terms, '每单限用一张');
  assert.equal(page.data.lookup.claimedAt, '10-16 09:20');
  assert.doesNotMatch(JSON.stringify(page.data), /DO_NOT_RENDER/);
  const row = lookup(); row.claim.voucher.discount_amount = null; row.claim.voucher.min_spend = null;
  assert.equal(model.lookupView(row).amount, '金额未提供');
  assert.match(model.lookupView(row).rule, /未提供/);
});

test('lookup/manage without redeem, missing shop, unavailable and preview cannot mutate', async () => {
  for (const mode of ['manage', 'no-lookup', 'preview', 'unavailable']) {
    const h = await loaded(async action => {
      if (action === 'voucher-capabilities') return caps(mode === 'manage' ? { can_redeem: false, can_manage: true } : mode === 'no-lookup' ? { can_lookup: false } : {});
      return lookup(mode === 'unavailable' ? { can_redeem: false, reason: 'voucher_unavailable' } : {});
    }, { preview: mode === 'preview' });
    await h.page.confirmRedeem();
    assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 0, mode);
    assert.equal(h.page.data.canSubmit, false, mode);
  }
});

test('input changes invalidate old claim immediately and discard a late lookup for a different code', async () => {
  const gate = deferred(); let reads = 0;
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : ++reads === 1 ? lookup() : gate.promise);
  h.page.onInput(input('ABCD1234'));
  assert.equal(h.page.data.lookup, null); assert.equal(h.page.data.canSubmit, false);
  const querying = h.page.query(); h.page.onInput(input('EFGH1234'));
  gate.resolve(lookup({ claim: { ...lookup().claim, code: 'ABCD1234' } })); await querying;
  assert.equal(h.page.data.lookup, null); assert.equal(h.page.data.codeInput, 'EFGH1234');
});

test('query singleflight retains previous card as unconfirmed on failure, never sample fallback', async () => {
  const gate = deferred(); let reads = 0;
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : ++reads === 1 ? lookup() : gate.promise);
  const query = h.page.query(); await h.page.query();
  assert.equal(reads, 2); assert.equal(h.page.data.canSubmit, false);
  gate.reject(new Error('网络连接失败')); await query;
  assert.equal(h.page.data.lookup.code, CODE); assert.equal(h.page.data.lookupVerified, false);
  assert.match(h.page.data.error, /网络/); assert.equal(h.page.data.canSubmit, false);
});

test('scan only queries and hidden picker completion waits until same-identity onShow exactly once', async () => {
  const h = nativePage(async action => action === 'voucher-capabilities' ? caps() : lookup()); await h.start();
  let scanner; h.wx.scanCode = o => { scanner = o; };
  const scan = h.page.scan(); h.page.onHide(); scanner.success({ result: 'https://ai.boomeroff.com/me/vouchers/redeem/demo1234' }); await scan;
  assert.equal(h.calls.length, 1, 'hidden scanner must not call any business action');
  await h.page.onShow(); await h.page.onShow();
  assert.equal(h.calls.filter(c => c.action === 'voucher-lookup').length, 1);
  assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 0);
});

test('scanner cancellation preserves draft; changed revision or unload discards picked voucher', async () => {
  for (const mode of ['cancel', 'revision', 'shop', 'user', 'unload']) {
    const h = nativePage(async action => action === 'voucher-capabilities' ? caps() : lookup()); await h.start();
    h.page.onInput(input('DRAFT')); let scanner; h.wx.scanCode = o => { scanner = o; };
    const scanning = h.page.scan(); h.page.onHide();
    if (mode === 'unload') h.page.onUnload(); else if (mode !== 'cancel') h.change(mode);
    if (mode === 'cancel') scanner.fail({ errMsg: 'scanCode:fail cancel' }); else scanner.success({ result: CODE });
    await scanning; if (mode !== 'unload') await h.page.onShow();
    assert.equal(h.calls.filter(c => c.action === 'voucher-lookup').length, 0, mode);
    if (mode === 'cancel') assert.equal(h.page.data.codeInput, 'DRAFT');
    else assert.equal(h.page.data.lookup, null);
  }
});

test('confirmation callback revalidates visibility, identity revision, current code and page lifetime', async () => {
  for (const mode of ['hide', 'revision', 'shop', 'user', 'edit', 'unload', 'cancel']) {
    const h = await loaded(undefined, { manualModal: true });
    const confirming = h.page.confirmRedeem(); assert.equal(h.modals.length, 1);
    if (mode === 'hide') h.page.onHide(); else if (mode === 'unload') h.page.onUnload(); else if (mode === 'edit') h.page.onInput(input('ABCD1234')); else if (mode !== 'cancel') h.change(mode);
    h.modals[0].success({ confirm: mode !== 'cancel' }); await confirming;
    assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 0, mode);
  }
});

test('confirmed redemption is singleflight and displays success only after exact server receipt then readback', async () => {
  const gate = deferred(); let reads = 0;
  const h = await loaded(async (action, params) => {
    if (action === 'voucher-capabilities') return caps();
    if (action === 'voucher-redeem') return gate.promise;
    reads++; return lookup(reads > 1 ? { claim: { ...lookup().claim, status: 'redeemed', redeemed_at: NOW }, can_redeem: false } : {});
  });
  const sending = h.page.confirmRedeem(); await h.page.confirmRedeem();
  await new Promise(resolve => setImmediate(resolve));
  const writes = h.calls.filter(c => c.action === 'voucher-redeem'); assert.equal(writes.length, 1);
  assert.match(writes[0].params.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(h.page.data.receipt, null); gate.resolve(receipt(writes[0].params)); await sending;
  assert.equal(h.page.data.receipt.code, CODE); assert.equal(h.page.data.lookup.status, '已核销');
  assert.equal(reads, 2); assert.equal(h.page.data.canSubmit, false);
  assert.doesNotMatch(JSON.stringify(h.page.data), /request_id/);
});

test('receipt mismatches never become success and retain an unknown result for status-only reconciliation', async () => {
  for (const extra of [{ request_id: 'wrong' }, { shop_id: 'wrong' }, { claim_id: 'wrong' }, { code: 'ABCD1234' }, { status: 'claimed' }, { redeemed_by_me: false }, { redeemed_at: null }, { redeemed_at: 'yesterday' }]) {
    const h = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? receipt(params, extra) : lookup());
    await h.page.confirmRedeem(); assert.equal(h.page.data.receipt, null); assert.equal(h.page.data.pending, true);
    assert.match(h.page.data.notice, /待|未确认/);
  }
});

test('unknown outcome keeps frozen UUID; status not_found is not failure and only explicit confirmed retry uses same payload', async () => {
  let writes = 0;
  const h = await loaded(async (action, params) => {
    if (action === 'voucher-capabilities') return caps();
    if (action === 'voucher-redeem') { if (++writes === 1) throw new Error('响应超时'); return receipt(params); }
    if (action === 'voucher-redeem-status') return { state: 'not_found' };
    return lookup();
  });
  await h.page.confirmRedeem(); const first = h.calls.find(c => c.action === 'voucher-redeem').params;
  assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receipt, null);
  await h.page.onShow(); await h.page.query(); await h.page.confirmRedeem(); assert.equal(writes, 1);
  await h.page.checkStatus(); assert.equal(writes, 1); assert.equal(h.page.data.canRetrySame, true);
  assert.match(h.page.data.notice, /不能.*失败|不代表.*失败/);
  await h.page.retrySame(); assert.equal(writes, 2);
  assert.deepEqual(h.calls.filter(c => c.action === 'voucher-redeem')[1].params, first);
  assert.equal(h.page.data.receipt.code, CODE);
});

test('status succeeded requires matching original receipt and does not send another write', async () => {
  const h = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(new Error('超时')) : action === 'voucher-redeem-status' ? { state: 'succeeded', ...receipt(params) } : lookup());
  await h.page.confirmRedeem(); await h.page.checkStatus();
  assert.equal(h.page.data.receipt.code, CODE);
  assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 1);
});

test('a confirmed receipt survives failed detail readback and retry never creates another redemption', async () => {
  let reads = 0;
  const h = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? receipt(params) : ++reads === 1 ? lookup() : Promise.reject(new Error('回读断网')));
  await h.page.confirmRedeem(); assert.equal(h.page.data.receipt.code, CODE);
  assert.match(h.page.data.detailError, /回读/); assert.match(h.page.data.notice, /回执已确认/);
  await h.page.retryReadback(); await h.page.confirmRedeem();
  assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 1);
});

test('already redeemed by another operation is never inferred to be this request success', async () => {
  const h = await loaded(async (action) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(Object.assign(new Error('已核销'), { status: 409, code: 'already_redeemed' })) : lookup());
  await h.page.confirmRedeem(); assert.equal(h.page.data.receipt, null); assert.equal(h.page.data.canSubmit, false);
  await h.page.confirmRedeem(); assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 1);
});

test('lookup rejects mismatched shop/code, malformed DTO and invalid server timestamp without enabling writes', async () => {
  for (const bad of [lookup({ shop_id: 'wrong' }), lookup({ claim: { ...lookup().claim, code: 'ABCD1234' } }), lookup({ claim: null }), lookup({ server_time: 'invalid' })]) {
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : bad);
    assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.lookup, null); assert.ok(h.page.data.error);
  }
});

test('401/403 clear private drafts and results; current 401 uses shared login cleanup', async () => {
  for (const status of [401, 403]) {
    let reads = 0;
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : ++reads === 1 ? lookup() : Promise.reject(Object.assign(new Error('权限已失效'), { status })));
    await h.page.query(); assert.equal(h.page.data.lookup, null); assert.equal(h.page.data.codeInput, ''); assert.equal(h.page.data.receipt, null);
    if (status === 401) assert.equal(h.wx.relaunched, '/pages/login/index');
  }
});

test('scope or revision changes clear draft, receipt and late responses even for same-user relogin', async () => {
  for (const kind of ['user', 'shop', 'scope', 'revision']) {
    const gate = deferred(); let reads = 0;
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : ++reads === 1 ? lookup() : gate.promise);
    const query = h.page.query(); h.change(kind); gate.resolve(lookup()); await query;
    assert.equal(h.page.data.lookup, null); assert.equal(h.page.data.codeInput, '', kind);
    assert.equal(h.page.data.pending, false); assert.equal(h.page.data.receipt, null);
  }
});

test('hidden redemption completion cannot paint success or auto-resend on show', async () => {
  const gate = deferred();
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? gate.promise : lookup());
  const sending = h.page.confirmRedeem(); await new Promise(resolve => setImmediate(resolve));
  const payload = h.calls.find(c => c.action === 'voucher-redeem').params;
  h.page.onHide(); gate.resolve(receipt(payload)); await sending; await h.page.onShow();
  assert.equal(h.page.data.receipt, null); assert.equal(h.page.data.pending, true);
  assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 1);
});

test('native voucher files use compiler-safe expressions, no URL navigation and 44px controls', () => {
  for (const file of ['index.js', 'index.wxml', 'index.wxss', 'index.json', 'model.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'index.js'), 'utf8') + fs.readFileSync(path.join(root, 'model.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8');
  assert.doesNotMatch(xml, /&amp;&amp;|\.includes\(|recipient_phone\}\}|recipient_name\}\}|<web-view/);
  assert.doesNotMatch(js, /new URL\(|navigateTo\(|redirectTo\(|api\.invoke\(|voucher_claims|setStorage/);
  assert.match(xml, /bindtap="scan"/); assert.match(xml, /bindtap="checkStatus"/); assert.match(xml, /bindtap="retrySame"/);
  assert.match(css, /min-height:\s*(88|9[0-9])rpx/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).navigationBarTitleText, '券核销');
});

test('a denied capability can be explicitly reloaded without trusting stale lookup authority', async () => {
  let allowed = false, checks = 0;
  const h = nativePage(async action => { assert.equal(action, 'voucher-capabilities'); checks++; return caps({ can_lookup: allowed, can_redeem: allowed }); });
  await h.start(); assert.equal(h.page.data.canLookup, false);
  allowed = true; await h.page.refresh();
  assert.equal(checks, 2); assert.equal(h.page.data.canLookup, true); assert.equal(h.page.data.canSubmit, false);
  assert.match(fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'), /bindtap="load"[^>]*>重新核验查券权限/);
});

test('readback cannot confirm a different redemption timestamp even for the same claim and code', async () => {
  let reads = 0;
  const h = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? receipt(params) : ++reads === 1 ? lookup() : lookup({ claim: { ...lookup().claim, status: 'redeemed', redeemed_at: '2026-10-16T09:21:00+08:00' }, can_redeem: false }));
  await h.page.confirmRedeem();
  assert.equal(h.page.data.receipt.code, CODE);
  assert.match(h.page.data.detailError, /一致|匹配/);
  assert.equal(h.page.data.lookupVerified, false);
  assert.match(h.page.data.notice, /回执已确认/);
});

test('server timestamps reject impossible calendar dates instead of normalizing them into receipt success', () => {
  assert.equal(model.timestamp('2026-02-30T09:20:00+08:00'), false);
  assert.equal(model.timestamp('2024-02-29T09:20:00+08:00'), true);
  assert.equal(model.time(null), '未提供');
});

test('missing verified shop does not request capabilities or permit scan, lookup or write', async () => {
  const h = nativePage(async () => { throw new Error('must not reach backend'); }, { current: { userId: 'employee-a', shop: null } });
  await h.start(); h.page.onInput(input(CODE)); await h.page.scan(); await h.page.query(); await h.page.confirmRedeem();
  assert.equal(h.calls.length, 0); assert.match(h.page.data.error, /门店/);
  assert.equal(h.page.data.canLookup, false); assert.equal(h.page.data.canSubmit, false);
});

test('scan returning after onShow queries once; cancelling a scan never silently enables an unconfirmed old card', async () => {
  for (const cancel of [false, true]) {
    const h = await loaded(); let scanner; h.wx.scanCode = o => { scanner = o; };
    const scanning = h.page.scan(); h.page.onHide(); await h.page.onShow();
    assert.equal(h.calls.filter(c => c.action === 'voucher-lookup').length, 1);
    if (cancel) scanner.fail({ errMsg: 'scanCode:fail cancel' }); else scanner.success({ result: CODE });
    await scanning;
    assert.equal(h.calls.filter(c => c.action === 'voucher-lookup').length, cancel ? 1 : 2);
    if (cancel) assert.equal(h.page.data.canSubmit, false);
  }
});

test('uncertain operations freeze input and keep the original receipt identity across status failures', async () => {
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(new Error('超时')) : action === 'voucher-redeem-status' ? Promise.reject(new Error('状态服务断网')) : lookup());
  await h.page.confirmRedeem(); const frozen = h.calls.find(c => c.action === 'voucher-redeem').params;
  h.page.onInput(input('ABCD1234')); await h.page.checkStatus();
  assert.equal(h.page.data.codeInput, CODE); assert.equal(h.page.data.receipt, null); assert.equal(h.page.data.pending, true);
  assert.equal(h.page.data.canRetrySame, false);
  assert.deepEqual(h.calls.find(c => c.action === 'voucher-redeem-status').params, frozen);
});

test('status reads are singleflight and neither mismatched nor late status replies confirm a redemption', async () => {
  for (const mode of ['mismatch', 'hide', 'revision', 'unload']) {
    const gate = deferred();
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(new Error('超时')) : action === 'voucher-redeem-status' ? gate.promise : lookup());
    await h.page.confirmRedeem(); const payload = h.calls.find(c => c.action === 'voucher-redeem').params;
    const checking = h.page.checkStatus(); await h.page.checkStatus();
    assert.equal(h.calls.filter(c => c.action === 'voucher-redeem-status').length, 1);
    if (mode === 'hide') h.page.onHide(); if (mode === 'revision') h.change(mode); if (mode === 'unload') h.page.onUnload();
    gate.resolve({ state: 'succeeded', ...receipt(payload, mode === 'mismatch' ? { claim_id: 'other' } : {}) }); await checking;
    assert.equal(h.page.data.receipt, null, mode);
    assert.equal(h.page.data.canRetrySame, false, mode);
  }
});

test('a conflicting request ID is never reused for another mutation after a not_found status', async () => {
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(Object.assign(new Error('请求冲突'), { status: 409, code: 'request_id_conflict' })) : action === 'voucher-redeem-status' ? { state: 'not_found' } : lookup());
  await h.page.confirmRedeem(); await h.page.checkStatus(); await h.page.retrySame();
  assert.equal(h.page.data.canRetrySame, false); assert.equal(h.calls.filter(c => c.action === 'voucher-redeem').length, 1);
});

test('capability failure has a real retry and does not pretend that permissions were loaded', async () => {
  let fail = true;
  const h = nativePage(async () => { if (fail) throw new Error('权限服务断网'); return caps(); });
  await h.start(); assert.equal(h.page.data.capsLoaded, false); assert.match(h.page.data.error, /断网/);
  fail = false; await h.page.refresh(); assert.equal(h.page.data.capsLoaded, true); assert.equal(h.page.data.error, '');
});

test('reloading capabilities immediately disables old lookup authority even when the permission service fails', async () => {
  const gate = deferred(); let checks = 0;
  const h = await loaded(async action => action === 'voucher-capabilities' ? ++checks === 1 ? caps() : gate.promise : lookup());
  const refreshing = h.page.load();
  assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.lookupVerified, false);
  h.page.onInput(input('ABCD1234'));
  gate.reject(new Error('权限核验断网')); await refreshing;
  assert.equal(h.page.data.loading, false); assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.canLookup, false);
  assert.equal(h.page.data.lookup.code, CODE);
});

test('the real main-owned preview adapter supplies read-only example DTOs without page-local fixtures or mutations', async () => {
  const { createPreview } = require('../miniprogram/shared/preview');
  const preview = createPreview({});
  const h = nativePage((action, params) => preview.api.action(action, params), { preview: true, current: preview.session.get() });
  await h.start(); h.page.onInput(input('demo1234')); await h.page.query(); await h.page.confirmRedeem(); await h.page.retrySame();
  assert.match(h.page.data.shopName, /示例/); assert.match(h.page.data.lookup.title, /示例/);
  assert.equal(h.page.data.lookup.amount, '¥20'); assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.preview, true);
  assert.deepEqual(h.calls.map(c => c.action), ['voucher-capabilities', 'voucher-lookup']);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), /DEMO1234|中古好物体验券/);
});

async function uncertain() {
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(new Error('响应超时')) : lookup());
  await h.page.confirmRedeem();
  return h;
}

test('unload and reentry recover only pending intent after fresh capabilities, never create a new UUID or send automatically', async () => {
  const first = await uncertain(); const original = first.calls.find(c => c.action === 'voucher-redeem').params;
  first.page.onUnload(); const gate = deferred();
  const second = nativePage(async action => action === 'voucher-capabilities' ? gate.promise : { state: 'not_found' }, { environment: first.environment });
  const entering = second.start();
  assert.equal(second.page.data.codeInput, ''); assert.equal(second.page.data.pending, false);
  second.page.onInput(input(CODE)); await second.page.query(); await second.page.confirmRedeem();
  gate.resolve(caps()); await entering;
  assert.equal(second.page.data.pending, true); assert.equal(second.page.data.codeInput, CODE);
  assert.equal(second.page.data.lookup, null); assert.equal(second.page.data.receipt, null); assert.equal(second.page.data.canSubmit, false);
  await second.page.query(); await second.page.confirmRedeem();
  assert.deepEqual(second.calls.map(c => c.action), ['voucher-capabilities']);
  await second.page.checkStatus();
  assert.deepEqual(second.calls[1], { action: 'voucher-redeem-status', params: original });
});

test('403 status clears private UI but preserves RAM intent for same-identity reauthorization and explicit status confirmation', async () => {
  const first = await uncertain(); const original = first.calls.find(c => c.action === 'voucher-redeem').params;
  first.page.api.action = async () => { throw Object.assign(new Error('门店无权限'), { status: 403 }); };
  await first.page.checkStatus();
  assert.equal(first.page.data.pending, false); assert.equal(first.page.data.codeInput, ''); assert.equal(first.page.data.lookup, null);
  first.page.onUnload();
  const second = nativePage(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem-status' ? { state: 'succeeded', ...receipt(params) } : lookup({ claim: { ...lookup().claim, status: 'redeemed', redeemed_at: NOW }, can_redeem: false }), { environment: first.environment });
  await second.start(); assert.equal(second.page.data.pending, true); assert.equal(second.page.data.receipt, null);
  assert.deepEqual(second.calls.map(c => c.action), ['voucher-capabilities']);
  await second.page.checkStatus();
  assert.deepEqual(second.calls[1].params, original); assert.equal(second.page.data.receipt.code, CODE);
  assert.equal(Object.keys(second.app._voucherPending).length, 0);
});

test('RAM unresolved intents are invisible to another user or shop and recover only in their original identity/shop', async () => {
  for (const kind of ['user', 'shop']) {
    const first = await uncertain(); const originalUser = structuredClone(first.environment.current); first.page.onUnload(); first.change(kind);
    const other = nativePage(async action => action === 'voucher-capabilities' ? caps({ shop_id: first.environment.current.shop.id }) : lookup(), { environment: first.environment });
    await other.start();
    assert.equal(other.page.data.pending, false, kind); assert.equal(other.page.data.codeInput, '', kind);
    assert.equal(other.page.data.receipt, null); assert.equal(other.page.data.lookup, null);
    other.page.onUnload(); first.environment.current = originalUser; first.change('revision');
    const returning = nativePage(async action => { assert.equal(action, 'voucher-capabilities'); return caps(); }, { environment: first.environment });
    await returning.start(); assert.equal(returning.page.data.pending, true); assert.equal(returning.page.data.codeInput, CODE);
  }
});

test('same-user login revision clears old UI first and only a new successful capabilities result restores minimal pending state', async () => {
  const first = await uncertain(); const gate = deferred(); let allow = false;
  first.page.api.action = async action => { assert.equal(action, 'voucher-capabilities'); return gate.promise; };
  first.change('revision'); const reopening = first.page.onShow();
  assert.equal(first.page.data.pending, false); assert.equal(first.page.data.codeInput, ''); assert.equal(first.page.data.lookup, null);
  await first.page.checkStatus(); await first.page.confirmRedeem();
  gate.resolve(caps({ can_lookup: false, can_redeem: false })); await reopening;
  assert.equal(first.page.data.pending, false); assert.equal(first.page.data.codeInput, '');
  first.page.api.action = async action => { assert.equal(action, 'voucher-capabilities'); allow = true; return caps(); };
  await first.page.refresh(); assert.equal(allow, true); assert.equal(first.page.data.pending, true); assert.equal(first.page.data.lookup, null); assert.equal(first.page.data.receipt, null);
});

test('RAM contains only minimal reconciliation fields, no recipient/template/receipt, and isolated test Apps share nothing', async () => {
  const h = await uncertain(); h.page.onUnload();
  assert.ok(h.app._voucherPending, 'application RAM must hold unresolved intent');
  const rows = Object.values(h.app._voucherPending); assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['claimId', 'code', 'request_id', 'retryBlocked', 'unknown']);
  assert.equal(rows[0].claimId, CLAIM); assert.equal(rows[0].code, CODE);
  assert.doesNotMatch(JSON.stringify(h.app._voucherPending), /recipient|discount|template|receipt|scope|DO_NOT_RENDER|体验券/);
  const unrelated = nativePage(async () => caps()); await unrelated.start();
  assert.equal(unrelated.page.data.pending, false); assert.equal(unrelated.page.data.codeInput, '');
  assert.notEqual(unrelated.app, h.app);
});

test('exact confirmed receipt clears RAM even if readback fails; reentry never restores the old page receipt', async () => {
  let reads = 0;
  const first = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? receipt(params) : ++reads === 1 ? lookup() : Promise.reject(new Error('详情回读断网')));
  await first.page.confirmRedeem(); assert.equal(first.page.data.receipt.code, CODE); assert.ok(first.page.data.detailError);
  assert.equal(Object.keys(first.app._voucherPending || {}).length, 0);
  first.page.onUnload();
  const second = nativePage(async action => action === 'voucher-capabilities' ? caps() : lookup({ claim: { ...lookup().claim, status: 'redeemed', redeemed_at: NOW }, can_redeem: false }), { environment: first.environment });
  await second.start(); assert.equal(second.page.data.pending, false); assert.equal(second.page.data.receipt, null);
  second.page.onInput(input(CODE)); await second.page.query();
  assert.equal(second.page.data.lookup.status, '已核销'); assert.equal(second.page.data.receipt, null); assert.equal(second.page.data.canSubmit, false);
});

test('old unloaded write receipts cannot paint the new page or clear its unresolved RAM; status must be explicitly requested', async () => {
  const gate = deferred();
  const first = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? gate.promise : lookup());
  const sending = first.page.confirmRedeem(); await new Promise(resolve => setImmediate(resolve));
  const original = first.calls.find(c => c.action === 'voucher-redeem').params;
  first.page.onUnload();
  const second = nativePage(async action => { assert.equal(action, 'voucher-capabilities'); return caps(); }, { environment: first.environment });
  await second.start(); gate.resolve(receipt(original)); await sending;
  assert.equal(second.page.data.pending, true); assert.equal(second.page.data.receipt, null);
  assert.equal(Object.keys(second.app._voucherPending).length, 1);
  assert.deepEqual(second.calls.map(c => c.action), ['voucher-capabilities']);
});

test('another page discovering an unresolved request before or during confirmation cannot replace its UUID', async () => {
  for (const duringModal of [false, true]) {
    const first = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(new Error('超时')) : lookup());
    const second = await loaded(undefined, { environment: first.environment, manualModal: duringModal });
    let confirming;
    if (duringModal) { confirming = second.page.confirmRedeem(); assert.equal(second.modals.length, 1); }
    await first.page.confirmRedeem(); const original = first.calls.find(c => c.action === 'voucher-redeem').params;
    if (duringModal) { second.modals[0].success({ confirm: true }); await confirming; } else await second.page.confirmRedeem();
    assert.equal(second.calls.filter(c => c.action === 'voucher-redeem').length, 0);
    assert.equal(second.page.data.pending, true);
    assert.equal(Object.values(second.app._voucherPending)[0].request_id, original.request_id);
  }
});

test('actual Round13 manage-only no_redeem_permission reason has an explicit Chinese explanation', async () => {
  const h = await loaded(async action => action === 'voucher-capabilities' ? caps({ can_manage: true, can_redeem: false }) : lookup({ can_redeem: false, reason: 'no_redeem_permission' }));
  assert.equal(h.page.data.canLookup, true); assert.equal(h.page.data.canSubmit, false);
  assert.equal(h.page.data.lookup.reason, '当前账号没有核销权限');
});

test('401 and same-user login keep RAM intent hidden until a new capabilities response is authorized', async () => {
  const first = await uncertain(); const originalUser = structuredClone(first.environment.current);
  first.page.api.action = async () => { throw Object.assign(new Error('登录过期'), { status: 401 }); };
  await first.page.checkStatus(); assert.equal(first.wx.relaunched, '/pages/login/index'); assert.equal(first.environment.current, null);
  assert.equal(first.page.data.codeInput, ''); assert.equal(Object.keys(first.app._voucherPending).length, 1);
  first.page.onUnload();
  const gate = deferred();
  const second = nativePage(async action => { assert.equal(action, 'voucher-capabilities'); return gate.promise; }, { environment: first.environment });
  await second.start(); assert.equal(second.calls.length, 0); assert.equal(second.page.data.pending, false);
  first.environment.current = originalUser; first.change('revision'); const loggingIn = second.page.onShow();
  assert.equal(second.page.data.pending, false); assert.equal(second.page.data.codeInput, '');
  await second.page.checkStatus(); assert.equal(second.calls.length, 1);
  gate.resolve(caps()); await loggingIn; assert.equal(second.page.data.pending, true); assert.equal(second.page.data.receipt, null);
  assert.deepEqual(second.calls.map(c => c.action), ['voucher-capabilities']);
});

test('request_id_conflict remains non-retryable after page reentry and an empty personal status result', async () => {
  const first = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(Object.assign(new Error('请求冲突'), { status: 409, code: 'request_id_conflict' })) : lookup());
  await first.page.confirmRedeem(); first.page.onUnload();
  const second = nativePage(async action => action === 'voucher-capabilities' ? caps() : { state: 'not_found' }, { environment: first.environment });
  await second.start(); assert.equal(second.page.data.pending, true);
  await second.page.checkStatus(); await second.page.retrySame();
  assert.equal(second.page.data.canRetrySame, false);
  assert.deepEqual(second.calls.map(c => c.action), ['voucher-capabilities', 'voucher-redeem-status']);
});

const trustedAborts = [[400, 'invalid_params'], [404, 'not_found'], [409, 'already_redeemed'], [409, 'void'], [409, 'not_claimed'], [409, 'voucher_unavailable'], [410, 'expired']];
const abortError = ([status, code]) => Object.assign(new Error('服务器明确中止此次请求'), { status, code });

test('only exact trusted status/code pairs identify a definitive transaction abort', () => {
  assert.equal(typeof model.transactionAborted, 'function');
  for (const pair of trustedAborts) assert.equal(model.transactionAborted(abortError(pair)), true);
  for (const pair of [[400, 'expired'], [404, 'invalid_params'], [409, 'expired'], [410, 'already_redeemed'], [409, 'request_id_conflict'], [500, 'not_found'], ['400', 'invalid_params'], [undefined, 'expired'], [410, undefined]]) assert.equal(model.transactionAborted(abortError(pair)), false);
});

test('a first definitive abort frees its RAM slot and invalidates old lookup before the next coupon, including page reentry', async () => {
  const NEXT = 'NEXT1234', NEXT_CLAIM = '20000000-0000-4000-8000-000000000099';
  for (const pair of trustedAborts) {
    for (const reenter of [false, true]) {
      let writes = 0;
      const handler = async (action, params) => {
        if (action === 'voucher-capabilities') return caps();
        if (action === 'voucher-redeem') { if (++writes === 1) throw abortError(pair); return receipt(params, { claim_id: NEXT_CLAIM }); }
        const row = lookup(); row.claim.code = params.code; if (params.code === NEXT) row.claim.id = NEXT_CLAIM;
        if (writes > 1) { row.claim.status = 'redeemed'; row.claim.redeemed_at = NOW; row.can_redeem = false; }
        return row;
      };
      const first = await loaded(handler); await first.page.confirmRedeem();
      const original = first.calls.find(c => c.action === 'voucher-redeem').params;
      assert.equal(first.page.data.pending, false, pair.join('/') + ' reenter=' + reenter);
      assert.equal(first.page.data.lookupVerified, false); assert.equal(first.page.data.canSubmit, false); assert.equal(first.page.data.canRetrySame, false);
      assert.equal(first.page.data.receipt, null); assert.equal(Object.keys(first.app._voucherPending).length, 0);
      await first.page.confirmRedeem(); assert.equal(writes, 1, 'old lookup authority cannot be reused');
      let next = first;
      if (reenter) { first.page.onUnload(); next = nativePage(handler, { environment: first.environment }); await next.start(); assert.equal(next.page.data.pending, false); }
      next.page.onInput(input(NEXT)); assert.equal(next.page.data.lookup, null); await next.page.query(); await next.page.confirmRedeem();
      assert.equal(writes, 2); const second = next.calls.filter(c => c.action === 'voucher-redeem').at(-1).params;
      assert.equal(second.code, NEXT); assert.notEqual(second.request_id, original.request_id);
      assert.equal(next.page.data.receipt.code, NEXT);
    }
  }
});

test('a timeout followed by explicit same-key retry and a trusted abort cannot release an uncertain intent', async () => {
  for (const pair of trustedAborts) {
    let writes = 0;
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(++writes === 1 ? new Error('网络超时') : abortError(pair)) : action === 'voucher-redeem-status' ? { state: 'not_found' } : lookup());
    await h.page.confirmRedeem(); const original = h.calls.find(c => c.action === 'voucher-redeem').params;
    await h.page.checkStatus(); await h.page.retrySame();
    assert.equal(h.page.data.pending, true, pair.join('/')); assert.equal(h.page.data.receipt, null);
    const record = Object.values(h.app._voucherPending)[0]; assert.equal(record.request_id, original.request_id); assert.equal(record.unknown, true);
    assert.deepEqual(h.calls.filter(c => c.action === 'voucher-redeem')[1].params, original);
    await h.page.checkStatus(); assert.equal(Object.keys(h.app._voucherPending).length, 1, 'status not_found cannot release an intent');
  }
});

test('a RAM-restored in-flight intent is conservative even if its first result was never received and retry explicitly aborts', async () => {
  const gate = deferred();
  const first = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? gate.promise : lookup());
  const sending = first.page.confirmRedeem(); await new Promise(resolve => setImmediate(resolve));
  const original = first.calls.find(c => c.action === 'voucher-redeem').params; first.page.onUnload();
  const second = nativePage(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem-status' ? { state: 'not_found' } : Promise.reject(abortError([410, 'expired'])), { environment: first.environment });
  await second.start(); await second.page.checkStatus(); await second.page.retrySame();
  gate.reject(new Error('旧页面未取得结果')); await sending;
  assert.equal(second.page.data.pending, true); assert.equal(second.page.data.receipt, null);
  const record = Object.values(second.app._voucherPending)[0]; assert.equal(record.request_id, original.request_id); assert.equal(record.unknown, true);
});

test('a mismatched successful response followed by an abort retains RAM because the original mutation was uncertain', async () => {
  let writes = 0;
  const h = await loaded(async (action, params) => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? ++writes === 1 ? receipt(params, { code: 'WRONG123' }) : Promise.reject(abortError([404, 'not_found'])) : action === 'voucher-redeem-status' ? { state: 'not_found' } : lookup());
  await h.page.confirmRedeem(); await h.page.checkStatus(); await h.page.retrySame();
  assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receipt, null); assert.equal(Object.values(h.app._voucherPending)[0].unknown, true);
});

test('untrusted error status/code combinations never release RAM or permit input of a new coupon', async () => {
  for (const pair of [[400, 'expired'], [404, 'invalid_params'], [409, 'expired'], [410, 'already_redeemed'], [500, 'not_found'], ['400', 'invalid_params'], [undefined, 'expired'], [410, undefined]]) {
    const h = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? Promise.reject(abortError(pair)) : lookup());
    await h.page.confirmRedeem(); h.page.onInput(input('NEXT1234'));
    assert.equal(h.page.data.pending, true); assert.equal(h.page.data.codeInput, CODE); assert.equal(Object.keys(h.app._voucherPending).length, 1);
    assert.equal(Object.values(h.app._voucherPending)[0].unknown, true);
  }
});

test('another page restoring an intent marks shared uncertainty before the original page later receives an abort', async () => {
  const gate = deferred();
  const first = await loaded(async action => action === 'voucher-capabilities' ? caps() : action === 'voucher-redeem' ? gate.promise : lookup());
  const sending = first.page.confirmRedeem(); await new Promise(resolve => setImmediate(resolve));
  const original = first.calls.find(c => c.action === 'voucher-redeem').params;
  const second = nativePage(async () => caps(), { environment: first.environment }); await second.start();
  assert.equal(second.page.data.pending, true); gate.reject(abortError([400, 'invalid_params'])); await sending;
  assert.equal(first.page.data.pending, true); assert.equal(Object.values(first.app._voucherPending)[0].request_id, original.request_id);
  assert.equal(Object.values(first.app._voucherPending)[0].unknown, true);
});
