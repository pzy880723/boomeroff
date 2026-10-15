const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages/application');
const model = fs.existsSync(path.join(root, 'model.js')) ? require(path.join(root, 'model.js')) : {};
const APP = '00000000-0000-4000-8000-000000000032', ACT = '00000000-0000-4000-8000-000000000031', SHOP = 'shop-a', USER = '00000000-0000-4000-8000-000000000011';
const V1 = '1'.repeat(64), V2 = '2'.repeat(64), NOW = '2026-10-16T09:20:00+08:00';
const QUERY = { id: APP, activityId: ACT };
const PATH = 'publish/' + APP + '/original.jpg';
const ABORT_PAIRS = [[400, 'invalid_params'], [404, 'not_found'], [409, 'version_conflict'], [422, 'screenshot_not_allowed'], [422, 'note_too_long'], [422, 'invalid_url'], [422, 'evidence_invalid'], [422, 'evidence_not_included'], [409, 'evidence_not_verified'], [409, 'evidence_consumed'], [409, 'object_changed'], [410, 'intent_expired']];
const caps = extra => ({ shop_id: SHOP, can_manage: true, can_confirm_publish: true, can_upload_evidence: false, ...extra });
const detail = extra => ({ shop_id: SHOP, application: { id: APP, activity_id: ACT, status: 'approved', created_at: NOW, reviewed_at: null, applicant_name_masked: '顾*', applicant_phone_tail: '1234', applicant_name: 'RAW_PRIVATE_NAME', applicant_phone: '13887654321', profile: { name: 'RAW_PROFILE' }, form_data: { unknown: 'RAW_UNKNOWN', __profile_check: 'RAW_CHECK' }, voucher_claim_id: null,
  publish: { confirmed: false, confirmed_at: null, confirmed_by: null, note: '原备注', url: 'https://example.test/post', screenshots: [{ path: PATH, signed_url: null, error: 'sign_failed' }] },
  answers: [{ key: 'story', label: '说明', type: 'textarea', role: null, value: '已分享商品故事', image: null }, { key: 'phone', label: '电话', type: 'phone', role: null, value: '13887654321', image: null }, { key: '__profile_check', label: '检查', type: 'text', role: null, value: 'RAW_CHECK', image: null }, { key: 'unknown', label: '未知', type: 'text', role: null, value: 'RAW_UNKNOWN', image: null }] },
  activity: { id: ACT, name: '门店内容共创', platform: '小红书', form_fields: [{ key: 'story', label: '说明', type: 'textarea' }, { key: 'phone', label: '电话', type: 'phone' }] }, version: V1, server_time: NOW, ...extra });
const receipt = (p, extra) => ({ request_id: p.request_id, shop_id: p.shop_id, activity_id: p.activity_id, application_id: p.application_id, target_confirmed: p.target_confirmed, confirmed_at: p.target_confirmed ? NOW : null, confirmed_by: p.target_confirmed ? USER : null, version: V2, replay: false, ...extra });
const readback = p => { const d = detail({ version: V2 }); d.application.publish = { confirmed: p.target_confirmed, confirmed_at: p.target_confirmed ? NOW : null, confirmed_by: p.target_confirmed ? USER : null, note: p.note, url: p.url, screenshots: p.screenshots.map(path => ({ path, signed_url: null, error: 'sign_failed' })) }; return d; };
const ev = value => ({ detail: { value } });
const event = index => ({ currentTarget: { dataset: { index } } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness(handler, options = {}) {
  assert.ok(fs.existsSync(path.join(root, 'index.js')), 'native application page must exist');
  const env = options.environment || { revision: 1, current: options.current === undefined ? { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } : options.current };
  const calls = [], modals = [], previews = [], copies = [];
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, previewImage(o) { previews.push(o); if (o.success) o.success(); }, reLaunch(o) { wx.login = o.url; } };
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  app.api = { async action(action, params) { calls.push({ action, params: JSON.parse(JSON.stringify(params)) }); return handler(action, params); }, async copy(value) { copies.push(value); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {
    require(id) {
      if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
      if (id === './uploads') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'uploads.js'), 'utf8'), { module: m, require: id => require(path.resolve(root, id)), getApp: () => app, wx }); return m.exports; }
      return require(path.resolve(root, id));
    }, Page(value) { spec = value; }, wx, getApp: () => app, Date, Math, Object
  });
  const page = { ...spec, data: structuredClone(spec.data), setData(values) { Object.assign(this.data, values); } };
  return { page, calls, modals, previews, copies, wx, app, env, async start(query = QUERY) { await page.onLoad(query); await page.onShow(); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: 'other-user' }; if (kind === 'shop') env.current = { ...env.current, shop: { id: 'other-shop' } }; if (kind === 'scope') env.current = { ...env.current, scopeVersion: 9 }; } };
}
async function loaded(handler, options) { const h = harness(handler || (async a => a === 'activity-capabilities' ? caps() : detail()), options); await h.start(); return h; }

test('both UUIDs and a verified shop are required before any application API request', async () => {
  for (const query of [{}, { id: APP }, { activityId: ACT }, { ...QUERY, id: 'bad' }, { ...QUERY, activityId: 'bad' }]) {
    const h = harness(async () => { throw Error('no request'); }); await h.start(query); await h.page.refresh();
    assert.equal(h.calls.length, 0); assert.equal(h.page.data.canSubmit, false); assert.ok(h.page.data.error);
  }
  const h = harness(async () => { throw Error('no request'); }, { current: { userId: USER, shop: null } }); await h.start(); assert.equal(h.calls.length, 0);
});

test('fresh management capabilities precede detail and deny ordinary or malformed permissions without reading applicants', async () => {
  for (const response of [caps({ can_manage: false }), caps({ shop_id: 'wrong' }), { shop_id: SHOP, can_manage: 'true' }]) {
    const h = await loaded(async () => response);
    assert.deepEqual(h.calls.map(c => c.action), ['activity-capabilities']); assert.equal(h.page.data.view, null); assert.equal(h.page.data.canSubmit, false);
  }
  const h = await loaded(async a => a === 'activity-capabilities' ? caps({ can_confirm_publish: false }) : detail());
  assert.equal(h.page.data.view.title, '门店内容共创'); assert.equal(h.page.data.canSubmit, false);
});

test('actual detail shape is strictly joined and projected without raw names, phones, profiles or unknown answers', async () => {
  const h = await loaded();
  assert.deepEqual(h.calls.map(c => c.action), ['activity-capabilities', 'application-detail']);
  assert.equal(h.page.data.note, '原备注'); assert.equal(h.page.data.canSubmit, true);
  assert.equal(h.page.data.view.answers.length, 2); assert.equal(h.page.data.view.answers[1].value, '***4321');
  assert.doesNotMatch(JSON.stringify(h.page.data), /RAW_|13887654321|form_data|__profile_check|request_id|expected_version/);
  assert.equal(h.page.data.images.length, 1); assert.equal(h.page.data.images[0].available, false);
});

test('wrong shop, application/activity joins, server time or version never enable an editor', async () => {
  const bad = [detail({ shop_id: 'other' }), detail({ version: '123' }), detail({ server_time: 'bad' }), detail({ activity: { ...detail().activity, id: APP } }), detail({ application: { ...detail().application, id: ACT } }), detail({ application: { ...detail().application, activity_id: APP } })];
  for (const row of bad) { const h = await loaded(async a => a === 'activity-capabilities' ? caps() : row); assert.equal(h.page.data.view, null); assert.equal(h.page.data.canSubmit, false); assert.ok(h.page.data.error); }
});

test('failed or disallowed signatures retain original members, removal is explicit, and more than nine paths are not truncated', async () => {
  const d = detail(); d.application.publish.screenshots = Array.from({ length: 11 }, (_, i) => ({ path: PATH + i, signed_url: null, error: i % 2 ? 'path_not_allowed' : 'sign_failed' }));
  const h = await loaded(async a => a === 'activity-capabilities' ? caps() : d);
  assert.equal(h.page.data.images.length, 11); h.page.removeEvidence(event(1)); assert.equal(h.page.data.images.length, 10);
  const draft = model.normalizeDraft({ note: ' x ', url: ' ', paths: [PATH] }, [PATH]);
  assert.deepEqual(draft, { note: 'x', url: null, screenshots: [PATH] });
  assert.throws(() => model.normalizeDraft({ note: 'x'.repeat(201), url: '', paths: [] }, []));
  assert.throws(() => model.normalizeDraft({ note: '', url: 'https://' + 'x'.repeat(493), paths: [] }, []));
  assert.throws(() => model.normalizeDraft({ note: '', url: 'javascript:alert(1)', paths: [] }, []));
  assert.throws(() => model.normalizeDraft({ note: '', url: '', paths: ['foreign/path'] }, [PATH]));
});

test('note/url length failures do not mutate and the current draft is retained', async () => {
  const h = await loaded(); h.page.onNote(ev('x'.repeat(201))); await h.page.confirmPublish();
  assert.equal(h.page.data.note.length, 201); assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 0); assert.ok(h.page.data.error);
});

test('true and false targets send only whitelisted intent and show success only after matching receipt plus six-field readback', async () => {
  for (const target of [true, false]) {
    let frozen;
    const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? (frozen = JSON.parse(JSON.stringify(p)), receipt(p)) : frozen ? readback(frozen) : detail());
    h.page.onNote(ev(' 修改备注 ')); h.page.onUrl(ev(' ')); h.page.removeEvidence(event(0));
    await h.page.confirmTarget(target);
    assert.equal(frozen.target_confirmed, target); assert.equal(frozen.expected_version, V1);
    assert.deepEqual(Object.keys(frozen).sort(), ['activity_id', 'application_id', 'expected_version', 'note', 'request_id', 'screenshots', 'shop_id', 'target_confirmed', 'url']);
    assert.equal(frozen.activity_id, ACT);
    assert.equal(frozen.note, '修改备注'); assert.equal(frozen.url, null); assert.deepEqual(frozen.screenshots, []);
    assert.equal(h.page.data.saved, true); assert.ok(h.page.data.receipt); assert.equal(h.page.data.canSubmit, false);
    assert.equal(Object.keys(h.app._applicationPending).length, 0);
    assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 1);
  }
});

test('confirmation cancellation and changes while the modal is open produce zero mutations', async () => {
  for (const mode of ['cancel', 'edit', 'hide', 'unload', 'revision', 'user', 'shop']) {
    const h = await loaded(undefined, { manualModal: true }); const pending = h.page.confirmPublish(); assert.equal(h.modals.length, 1);
    if (mode === 'edit') h.page.onNote(ev('后改')); else if (mode === 'hide') h.page.onHide(); else if (mode === 'unload') h.page.onUnload(); else if (mode !== 'cancel') h.change(mode);
    h.modals[0].success({ confirm: mode !== 'cancel' }); await pending;
    assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 0, mode);
  }
});

test('send singleflight and exact receipt validation never infer third-party confirmation as this operation success', async () => {
  const changes = [{ request_id: 'bad' }, { shop_id: 'bad' }, { activity_id: APP }, { application_id: ACT }, { target_confirmed: false }, { confirmed_by: 'other' }, { confirmed_at: null }, { version: 'bad' }, { replay: 'true' }];
  for (const change of changes) {
    const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? receipt(p, change) : detail());
    await h.page.confirmPublish(); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receipt, null); assert.equal(h.page.data.pending, true);
  }
  const gate = deferred(); const h = await loaded(async a => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? gate.promise : detail());
  const sending = h.page.confirmPublish(); await h.page.confirmPublish(); await new Promise(r => setImmediate(r));
  const writes = h.calls.filter(c => c.action === 'publication-confirm'); assert.equal(writes.length, 1); gate.resolve(receipt(writes[0].params)); await sending;
});

test('cancellation receipts require null server actor and time, not a caller-supplied timestamp', async () => {
  for (const extra of [{ confirmed_by: USER }, { confirmed_at: NOW }]) {
    const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? receipt(p, extra) : detail());
    await h.page.confirmTarget(false); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receipt, null);
  }
});

test('every six-field/version mismatch leaves a confirmed receipt but an unfinished editor, never another write', async () => {
  for (const change of ['version', 'confirmed', 'confirmed_at', 'confirmed_by', 'note', 'url', 'screenshots', 'network']) {
    let frozen;
    const h = await loaded(async (a, p) => {
      if (a === 'activity-capabilities') return caps();
      if (a === 'publication-confirm') { frozen = p; return receipt(p); }
      if (!frozen) return detail();
      if (change === 'network') throw Error('回读断网');
      const d = readback(frozen); if (change === 'version') d.version = V1;
      else d.application.publish[change] = change === 'screenshots' ? [] : change === 'confirmed' ? false : 'different';
      return d;
    });
    await h.page.confirmPublish(); assert.ok(h.page.data.receipt, change); assert.equal(h.page.data.saved, false); assert.ok(h.page.data.readbackError, change);
    await h.page.confirmPublish(); await h.page.refresh(); assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 1);
  }
});

test('signature refresh preserves dirty drafts, changed CAS requires explicit reload and never silently adopts the latest version', async () => {
  let latest = false;
  const h = await loaded(async a => a === 'activity-capabilities' ? caps() : detail({ version: latest ? V2 : V1 }));
  h.page.onNote(ev('未保存备注')); h.page.onUrl(ev('https://example.test/draft')); h.page.removeEvidence(event(0));
  h.page.onHide(); assert.equal(h.page.data.view, null); await h.page.onShow();
  assert.equal(h.page.data.note, '未保存备注'); assert.equal(h.page.data.url, 'https://example.test/draft'); assert.equal(h.page.data.images.length, 0);
  latest = true; await h.page.refresh(); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSubmit, false);
  assert.equal(h.page.data.note, '未保存备注'); await h.page.confirmPublish(); assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 0);
  await h.page.reloadLatest(); assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.note, '原备注'); assert.equal(h.page.data.images.length, 1);
});

test('image preview is native, validates signed source binding, and explicit link copy never navigates', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  for (const source of ['good', 'foreign', 'path', 'error']) {
    const d = detail(); const url = supabaseUrl + '/storage/v1/object/sign/voucher-screenshots/' + PATH + '?token=a.b.c';
    d.application.publish.screenshots[0] = { path: PATH, signed_url: source === 'foreign' ? url.replace(supabaseUrl, 'https://evil.test') : source === 'path' ? url.replace('original.jpg', 'other.jpg') : url, error: source === 'error' ? 'path_not_allowed' : null };
    const h = await loaded(async a => a === 'activity-capabilities' ? caps() : d); h.page.onNote(ev('保留草稿'));
    await h.page.previewEvidence(event(0)); assert.equal(h.previews.length, source === 'good' ? 1 : 0, source); assert.equal(h.page.data.note, '保留草稿');
    await h.page.copyUrl(); assert.deepEqual(h.copies, ['https://example.test/post']);
  }
});

async function unknown(options) { const h = await loaded(async a => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? Promise.reject(Error('响应超时')) : detail(), options); h.page.onNote(ev('冻结草稿')); await h.page.confirmPublish(); return h; }

test('unknown payload is frozen in App RAM and reentry needs fresh caps AND detail before exposing it or allowing explicit status', async () => {
  const first = await unknown(); const frozen = first.calls.find(c => c.action === 'publication-confirm').params; first.page.onUnload();
  const gate = deferred(); const second = harness(async a => a === 'activity-capabilities' ? caps() : a === 'application-detail' ? gate.promise : { state: 'not_found' }, { environment: first.env });
  const starting = second.start(); await new Promise(r => setImmediate(r));
  assert.equal(second.page.data.note, ''); assert.equal(second.page.data.pending, false); await second.page.reconcile();
  assert.equal(second.calls.filter(c => c.action === 'publication-confirm-status').length, 0);
  gate.resolve(detail()); await starting; assert.equal(second.page.data.pending, true); assert.equal(second.page.data.note, '冻结草稿');
  assert.equal(second.page.data.receipt, null); assert.equal(second.page.data.canSubmit, false);
  await second.page.reconcile(); assert.equal(second.page.data.pending, true); assert.match(second.page.data.notice, /不代表|不能/);
  assert.equal(frozen.activity_id, ACT);
  assert.deepEqual(second.calls.at(-1).params, { shop_id: SHOP, activity_id: ACT, application_id: APP, request_id: frozen.request_id });
  const ram = JSON.stringify(first.app._applicationPending); assert.doesNotMatch(ram, /RAW_|13887654321|form_data|answers|signed_url|receipt/);
});

test('status not_found only enables a second explicit same-key modal; retry sends the identical full frozen payload', async () => {
  let writes = 0, frozen;
  const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? (++writes === 1 ? Promise.reject(Error('超时')) : (frozen = p, receipt(p))) : a === 'publication-confirm-status' ? { state: 'not_found' } : frozen ? readback(frozen) : detail());
  await h.page.confirmPublish(); const original = h.calls.find(c => c.action === 'publication-confirm').params;
  h.page.onNote(ev('不能改冻结稿')); await h.page.reconcile(); assert.equal(writes, 1);
  await h.page.retrySame(); assert.equal(writes, 2); assert.deepEqual(h.calls.filter(c => c.action === 'publication-confirm')[1].params, original); assert.equal(h.page.data.saved, true);
});

test('status succeeded validates original request and returns a receipt only for the same application/user operation', async () => {
  for (const mismatch of [false, true]) {
    let original;
    const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? (original = p, Promise.reject(Error('超时'))) : a === 'publication-confirm-status' ? { state: 'succeeded', ...receipt(original, mismatch ? { application_id: ACT } : {}) } : original ? readback(original) : detail());
    await h.page.confirmPublish(); await h.page.reconcile(); assert.equal(!!h.page.data.receipt, !mismatch); assert.equal(h.page.data.saved, !mismatch);
  }
});

test('403 keeps the RAM intent but hides private UI; reauthorization cannot turn a restored abort into a free new key', async () => {
  const h = await unknown(); h.page.api.action = async () => { throw Object.assign(Error('无权'), { status: 403 }); }; await h.page.reconcile();
  assert.equal(h.page.data.view, null); assert.equal(h.page.data.note, ''); assert.equal(Object.keys(h.app._applicationPending).length, 1);
  h.page.onUnload(); const next = harness(async a => a === 'activity-capabilities' ? caps() : a === 'application-detail' ? detail() : a === 'publication-confirm-status' ? { state: 'not_found' } : Promise.reject(Object.assign(Error('拒绝'), { status: 409, code: 'version_conflict' })), { environment: h.env });
  await next.start(); await next.page.reconcile(); await next.page.retrySame(); assert.equal(next.page.data.pending, true); assert.equal(Object.keys(h.app._applicationPending).length, 1);
});

test('late reads and 401 cannot render after boundaries or log out a changed session', async () => {
  for (const kind of ['user', 'shop', 'revision', 'scope', 'hide', 'unload']) {
    const gate = deferred(); const h = harness(async a => a === 'activity-capabilities' ? caps() : gate.promise);
    const starting = h.start(); await new Promise(r => setImmediate(r));
    if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
    gate.reject(Object.assign(Error('旧401'), { status: 401 })); await starting;
    assert.equal(h.page.data.view, null); assert.ok(h.env.current); assert.equal(h.wx.login, undefined, kind);
  }
});

test('App pending payload is invisible to other users, shops and applications', async () => {
  for (const kind of ['user', 'shop', 'application']) {
    const first = await unknown(); first.page.onUnload();
    if (kind !== 'application') first.change(kind);
    const nextId = kind === 'application' ? '00000000-0000-4000-8000-000000000033' : APP;
    const shop = first.env.current.shop.id;
    const next = harness(async a => { if (a === 'activity-capabilities') return caps({ shop_id: shop }); const d = detail({ shop_id: shop }); d.application.id = nextId; return d; }, { environment: first.env });
    await next.start({ id: nextId, activityId: ACT }); assert.equal(next.page.data.pending, false, kind); assert.equal(next.page.data.note, '原备注');
    assert.equal(Object.keys(first.app._applicationPending).length, 1);
  }
});

test('current 401 clears private draft and uses shared login navigation', async () => {
  let reject = false;
  const h = await loaded(async a => { if (reject) throw Object.assign(Error('当前401'), { status: 401 }); return a === 'activity-capabilities' ? caps() : detail(); });
  h.page.onNote(ev('隐私草稿')); reject = true; await h.page.refresh();
  assert.equal(h.page.data.view, null); assert.equal(h.page.data.note, ''); assert.equal(h.wx.login, '/pages/login/index');
});

test('real shared preview DTO renders masked evidence errors but all true/false/retry paths remain read-only', async () => {
  const { createPreview } = require('../miniprogram/shared/preview'); const p = createPreview({});
  const h = await loaded((a, params) => p.api.action(a, params), { preview: true, current: p.session.get() });
  assert.match(h.page.data.view.title, /示例/); assert.equal(h.page.data.images.length, 1); assert.equal(h.page.data.images[0].available, false);
  await h.page.confirmPublish(); await h.page.confirmTarget(false); await h.page.retrySame();
  assert.equal(h.calls.filter(c => c.action === 'publication-confirm').length, 0); assert.equal(h.page.data.canSubmit, false);
});

test('native application files are compiler-safe and do not add disk storage, direct RPC, H5, transport or approval side effects', () => {
  for (const f of ['index.js', 'model.js', 'index.wxml', 'index.wxss', 'index.json']) assert.ok(fs.existsSync(path.join(root, f)), f);
  const js = ['index.js', 'model.js', 'uploads.js', 'upload-model.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  assert.doesNotMatch(js, /setStorage|writeFile|api\.invoke|activity-review|voucher-redeem|uploadFile|navigateTo\(|new URL\(/);
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); assert.doesNotMatch(xml, /&amp;&amp;|\.includes\(|<web-view/); assert.match(xml, /bindtap="reconcile"/); assert.match(xml, /bindtap="reloadLatest"/);
});

test('an old image-preview callback cannot open evidence after a new identity has independently loaded the page', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  const d = detail(); d.application.publish.screenshots[0] = { path: PATH, signed_url: supabaseUrl + '/storage/v1/object/sign/voucher-screenshots/' + PATH + '?token=a.b.c', error: null };
  const gate = deferred(); let reads = 0;
  const h = await loaded(async a => a === 'activity-capabilities' ? caps() : ++reads === 2 ? gate.promise : d);
  const viewing = h.page.previewEvidence(event(0)); await new Promise(r => setImmediate(r));
  h.change('user'); await h.page.onShow(); gate.resolve(d); await viewing;
  assert.equal(h.previews.length, 0);
});

test('native draft controls visibly disable while authority refresh is in progress', () => {
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8');
  assert.match(xml, /<input[^>]+disabled="\{\{[^}]*loading/);
  assert.match(xml, /<textarea[^>]+disabled="\{\{[^}]*loading/);
  assert.match(xml, /class="remove-button"[^>]+disabled="\{\{[^}]*loading/);
});

test('conflicting request remains blocked after RAM recovery and only source-verified exact abort pairs qualify', async () => {
  const h = await loaded(async a => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? Promise.reject(Object.assign(Error('冲突'), { status: 409, code: 'request_id_conflict' })) : detail());
  await h.page.confirmPublish(); h.page.onUnload();
  const next = harness(async a => a === 'activity-capabilities' ? caps() : a === 'application-detail' ? detail() : { state: 'not_found' }, { environment: h.env });
  await next.start(); await next.page.reconcile(); await next.page.retrySame();
  assert.equal(next.page.data.canRetrySame, false); assert.equal(next.calls.filter(c => c.action === 'publication-confirm').length, 0);
  for (const [status, code] of ABORT_PAIRS) {
    assert.equal(model.transactionAborted({ status, code }), true, '0015/0016 source-verified first publication-abort pair');
    for (const wrong of [400, 404, 409, 410, 422, 401, 403, 500, String(status)]) if (wrong !== status) assert.equal(model.transactionAborted({ status: wrong, code }), false);
    assert.equal(model.transactionAborted({ status, code: code.toUpperCase() }), false);
  }
  for (const error of [null, {}, Error('timeout'), { state: 'not_found' }, { status: 400, code: 'shop_required' }, { status: 409, code: 'request_id_conflict' }, { status: 500, code: 'db_error' }, { status: 500, code: 'internal' }]) assert.equal(model.transactionAborted(error), false);
});

test('late mutation receipts after hidden/unloaded or changed identity boundaries cannot clear RAM or paint success', async () => {
  for (const kind of ['hide', 'unload', 'revision', 'user', 'shop', 'scope']) {
    const gate = deferred(); const h = await loaded(async a => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? gate.promise : detail());
    const sending = h.page.confirmPublish(); await new Promise(r => setImmediate(r)); const p = h.calls.find(c => c.action === 'publication-confirm').params;
    if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
    gate.resolve(receipt(p)); await sending;
    assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receipt, null); assert.equal(Object.keys(h.app._applicationPending).length, 1, kind);
  }
});

test('a confirmed operation clears RAM despite failed readback, and reentry never calls it this page success', async () => {
  let frozen;
  const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? (frozen = p, receipt(p)) : frozen ? Promise.reject(Error('回读失败')) : detail());
  await h.page.confirmPublish(); assert.ok(h.page.data.receipt); assert.equal(Object.keys(h.app._applicationPending).length, 0); h.page.onUnload();
  const next = harness(async a => a === 'activity-capabilities' ? caps() : readback(frozen), { environment: h.env }); await next.start();
  assert.equal(next.page.data.view.confirmed, true); assert.equal(next.page.data.receipt, null); assert.equal(next.page.data.saved, false);
});

test('publish URL validation is deterministic without global URL and requires a valid HTTP(S) authority', () => {
  for (const url of ['https://example.com', 'http://localhost:8080/a?q=1#post', 'https://example.test/中文', 'https://user:pw@example.test:443/a', 'http://127.0.0.1/a', 'https://[::1]:8443/a']) {
    assert.equal(model.normalizeDraft({ note: '', url, paths: [] }, []).url, url);
  }
  for (const url of ['https://', 'http:// ', 'https:///post', 'https://?q=x', 'http://example.test:abc', 'https://example.test:65536/a', 'https://bad..test/a', 'https://[not-ip]/a', 'https://example.test/a\nb', 'https://999.999.999.999/a', 'https://example.test\\evil']) assert.throws(() => model.normalizeDraft({ note: '', url, paths: [] }, []), url);
});

test('same-project signatures for another application or wrong activity category remain unavailable without dropping paths', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  const foreign = 'publish/00000000-0000-4000-8000-000000000099/other.jpg';
  const d = detail(); d.application.publish.screenshots[0] = { path: foreign, signed_url: supabaseUrl + '/storage/v1/object/sign/voucher-screenshots/' + foreign + '?token=a.b.c', error: null };
  d.activity.form_fields.push({ key: 'image', label: '主页截图', type: 'image', role: 'profile_screenshot' });
  d.application.answers.push({ key: 'image', label: '主页截图', type: 'image', role: 'profile_screenshot', value: null, image: { path: PATH, signed_url: supabaseUrl + '/storage/v1/object/sign/voucher-screenshots/' + PATH + '?token=a.b.c', error: null } });
  const h = await loaded(async a => a === 'activity-capabilities' ? caps() : d);
  assert.equal(h.page.data.images[0].available, false); assert.equal(h.page.data.view.answers.at(-1).image.available, false);
  await h.page.previewEvidence(event(0)); assert.equal(h.previews.length, 0); assert.equal(h.page.data.images.length, 1);
  const parsed = model.parseDetail(d, QUERY, SHOP); assert.deepEqual(parsed.publish.screenshots, [foreign]);
});

test('Round15 normalized note and URL limits count Unicode code points, not UTF16 units', () => {
  assert.equal(model.normalizeDraft({ note: '  ' + '😀'.repeat(200) + '  ', url: '', paths: [] }, []).note, '😀'.repeat(200));
  assert.throws(() => model.normalizeDraft({ note: '😀'.repeat(201), url: '', paths: [] }, []));
  const base = 'https://example.test/';
  const boundary = base + '😀'.repeat(500 - Array.from(base).length);
  assert.equal(model.normalizeDraft({ note: '', url: ' ' + boundary + ' ', paths: [] }, []).url, boundary);
  assert.throws(() => model.normalizeDraft({ note: '', url: boundary + '😀', paths: [] }, []));
});

test('UUID and version validation rejects non-string values instead of regex coercion', async () => {
  const route = harness(async a => a === 'activity-capabilities' ? caps() : detail()); await route.start({ id: [APP], activityId: ACT }); assert.equal(route.calls.length, 0);
  assert.throws(() => model.parseDetail(detail({ version: [V1] }), QUERY, SHOP));
  const p = { request_id: APP, shop_id: SHOP, activity_id: ACT, application_id: APP, target_confirmed: true };
  assert.equal(model.receiptValid(receipt(p, { version: [V2] }), p, ACT, USER), false);
});

test('receipt requires the payload activity UUID to match both the captured activity and server receipt', () => {
  const p = { request_id: APP, shop_id: SHOP, activity_id: ACT, application_id: APP, target_confirmed: true };
  assert.equal(model.receiptValid(receipt(p), p, ACT, USER), true);
  assert.equal(model.receiptValid(receipt(p), { ...p, activity_id: APP }, ACT, USER), false);
  const missing = { ...p }; delete missing.activity_id;
  assert.equal(model.receiptValid(receipt(p), missing, ACT, USER), false);
});

test('RAM with missing or inconsistent activity binding stays hidden and never sends status or retry', async () => {
  for (const mode of ['missing', 'payload', 'record']) {
    const first = await unknown(); first.page.onUnload();
    const key = Object.keys(first.app._applicationPending)[0], previous = first.app._applicationPending[key];
    const payload = { ...previous.payload };
    if (mode === 'missing') delete payload.activity_id;
    if (mode === 'payload') payload.activity_id = APP;
    first.app._applicationPending[key] = { ...previous, activityId: mode === 'record' ? APP : ACT, payload };
    const next = harness(async a => a === 'activity-capabilities' ? caps() : detail(), { environment: first.env });
    await next.start(); await next.page.reconcile(); await next.page.retrySame();
    assert.equal(next.page.data.note, '', mode); assert.equal(next.page.data.view, null); assert.equal(next.page.data.canSubmit, false);
    assert.match(next.page.data.error, /活动|匹配/);
    assert.deepEqual(next.calls.map(c => c.action), ['activity-capabilities', 'application-detail']);
    assert.equal(Object.keys(next.app._applicationPending).length, 1);
  }
});

test('new intent deduplicates screenshot members in first-seen order before freezing and sending', async () => {
  const other = PATH + '.second'; let frozen;
  const d = detail(); d.application.publish.screenshots = [PATH, other, PATH, other].map(path => ({ path, signed_url: null, error: 'sign_failed' }));
  const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? (frozen = p, receipt(p)) : frozen ? readback({ ...frozen, screenshots: [PATH, other] }) : d);
  await h.page.confirmPublish();
  assert.deepEqual(h.calls.find(c => c.action === 'publication-confirm').params.screenshots, [PATH, other]);
  assert.equal(h.page.data.saved, true);
});

test('readback compares ordered-deduplicated paths without mutating historical payload or server members', () => {
  const other = PATH + '.second';
  const payload = { request_id: APP, shop_id: SHOP, activity_id: ACT, application_id: APP, target_confirmed: true, note: null, url: null, screenshots: Object.freeze([PATH, other, PATH]) };
  const server = model.parseDetail(readback({ ...payload, screenshots: [PATH, other, other] }), QUERY, SHOP);
  assert.equal(model.readbackMatches(server, { payload, receipt: receipt(payload) }), true);
  assert.deepEqual(payload.screenshots, [PATH, other, PATH]); assert.deepEqual(server.publish.screenshots, [PATH, other, other]);
  server.publish.screenshots = [other, PATH];
  assert.equal(model.readbackMatches(server, { payload, receipt: receipt(payload) }), false, 'deduplication must not sort members');
});

test('restored historical duplicate paths retry the exact same key and payload yet accept canonical server readback', async () => {
  const first = await unknown(); first.page.onUnload();
  const key = Object.keys(first.app._applicationPending)[0], record = first.app._applicationPending[key];
  const historical = { ...record.payload, screenshots: [PATH, PATH] };
  first.app._applicationPending[key] = { ...record, payload: historical };
  const original = JSON.stringify(historical); let sent;
  const next = harness(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm-status' ? { state: 'not_found' } : a === 'publication-confirm' ? (sent = p, receipt(p)) : sent ? readback({ ...sent, screenshots: [PATH] }) : detail(), { environment: first.env });
  await next.start();
  assert.equal(next.calls.filter(c => c.action === 'publication-confirm').length, 0);
  assert.equal(JSON.stringify(next.app._applicationPending[key].payload), original);
  await next.page.reconcile(); await next.page.retrySame();
  assert.equal(JSON.stringify(next.calls.find(c => c.action === 'publication-confirm').params), original);
  assert.equal(next.page.data.saved, true); assert.equal(Object.keys(next.app._applicationPending).length, 0);
});

test('first definitive abort keeps the draft but releases only its intent and requires fresh authority before a new key', async () => {
  for (const [status, code] of ABORT_PAIRS) {
    let writes = 0, committed;
    const h = await loaded(async (a, p) => {
      if (a === 'activity-capabilities') return caps();
      if (a === 'publication-confirm') { if (++writes === 1) throw Object.assign(Error(code), { status, code }); committed = p; return receipt(p); }
      return committed ? readback(committed) : detail();
    });
    h.page.onNote(ev('保留修改')); h.page.onUrl(ev('https://example.test/changed')); h.page.removeEvidence(event(0));
    await h.page.confirmPublish(); const first = h.calls.find(c => c.action === 'publication-confirm').params;
    assert.equal(h.page.data.pending, false, code); assert.equal(Object.keys(h.app._applicationPending).length, 0);
    assert.equal(h.page.data.verified, false); assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.canRetrySame, false);
    assert.equal(h.page.data.note, '保留修改'); assert.equal(h.page.data.url, 'https://example.test/changed'); assert.equal(h.page.data.images.length, 0);
    await h.page.confirmPublish(); await h.page.retrySame(); await h.page.reconcile(); assert.equal(writes, 1);
    const before = h.calls.length; await h.page.refresh();
    assert.deepEqual(h.calls.slice(before).map(c => c.action), ['activity-capabilities', 'application-detail']);
    assert.equal(h.page.data.canSubmit, true); assert.equal(h.page.data.note, '保留修改');
    await h.page.confirmPublish(); const second = h.calls.filter(c => c.action === 'publication-confirm')[1].params;
    assert.notEqual(second.request_id, first.request_id); assert.equal(second.note, first.note); assert.deepEqual(second.screenshots, first.screenshots);
    assert.equal(h.page.data.saved, true); assert.equal(writes, 2);
  }
});

test('every matching abort after unknown or RAM restoration retains the original intent and exact same-key retry payload', async () => {
  for (const restored of [false, true]) for (const [status, code] of ABORT_PAIRS) {
    const first = await unknown(), original = first.calls.find(c => c.action === 'publication-confirm').params;
    const handler = async a => a === 'activity-capabilities' ? caps() : a === 'application-detail' ? detail() : a === 'publication-confirm-status' ? { state: 'not_found' } : Promise.reject(Object.assign(Error(code), { status, code }));
    let h = first;
    if (restored) { first.page.onUnload(); h = harness(handler, { environment: first.env }); await h.start(); }
    else h.page.api.action = async (action, params) => { h.calls.push({ action, params: JSON.parse(JSON.stringify(params)) }); return handler(action, params); };
    await h.page.reconcile(); assert.equal(h.page.data.pending, true); assert.equal(Object.keys(h.app._applicationPending).length, 1);
    await h.page.retrySame();
    assert.equal(h.page.data.pending, true, code); assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.receipt, null);
    assert.deepEqual(h.calls.filter(c => c.action === 'publication-confirm').at(-1).params, original);
    assert.equal(JSON.stringify(Object.values(h.app._applicationPending)[0].payload), JSON.stringify(original));
    assert.equal(Object.values(h.app._applicationPending)[0].unknown, true);
    const count = h.calls.length; await h.page.confirmPublish(); assert.equal(h.calls.length, count);
  }
});

test('untrusted or mismatched first-send errors never release RAM, including access failures, transport and malformed receipts', async () => {
  for (const failure of [{ status: 401, code: 'invalid_params' }, { status: 403, code: 'not_found' }, { status: 409, code: 'request_id_conflict' }, { status: 500, code: 'db_error' }, { status: 500, code: 'internal' }, { status: 404, code: 'version_conflict' }, { status: '400', code: 'invalid_params' }, { status: 400, code: 'shop_required' }, {}, null]) {
    const h = await loaded(async (a, p) => a === 'activity-capabilities' ? caps() : a === 'publication-confirm' ? failure === null ? receipt(p, { request_id: ACT }) : Promise.reject(Object.assign(Error('未知提交结果'), failure)) : detail());
    await h.page.confirmPublish();
    assert.equal(Object.keys(h.app._applicationPending).length, 1); assert.equal(Object.values(h.app._applicationPending)[0].unknown, true);
    assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.receipt, null);
  }
});
