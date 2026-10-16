const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
const dir = path.join(root, 'pages/activity-edit');
const SHOP = '00000000-0000-4000-8000-000000000901', USER = '00000000-0000-4000-8000-000000000902';
const ID = '00000000-0000-4000-8000-000000000031', VOUCHER = '00000000-0000-4000-8000-000000000032', OTHER = '00000000-0000-4000-8000-000000000033';
const NOW = '2026-10-16T01:20:00.123456Z', V1 = '1'.repeat(64), V2 = '2'.repeat(64);
const ev = value => ({ detail: { value } }), tap = dataset => ({ currentTarget: { dataset } });
const edit = (field, value) => ({ ...tap({ field }), ...ev(value) });
const field = patch => ({ key: 'original', label: '主页截图', type: 'image', required: true, role: 'profile_screenshot', placeholder: '原提示', future: { keep: [1, null] }, ...patch });
const activity = patch => ({ id: ID, name: '本店活动', description: null, voucher_id: VOUCHER, form_fields: [field()], status: 'closed', requires_review: true, starts_at: null, ends_at: null, min_followers: 1000, ...patch });
const caps = patch => ({ shop_id: SHOP, can_view: true, can_manage: true, ...patch });
const detail = patch => ({ shop_id: SHOP, activity: activity(), version: V1, server_time: NOW, voucher: { id: VOUCHER, name: '原关联券', active: false, deleted: true }, ...patch });
const candidate = patch => ({ id: OTHER, name: '可选本店券', threshold_type: 'min_spend', discount_amount: 20, min_spend: 100, valid_days: 30, starts_at: null, ends_at: null, created_at: NOW, ...patch });
const candidates = (p, patch) => ({ shop_id: SHOP, limit: p.limit, cursor: p.cursor || null, items: [candidate()], has_more: false, next_cursor: null, ...patch });
const receipt = (p, patch) => ({ shop_id: SHOP, request_id: p.request_id, operation: p.operation, actor_id: USER, activity_id: p.activity_id || ID, version: V2, deleted: p.operation === 'delete', recorded_at: NOW, replay: false, ...patch });
const status = (p, r = null, patch) => ({ shop_id: SHOP, operation: p.operation, request_id: p.request_id, requested_activity_id: p.activity_id || null, state: r ? 'succeeded' : 'not_found', receipt: r, ...patch });
const err = (status, code) => Object.assign(Error('SECRET raw backend ' + code), { status, code });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
function model() { assert.ok(fs.existsSync(path.join(dir, 'model.js')), 'activity editor model exists'); return require(path.join(dir, 'model.js')); }
function harness(handler, options = {}) {
  options = options || {};
  const file = path.join(dir, 'index.js'); assert.ok(fs.existsSync(file), 'native activity editor exists');
  const env = options.env || { revision: 1, current: { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } };
  if (!env.session) env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } };
  const calls = [], modals = [], renders = [], launches = [];
  const wx = { showModal(value) { modals.push(value); if (!options.manualModal) value.success({ confirm: true }); }, reLaunch(value) { launches.push(value); }, setNavigationBarTitle() {}, stopPullDownRefresh() {} };
  const app = env.app || (env.app = { session: env.session, preview: !!options.preview, ensureSession: async () => !!env.current });
  let server = activity(), version = V1, deleted = false;
  const defaultHandler = async (name, p) => {
    if (name === 'activity-manage-capabilities') return caps();
    if (name === 'activity-manage-detail') { if (deleted) throw err(404, 'not_found'); return detail({ activity: server, version, voucher: { id: server.voucher_id, name: '原关联券', active: false, deleted: true } }); }
    if (name === 'activity-manage-voucher-candidates') return candidates(p);
    if (name === 'activity-manage-write') { if (p.operation === 'delete') deleted = true; else if (p.operation === 'create') server = activity({ description: null, form_fields: [], status: 'active', requires_review: false, min_followers: 0, ...p.patch }); else server = { ...server, ...p.patch }; for (const key of ['starts_at', 'ends_at']) if (typeof server[key] === 'string') server[key] = server[key].replace(/\.(\d{3})Z$/, '.$1000Z'); version = V2; return receipt(p); }
    if (name === 'activity-manage-write-status') return status(p);
    throw Error('unexpected action ' + name);
  };
  app.api = { async action(name, p) { calls.push({ name, p: structuredClone(p) }); return handler ? handler(name, p, defaultHandler) : defaultHandler(name, p); } };
  const shell = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, wx, getApp: () => app });
  let spec; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { spec = value; }, getApp: () => app, wx, require(name) { return name === '../../shared/page' ? shell.exports : require(path.resolve(dir, name)); } }, { filename: file });
  const page = { ...spec, data: structuredClone(spec.data), setData(value) { assert.notEqual(this._gone, true, 'no unloaded native renders'); renders.push(value); Object.assign(this.data, value); } };
  return { page, calls, modals, renders, launches, env, app, async start(q = { id: ID }) { const load = page.onLoad(q), show = page.onShow(); await load; await show; }, writes() { return calls.filter(x => x.name === 'activity-manage-write'); }, states() { return calls.filter(x => x.name === 'activity-manage-write-status'); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER } }; if (kind === 'scope') env.current = { ...env.current, scopeVersion: 2 }; }, confirm(value = true) { return modals.at(-1).success({ confirm: value }); } };
}
async function loaded(handler, options, q) { const h = harness(handler, options); await h.start(q); return h; }
async function changed(h, name = '新名称') { h.page.onText(edit('name', name)); return h.page.save(); }

test('invalid supplied route id or missing verified UUID actor/shop sends zero requests', async () => {
  for (const q of [{ id: '' }, { id: 'bad' }, { id: [ID] }, { id: null }]) { const h = await loaded(null, null, q); assert.equal(h.calls.length, 0); assert.ok(h.page.data.error); }
  for (const current of [null, { userId: USER, shop: null }, { userId: 'bad', shop: { id: SHOP } }, { userId: USER, shop: { id: 'bad' } }]) { const env = { revision: 1, current }; const h = await loaded(null, { env }); assert.equal(h.calls.length, 0); }
});
test('onLoad immediately followed by onShow shares one active capability/detail read', async () => {
  const d = deferred(), h = harness(async (a, p, fallback) => a === 'activity-manage-capabilities' ? d.promise : fallback(a, p)); const pending = h.start(); await tick(); assert.equal(h.calls.length, 1); d.resolve(caps()); await pending; assert.deepEqual(h.calls.map(x => x.name), ['activity-manage-capabilities', 'activity-manage-detail']);
});
test('strict capabilities reject foreign/nonboolean flags and no management authority reveals no editor or writes', async () => {
  for (const c of [caps({ shop_id: OTHER }), caps({ can_view: 'true' }), caps({ can_manage: 'true' }), caps({ can_view: false, can_manage: true }), caps({ can_manage: false }), caps({ can_view: false, can_manage: false })]) { const h = await loaded(async () => c); await h.page.save(); await h.page.remove(); await h.page.setStatus(tap({ status: 'active' })); assert.equal(h.calls.length, 1); assert.equal(h.page.data.editable, false); assert.equal(h.writes().length, 0); }
});
test('detail projection binds UUID/shop/hash/server time and never exposes raw JSON metadata', async () => {
  for (const patch of [{ shop_id: OTHER }, { activity: activity({ id: OTHER }) }, { version: 'bad' }, { server_time: '2026-02-30T00:00:00.000000Z' }, { voucher: { id: OTHER, name: 'foreign', active: true, deleted: false } }, { activity: activity({ requires_review: 'true' }) }]) { const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail(patch) : fallback(a, p)); assert.equal(h.page.data.editable, false); assert.ok(h.page.data.error); }
  const h = await loaded(); assert.equal(h.page.data.name, '本店活动'); assert.match(h.page.data.statusLabel, /关闭/); assert.match(h.page.data.reviewLabel, /保留|审核/); assert.doesNotMatch(JSON.stringify(h.page.data), /"future"|"keep"|share_token|rawJSON/);
});
test('legacy NULL times/closed/review and malformed form remain unchanged while saving a name-only patch', async () => {
  const old = activity({ form_fields: { legacy: [null, 'old'] } }); let latest = old;
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') return detail({ activity: latest, version: latest === old ? V1 : V2 }); if (a === 'activity-manage-write') { latest = { ...old, ...p.patch }; return receipt(p); } return fallback(a, p); });
  await changed(h); assert.deepEqual(h.writes()[0].p.patch, { name: '新名称' }); assert.equal(h.page.data.saved, true); assert.equal(latest.requires_review, true); assert.equal(latest.status, 'closed'); assert.equal(latest.starts_at, null); assert.deepEqual(latest.form_fields, old.form_fields);
});
test('noop update does not create a request or modal', async () => { const h = await loaded(); await h.page.save(); assert.equal(h.writes().length, 0); assert.equal(h.modals.length, 0); assert.equal(h.page.data.saved, false); });
test('basic dirty fields block separate status operation instead of auto-splitting writes', async () => {
  const h = await loaded(); h.page.onText(edit('name', '未保存')); await h.page.setStatus(tap({ status: 'active' })); assert.equal(h.writes().length, 0); assert.match(h.page.data.notice, /先保存|放弃/); await h.page.save(); assert.deepEqual(h.writes()[0].p.patch, { name: '未保存' }); assert.equal(h.writes()[0].p.operation, 'update');
});
test('explicit active/draft change sends only set_status status and preserves review/legacy fields', async () => {
  const h = await loaded(); await h.page.setStatus(tap({ status: 'active' })); assert.equal(h.writes().length, 1); assert.equal(h.writes()[0].p.operation, 'set_status'); assert.deepEqual(h.writes()[0].p.patch, { status: 'active' }); assert.equal(h.writes()[0].p.expected_version, V1); assert.equal(h.page.data.saved, true); assert.match(h.modals[0].content, /closed|关闭/); assert.equal(Object.hasOwn(h.writes()[0].p, 'actor_id'), false);
});
test('create requires explicit valid fields, supports active/draft, and sends no target/CAS/review/actor/time', async () => {
  const h = await loaded(null, null, {}); await h.page.save(); assert.equal(h.writes().length, 0); h.page.onText(edit('name', '新活动')); await h.page.openVouchers(); h.page.chooseVoucher(tap({ id: OTHER }));
  for (const [field, date, time] of [['starts_at', '2026-10-16', '09:00'], ['ends_at', '2026-10-17', '09:00']]) { h.page.onDatePart({ ...tap({ field, part: 'date' }), ...ev(date) }); h.page.onDatePart({ ...tap({ field, part: 'time' }), ...ev(time) }); }
  h.page.onCreateStatus(tap({ status: 'draft' })); await h.page.save(); const p = h.writes()[0].p; assert.equal(p.operation, 'create'); assert.equal(p.patch.status, 'draft'); assert.equal(p.patch.starts_at, '2026-10-16T01:00:00.000Z'); for (const key of ['activity_id', 'expected_version', 'actor_id', 'recorded_at', 'requires_review']) assert.equal(Object.hasOwn(p, key), false); assert.equal(Object.hasOwn(p.patch, 'requires_review'), false); assert.equal(h.page.data.saved, true);
});
test('unchanged date picker values retain microsecond ISO while actual Shanghai changes convert only edited side', async () => {
  const raw = activity({ starts_at: NOW, ends_at: '2026-10-17T01:20:00.987654Z' }); const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: raw }) : fallback(a, p));
  h.page.onDatePart({ ...tap({ field: 'starts_at', part: 'date' }), ...ev('2026-10-16') }); h.page.onText(edit('name', '改名')); assert.deepEqual(h.page.buildPatch(), { name: '改名' });
  h.page.onDatePart({ ...tap({ field: 'starts_at', part: 'time' }), ...ev('09:30') }); assert.equal(h.page.buildPatch().starts_at, '2026-10-16T01:30:00.000Z'); assert.equal(Object.hasOwn(h.page.buildPatch(), 'ends_at'), false);
});
test('only complete actual date edits validate range and partial/invalid dates retain local input without writes', async () => {
  const h = await loaded(); h.page.onDatePart({ ...tap({ field: 'starts_at', part: 'date' }), ...ev('2026-10-16') }); h.page.onText(edit('name', '改名')); await h.page.save(); assert.equal(h.writes().length, 0); assert.ok(h.page.data.validation); assert.equal(h.page.data.startDate, '2026-10-16');
});
test('inline candidate cursor pages use actual DTO without invented active flag and selection requires loaded membership', async () => {
  const h = await loaded(async (a, p, fallback) => a === 'activity-manage-voucher-candidates' ? candidates(p, p.cursor ? { items: [candidate({ id: VOUCHER, discount_amount: null, min_spend: null })] } : { has_more: true, next_cursor: 'cursor_A' }) : fallback(a, p));
  await h.page.openVouchers(); assert.equal(h.page.data.vouchers.length, 1); h.page.chooseVoucher(tap({ id: USER })); assert.equal(h.page.buildPatch().voucher_id, undefined); await h.page.moreVouchers(); assert.equal(h.page.data.vouchers.length, 2); assert.equal(h.calls.at(-1).p.cursor, 'cursor_A'); assert.match(h.page.data.vouchers[1].amountText, /未提供/); h.page.chooseVoucher(tap({ id: OTHER })); assert.equal(h.page.buildPatch().voucher_id, OTHER);
});
test('candidate response binds outer cursor/limit/shop and validates rows; failed continuation preserves loaded choices', async () => {
  for (const patch of [{ shop_id: OTHER }, { limit: 5 }, { cursor: 'foreign' }, { has_more: true, next_cursor: null }, { items: [candidate(), candidate()] }, { items: [candidate({ created_at: 'bad' })] }, { items: [candidate({ discount_amount: '20' })] }]) { const h = await loaded(async (a, p, fallback) => a === 'activity-manage-voucher-candidates' ? candidates(p, patch) : fallback(a, p)); await h.page.openVouchers(); assert.equal(h.page.data.vouchers.length, 0); assert.ok(h.page.data.voucherError); }
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-voucher-candidates') { if (p.cursor) throw err(500, 'db_error'); return candidates(p, { has_more: true, next_cursor: 'cursor_A' }); } return fallback(a, p); }); await h.page.openVouchers(); await h.page.moreVouchers(); assert.equal(h.page.data.vouchers.length, 1); assert.ok(h.page.data.voucherError);
});
test('field edits retain original JSON metadata, stable keys and explicit reorder/remove for unknown types', async () => {
  const raw = activity({ form_fields: [field(), field({ key: 'legacy', type: 'future-type', role: 'future-role' })] }); const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: raw }) : fallback(a, p));
  h.page.toggleField(tap({ key: 'original' })); h.page.onFieldText({ ...tap({ key: 'original', field: 'label' }), ...ev('新标题') }); let p = h.page.buildPatch(); assert.deepEqual(p.form_fields[0].future, raw.form_fields[0].future); assert.equal(p.form_fields[0].key, 'original');
  h.page.onFieldText({ ...tap({ key: 'legacy', field: 'label' }), ...ev('不能修改') }); assert.equal(h.page.buildPatch().form_fields[1].label, raw.form_fields[1].label); h.page.moveField(tap({ key: 'legacy', direction: 'up' })); assert.equal(h.page.buildPatch().form_fields[0].key, 'legacy'); await h.page.removeField(tap({ key: 'legacy' })); assert.equal(h.page.buildPatch().form_fields.length, 1);
});
test('six type/two role native handlers and individual select options preserve unknown metadata', async () => {
  const h = await loaded(); h.page.addField(); const key = h.page.data.fields.at(-1).key; h.page.addOption(tap({ key })); h.page.onFieldType({ ...tap({ key }), ...ev('5') }); h.page.onOption({ ...tap({ key, index: 0 }), ...ev('第一项') }); h.page.addOption(tap({ key })); h.page.onOption({ ...tap({ key, index: 1 }), ...ev('第二项') }); assert.deepEqual(h.page.buildPatch().form_fields.at(-1).options, ['第一项', '第二项']); assert.equal(h.page.buildPatch().form_fields.at(-1).type, 'select');
  h.page.onFieldRole({ ...tap({ key: 'original' }), ...ev('0') }); h.page.onFieldType({ ...tap({ key: 'original' }), ...ev('2') }); h.page.onFieldRole({ ...tap({ key: 'original' }), ...ev('1') }); assert.equal(h.page.buildPatch().form_fields[0].role, 'xhs_profile_url'); assert.deepEqual(h.page.buildPatch().form_fields[0].future, { keep: [1, null] });
});
test('changed PG follower and new form size/key/label/options limits are validated without truncation', () => {
  const m = model(); for (const patch of [{ min_followers: 2147483648 }, { form_fields: Array.from({ length: 51 }, (_, i) => ({ key: 'k' + i, label: 'x', type: 'text' })) }, { form_fields: [{ key: 'k'.repeat(65), label: 'x', type: 'text' }] }, { form_fields: [{ key: 'new', label: 'x'.repeat(101), type: 'text' }] }, { form_fields: [{ key: 'new', label: 'x', type: 'text', placeholder: 'x'.repeat(201) }] }, { form_fields: [{ key: 'new', label: 'x', type: 'select', options: ['x'.repeat(101)] }] }]) assert.throws(() => m.patch(activity(), { ...activity(), ...patch }));
});
test('save cancellation and edits while confirmation is pending never send or lose the draft', async () => {
  const h = await loaded(null, { manualModal: true }); h.page.onText(edit('name', '草稿')); const pending = h.page.save(); await tick(); await h.confirm(false); await pending; assert.equal(h.writes().length, 0); assert.equal(h.page.data.name, '草稿');
  const stale = h.page.save(); await tick(); h.page.onText(edit('name', '变化')); await h.confirm(); await stale; assert.equal(h.writes().length, 0); assert.equal(h.page.data.name, '变化');
});
test('duplicate confirmations and double-clicks cannot create multiple write intents', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? d.promise : fallback(a, p), { manualModal: true }); h.page.onText(edit('name', '草稿')); const one = h.page.save(); await tick(); const two = h.page.save(); const modal = h.modals.at(-1); modal.success({ confirm: true }); modal.success({ confirm: true }); await tick(); assert.equal(h.writes().length, 1); d.reject(err(500, 'db_error')); await one; await two; assert.equal(h.writes().length, 1);
});
test('all initial write errors are conservatively unknown, retain immutable intent and never auto retry', async () => {
  for (const [statusCode, code] of [[400, 'invalid_params'], [404, 'not_found'], [409, 'version_conflict'], [422, 'voucher_unavailable'], [500, 'db_error']]) { const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw err(statusCode, code); return fallback(a, p); }); await changed(h); assert.equal(h.page.data.pending, true); assert.equal(h.writes().length, 1); assert.equal(h.page.data.saved, false); assert.equal(Object.keys(h.app._activityManagePending).length, 1); assert.doesNotMatch(h.page.data.error, /SECRET/); await h.page.save(); assert.equal(h.writes().length, 1); }
});
test('exact matching receipt then complete readback is required, mismatches remain read-only and never saved', async () => {
  for (const bad of [{ actor_id: OTHER }, { shop_id: OTHER }, { activity_id: OTHER }, { request_id: OTHER }, { operation: 'create' }, { version: 'bad' }, { deleted: true }, { recorded_at: 'bad' }, { replay: 'true' }]) { const h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? receipt(p, bad) : fallback(a, p)); await changed(h); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.pending, true); }
  const h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? receipt(p) : fallback(a, p)); await changed(h); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.ok(h.page.data.readbackError); await h.page.save(); assert.equal(h.writes().length, 1);
});
test('readback validates unedited review/status/form fields, not merely changed title and matching version', async () => {
  let wrote = false; const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { wrote = true; return receipt(p); } if (a === 'activity-manage-detail' && wrote) return detail({ activity: activity({ name: '新名称', requires_review: false }), version: V2 }); return fallback(a, p); }); await changed(h); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, true); assert.ok(h.page.data.readbackError);
});
test('delete has irreversible issued-voucher warning, no patch, and only matching receipt plus independent404 succeeds', async () => {
  const h = await loaded(); await h.page.remove(); const p = h.writes()[0].p; assert.equal(p.operation, 'delete'); assert.equal(Object.hasOwn(p, 'patch'), false); assert.match(h.modals[0].content, /申请记录/); assert.match(h.modals[0].content, /已发放的优惠券仍然有效/); assert.match(h.modals[0].content, /不可恢复/); assert.equal(h.page.data.saved, true); assert.equal(h.page.data.deleted, true); assert.equal(Object.keys(h.app._activityManagePending).length, 0);
});
test('delete readback403 or row still present never counts as deletion and cannot resend a confirmed request', async () => {
  for (const mode of ['403', 'present']) { let wrote = false; const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { wrote = true; return receipt(p); } if (a === 'activity-manage-detail' && wrote) { if (mode === '403') throw err(403, 'shop_forbidden'); return detail(); } return fallback(a, p); }); await h.page.remove(); assert.equal(h.page.data.saved, false); assert.equal(Object.keys(h.app._activityManagePending).length, 1); await h.page.remove(); assert.equal(h.writes().length, 1); }
});
test('unknown delete unload/reentry restores after fresh caps even when detail404 and explicit status can reconcile', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP, name: '本店' }, scopeVersion: 1 } }; let payload;
  const first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { payload = structuredClone(p); throw Error('lost'); } return fallback(a, p); }, { env }); await first.page.remove(); first.page.onUnload();
  const next = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') throw err(404, 'not_found'); if (a === 'activity-manage-write-status') return status(p, receipt(payload, { replay: true })); return fallback(a, p); }, { env }); assert.equal(next.page.data.pending, true); assert.equal(next.page.data.editable, false); assert.equal(next.page.data.name, ''); await next.page.reconcile(); assert.equal(next.states().length, 1); assert.equal(next.page.data.saved, true); assert.equal(next.page.data.deleted, true); assert.equal(next.writes().length, 0);
});
test('confirmed delete receipt survives failed readback/unload and404 is not blocked by missing detail on return', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } }; let wrote = false;
  const first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { wrote = true; return receipt(p); } if (a === 'activity-manage-detail' && wrote) throw err(500, 'db_error'); return fallback(a, p); }, { env }); await first.page.remove(); first.page.onUnload();
  const next = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') throw err(404, 'not_found'); return fallback(a, p); }, { env }); assert.equal(next.page.data.saved, true); assert.equal(next.page.data.deleted, true); assert.equal(next.writes().length, 0);
});
test('status not_found does not release/create new request; explicit retry retains byte-identical payload/CAS/UUID', async () => {
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('unknown'); return fallback(a, p); }); await changed(h); const original = h.writes()[0].p; await h.page.reconcile(); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.canRetrySame, true); await h.page.retrySame(); assert.deepEqual(h.writes()[1].p, original); assert.equal(h.page.data.saved, false);
});
test('create status binds requested_activity_id null and cannot adopt a foreign target envelope', async () => {
  const p = { shop_id: SHOP, operation: 'create', request_id: OTHER, patch: {} }; const m = model(); assert.equal(m.status(status(p), p, USER), null); assert.throws(() => m.status(status(p, null, { requested_activity_id: ID }), p, USER)); assert.throws(() => m.status(status(p, receipt(p, { actor_id: OTHER })), p, USER));
});
test('request_id_conflict permanently blocks same-key retry while retaining unknown intent', async () => {
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw err(409, 'request_id_conflict'); return fallback(a, p); }); await changed(h); await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.writes().length, 1); assert.equal(h.page.data.canRetrySame, false); assert.equal(Object.keys(h.app._activityManagePending).length, 1);
});
for (const mode of ['hide', 'unload', 'revision', 'user', 'shop', 'scope']) test('late write/401 after ' + mode + ' cannot paint success or sign out a new context', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? d.promise : fallback(a, p)); const pending = changed(h); await tick(); assert.equal(h.writes().length, 1);
  if (mode === 'hide') h.page.onHide(); else if (mode === 'unload') h.page.onUnload(); else h.change(mode); const count = h.renders.length; d.reject(err(401, 'unauthorized')); await pending;
  assert.equal(h.launches.length, 0); assert.equal(h.page.data.saved, false); assert.equal(Object.keys(h.app._activityManagePending).length, 1); if (mode === 'unload') assert.equal(h.renders.length, count);
});
test('same actor/shop permissions must be freshly restored before exposing pending data; foreign actors/stores cannot see it', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } }, first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); return fallback(a, p); }, { env }); await changed(first, '私有草稿'); first.page.onUnload(); env.revision++;
  const denied = await loaded(async () => caps({ can_manage: false }), { env }); assert.equal(denied.page.data.pending, false); assert.equal(denied.page.data.name, ''); assert.equal(Object.keys(env.app._activityManagePending).length, 1);
  env.current = { userId: OTHER, shop: { id: SHOP }, scopeVersion: 1 }; env.revision++; const foreign = await loaded(null, { env }); assert.equal(foreign.page.data.pending, false); assert.notEqual(foreign.page.data.name, '私有草稿');
  env.current = { userId: USER, shop: { id: SHOP }, scopeVersion: 1 }; env.revision++; const d = deferred(), restored = harness(async (a, p, fallback) => a === 'activity-manage-capabilities' ? d.promise : fallback(a, p), { env }); const pending = restored.start(); await tick(); assert.equal(restored.page.data.name, ''); d.resolve(caps()); await pending; assert.equal(restored.page.data.pending, true); assert.equal(restored.page.data.name, '私有草稿'); assert.equal(restored.writes().length, 0);
});
test('permission403 during status hides UI but preserves unknown record, including after reentry', async () => {
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); if (a === 'activity-manage-write-status') throw err(403, 'shop_forbidden'); return fallback(a, p); }); await changed(h); await h.page.reconcile(); assert.equal(h.page.data.name, ''); assert.equal(h.page.data.editable, false); assert.equal(Object.keys(h.app._activityManagePending).length, 1); h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.pending, true); assert.equal(h.writes().length, 1);
});
test('version conflict preserves draft and cannot silently adopt new CAS or make a second intent', async () => {
  let version = V1; const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') return detail({ version }); return fallback(a, p); }); h.page.onText(edit('name', '本地草稿')); version = V2; await h.page.refresh(); assert.equal(h.page.data.name, '本地草稿'); assert.equal(h.page.data.conflict, true); await h.page.save(); assert.equal(h.writes().length, 0); await h.page.reloadLatest(); assert.equal(h.page.data.name, '本店活动'); assert.equal(h.page.data.conflict, false);
});
test('preview can edit local fields/candidates but every write/status/retry direct handler is zero-call', async () => {
  const h = await loaded(null, { preview: true }); h.page.onText(edit('name', '合成草稿')); h.page.addField(); await h.page.openVouchers(); h.page.chooseVoucher(tap({ id: OTHER })); assert.equal(h.page.data.name, '合成草稿'); assert.equal(h.page.data.editable, true);
  await h.page.save(); await h.page.remove(); await h.page.setStatus(tap({ status: 'active' })); await h.page.reconcile(); await h.page.retrySame(); await h.page.retryReadback(); assert.equal(h.writes().length, 0); assert.equal(h.states().length, 0); assert.equal(h.page.data.saved, false);
});
test('native quartet exists, no raw JSON/H5, correct dynamic conditions and untruncated inputs', () => {
  for (const name of ['index.js', 'index.json', 'index.wxml', 'index.wxss']) assert.ok(fs.existsSync(path.join(dir, name)), name); JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const xml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8'); for (const fn of ['openVouchers', 'moreVouchers', 'chooseVoucher', 'onFieldType', 'onFieldRole', 'onOption', 'setStatus', 'reconcile', 'reloadLatest']) assert.match(xml, new RegExp(fn)); for (const m of xml.matchAll(/wx:(?:if|elif)="([^"]+)"/g)) assert.match(m[1], /^\{\{[\s\S]*\}\}$/); assert.match(xml, /maxlength="-1"/); assert.doesNotMatch(xml, /<web-view|JSON\.stringify|&amp;&amp;/);
});
test('unknown create preserves edited Shanghai picker values on unload/reentry without canonicalizing its frozen payload', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } };
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); return fallback(a, p); }, { env }, {});
  h.page.onText(edit('name', '未确认创建')); await h.page.openVouchers(); h.page.chooseVoucher(tap({ id: OTHER }));
  for (const [field, date] of [['starts_at', '2026-10-16'], ['ends_at', '2026-10-17']]) { h.page.onDatePart({ ...tap({ field, part: 'date' }), ...ev(date) }); h.page.onDatePart({ ...tap({ field, part: 'time' }), ...ev('09:30') }); }
  await h.page.save(); const original = h.writes()[0].p; h.page.onUnload();
  const next = await loaded(null, { env }, {}); assert.equal(next.page.data.pending, true); assert.equal(next.page.data.startDate, '2026-10-16'); assert.equal(next.page.data.startTime, '09:30'); assert.equal(next.page.data.endDate, '2026-10-17'); assert.deepEqual(next.page._pending.payload, original); assert.equal(next.writes().length, 0);
});
test('not_found original status remains explicitly explained after final render and never means cancellation', async () => {
  const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); return fallback(a, p); }); await changed(h); await h.page.reconcile(); assert.match(h.page.data.notice, /尚未查到/); assert.match(h.page.data.notice, /不代表失败/); assert.equal(h.page.data.saved, false);
});
test('source nullable voucher association remains readable and untouched for a name-only patch', async () => {
  const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: activity({ voucher_id: null }), voucher: null }) : fallback(a, p)); assert.equal(h.page.data.editorVisible, true); h.page.onText(edit('name', '修改名称')); assert.deepEqual(h.page.buildPatch(), { name: '修改名称' });
});
for (const mode of ['hide', 'unload', 'revision', 'shop']) test('candidate late response after ' + mode + ' cannot expose or select stale vouchers', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-voucher-candidates' ? d.promise : fallback(a, p)); const pending = h.page.openVouchers(); await tick();
  if (mode === 'hide') h.page.onHide(); else if (mode === 'unload') h.page.onUnload(); else h.change(mode);
  d.resolve(candidates({ limit: 20 })); await pending; h.page.chooseVoucher(tap({ id: OTHER })); assert.equal(h.page.data.vouchers.length, 0); assert.equal(h.writes().length, 0); assert.equal(h.page.data.name, '');
});
test('closing voucher picker invalidates its pending page without reopening it on return', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-voucher-candidates' ? d.promise : fallback(a, p)); const pending = h.page.openVouchers(); h.page.closeVouchers(); d.resolve(candidates({ limit: 20 })); await pending; assert.equal(h.page.data.voucherOpen, false); assert.equal(h.page.data.vouchers.length, 0);
});
test('hidden confirmation callback cannot write, and fresh show preserves same-version unsent draft', async () => {
  const h = await loaded(null, { manualModal: true }); h.page.onText(edit('name', '未保存草稿')); const p = h.page.save(); await tick(); h.page.onHide(); await h.confirm(); await p; assert.equal(h.writes().length, 0); assert.equal(h.page.data.name, ''); await h.page.onShow(); assert.equal(h.page.data.name, '未保存草稿'); assert.equal(h.page.data.canSave, true);
});
test('late successful write while hidden is not installed as a receipt and requires explicit status after fresh caps', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? d.promise : fallback(a, p)); const pending = changed(h); await tick(); const p = h.writes()[0].p; h.page.onHide(); d.resolve(receipt(p)); await pending; assert.equal(h.page.data.receiptConfirmed, false); await h.page.onShow(); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.states().length, 0); assert.equal(h.writes().length, 1);
});
test('readback compares microseconds precisely instead of accepting same-millisecond content', () => {
  const m = model(), p = { shop_id: SHOP, operation: 'update', request_id: OTHER, activity_id: ID, patch: {} }, original = activity({ starts_at: NOW });
  const record = { receipt: receipt(p), expected: original }; const same = m.detail(detail({ activity: original, version: V2 }), SHOP, ID); assert.equal(m.matches(same, record), true); const wrong = m.detail(detail({ activity: { ...original, starts_at: NOW.replace('123456', '123455') }, version: V2 }), SHOP, ID); assert.equal(m.matches(wrong, record), false);
});
test('confirmed receipt remains immutable through failed readback and only read actions are retried', async () => {
  let wrote = false; const h = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { wrote = true; return receipt(p); } if (a === 'activity-manage-detail' && wrote) throw err(500, 'db_error'); return fallback(a, p); }); await changed(h); const original = structuredClone(h.page._pending.payload); await h.page.retrySame(); await h.page.reconcile(); assert.equal(h.writes().length, 1); assert.equal(h.states().length, 0); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.deepEqual(h.page._pending.payload, original);
});
test('new local fields cannot exceed field collection byte/option count constraints', () => {
  const m = model(); const huge = field({ future: { preserved: 'x'.repeat(65536) } }); assert.throws(() => m.patch(activity(), activity({ form_fields: [huge] })));
  assert.throws(() => m.patch(activity(), activity({ form_fields: [{ key: 'select', type: 'select', label: '选项', options: Array(51).fill('x') }] })));
});
test('foreign shop cannot restore the actor original create slot, even after fresh permissive capabilities', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } }, first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); return fallback(a, p); }, { env }); await changed(first); first.page.onUnload(); env.current = { ...env.current, shop: { id: OTHER } }; env.revision++;
  const next = await loaded(async (a, p) => a === 'activity-manage-capabilities' ? caps({ shop_id: OTHER }) : detail({ shop_id: OTHER }), { env }); assert.equal(next.page.data.pending, false); assert.notEqual(next.page.data.name, '新名称'); assert.equal(next.states().length, 0); assert.equal(Object.keys(env.app._activityManagePending).length, 1);
});
test('old actor version-conflict rejection cannot latch conflict into an already loaded new identity', async () => {
  const d = deferred(), h = await loaded(async (a, p, fallback) => a === 'activity-manage-write' ? d.promise : fallback(a, p)); const write = changed(h); await tick(); h.change('user'); await h.page.refresh(); assert.equal(h.page.data.editable, true); d.reject(err(409, 'version_conflict')); await write; h.page.render(); assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.pending, false);
});
test('actual synthetic preview DTO permits local text/field/voucher edits without any write or status action', async () => {
  const { createPreview } = require('../miniprogram/shared/preview'); const preview = createPreview({}); const current = preview.session.get(); const env = { revision: 1, current, session: preview.session };
  const h = await loaded((a, p) => preview.api.action(a, p), { env, preview: true }); assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.minFollowers, '0'); assert.equal(h.page.data.startDate, ''); h.page.onText(edit('name', '合成本地修改')); h.page.addField(); await h.page.openVouchers(); assert.equal(h.page.data.vouchers.length, 1); h.page.chooseVoucher(tap({ id: h.page.data.vouchers[0].id })); await h.page.save(); await h.page.setStatus(tap({ status: 'draft' })); await h.page.remove(); await h.page.reconcile(); assert.equal(h.writes().length, 0); assert.equal(h.states().length, 0); assert.equal(h.page.data.name, '合成本地修改');
});
for (const confirmed of [false, true]) for (const lifecycle of ['hide', 'unload']) for (const failure of ['500', 'network', 'malformed']) test((confirmed ? 'confirmed' : 'unknown') + ' pending survives ' + lifecycle + ' detail ' + failure + ' after fresh caps with read-only recovery', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP, name: '本店' }, scopeVersion: 1 } };
  let failDetail = false, payload;
  const handler = async (a, p, fallback) => {
    if (a === 'activity-manage-write') { payload = structuredClone(p); failDetail = true; if (confirmed) return receipt(p); throw Error('uncertain write'); }
    if (a === 'activity-manage-detail') {
      if (failDetail) { if (failure === 'malformed') return detail({ version: 'not-a-version' }); throw failure === '500' ? err(500, 'db_error') : Error('SECRET connection detail'); }
      return detail(payload ? { activity: activity({ ...payload.patch }), version: V2 } : {});
    }
    if (a === 'activity-manage-write-status') return status(p, failDetail ? null : receipt(payload, { replay: true }));
    return fallback(a, p);
  };
  const first = await loaded(handler, { env }); await changed(first); const original = structuredClone(payload), record = first.page._pending;
  let next = first, callsAtReturn = first.calls.length;
  if (lifecycle === 'hide') { first.page.onHide(); await first.page.onShow(); }
  else { first.page.onUnload(); next = await loaded(handler, { env }); callsAtReturn = 0; }
  assert.equal(next.calls[callsAtReturn].name, 'activity-manage-capabilities');
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.canReconcile, true); assert.equal(next.page.data.receiptConfirmed, confirmed);
  assert.equal(next.page.data.loading, false); assert.equal(next.page.data.editorVisible, false); assert.equal(next.page.data.name, ''); assert.equal(next.page.data.editable, false);
  for (const key of ['canSave', 'canDelete', 'canSetStatus', 'canRetrySame', 'saved', 'deleted']) assert.equal(next.page.data[key], false, key);
  assert.equal(next.page._pending, record); assert.deepEqual(record.payload, original); assert.equal(Object.keys(env.app._activityManagePending).length, 1);
  const writeCount = next.writes().length; await next.page.save(); await next.page.remove(); await next.page.setStatus(tap({ status: 'active' })); await next.page.retrySame(); assert.equal(next.writes().length, writeCount);
  const detailCount = next.calls.filter(x => x.name === 'activity-manage-detail').length; await next.page.reconcile();
  assert.equal(next.states().length, confirmed ? 0 : 1); if (confirmed) assert.equal(next.calls.filter(x => x.name === 'activity-manage-detail').length, detailCount + 1);
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.saved, false); assert.deepEqual(record.payload, original);
  failDetail = false; await next.page.reconcile(); assert.equal(next.page.data.saved, true); assert.equal(next.writes().length, writeCount); assert.equal(Object.keys(env.app._activityManagePending).length, 0);
});
for (const confirmed of [false, true]) for (const code of [401, 403]) test((confirmed ? 'confirmed' : 'unknown') + ' restored intent does not bypass detail permission ' + code, async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } }; let wrote = false;
  const first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') { wrote = true; if (confirmed) return receipt(p); throw Error('lost'); } if (a === 'activity-manage-detail' && wrote) throw err(500, 'db_error'); return fallback(a, p); }, { env }); await changed(first); first.page.onUnload();
  const next = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') throw err(code, code === 401 ? 'unauthorized' : 'shop_forbidden'); return fallback(a, p); }, { env });
  assert.equal(next.page.data.pending, false); assert.equal(next.page.data.canReconcile, false); assert.equal(next.page.data.editorVisible, false); assert.equal(next.page.data.name, ''); await next.page.reconcile(); assert.equal(next.states().length, 0); assert.equal(Object.keys(env.app._activityManagePending).length, 1);
});
test('nonpermission detail failure without exact route RAM leaves all editing and recovery disabled', async () => {
  const env = { revision: 1, current: { userId: USER, shop: { id: SHOP }, scopeVersion: 1 } }, first = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-write') throw Error('lost'); return fallback(a, p); }, { env }); await changed(first); first.page.onUnload();
  const next = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') throw err(500, 'db_error'); return fallback(a, p); }, { env }, { id: OTHER }); assert.equal(next.page.data.pending, false); assert.equal(next.page.data.canReconcile, false); assert.equal(next.page.data.editable, false); await next.page.reconcile(); assert.equal(next.states().length, 0); assert.equal(Object.keys(env.app._activityManagePending).length, 1);
});
test('preview uses one combined banner without a duplicate default notice while conflict and real errors remain visible', async () => {
  let version = V1; const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ version }) : fallback(a, p), { preview: true }); assert.equal(h.page.data.notice, '');
  const xml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8'); assert.match(xml, /<view wx:if="\{\{!preview\}\}" class="development-note">/); assert.match(xml, /<view wx:if="\{\{preview\}\}" class="preview-note">合成预览[^<]*后台尚未验收[^<]*本地草稿不保存、不删除、不查询回执/);
  h.page.onText(edit('name', '预览草稿')); version = V2; await h.page.refresh(); assert.equal(h.page.data.conflict, true); assert.match(h.page.data.notice, /云端版本已变化/); assert.equal(h.page.data.canSave, false); await h.page.reconcile(); assert.equal(h.states().length, 0);
  const failed = await loaded(async (a, p, fallback) => { if (a === 'activity-manage-detail') throw err(500, 'db_error'); return fallback(a, p); }, { preview: true }); assert.ok(failed.page.data.error); assert.equal(failed.page.data.editable, false);
  const production = await loaded(); assert.match(production.page.data.notice, /保存和状态变更分别/);
});
test('native textarea to select happens before options exist; incomplete draft is kept and only complete explicit options can save', async () => {
  const original = field({ type: 'textarea', role: null }); const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: activity({ form_fields: [original] }) }) : fallback(a, p));
  h.page.onFieldType({ ...tap({ key: 'original' }), ...ev('5') }); assert.equal(h.page._draft.form_fields[0].type, 'select'); assert.equal(Object.hasOwn(h.page._draft.form_fields[0], 'options'), false); assert.match(h.page.data.validation, /选项/); assert.equal(h.page.data.canSave, false); await h.page.save(); assert.equal(h.writes().length, 0);
  h.page.addOption(tap({ key: 'original' })); assert.deepEqual(h.page._draft.form_fields[0].options, ['']); assert.equal(h.page.data.canSave, false); h.page.onOption({ ...tap({ key: 'original', index: 0 }), ...ev('手工填写选项') });
  const patch = h.page.buildPatch(); assert.equal(patch.form_fields[0].type, 'select'); assert.deepEqual(patch.form_fields[0].options, ['手工填写选项']); assert.deepEqual(patch.form_fields[0].future, original.future); assert.equal(h.page.data.canSave, true); await h.page.save(); assert.equal(h.writes().length, 1); assert.deepEqual(h.writes()[0].p.patch, patch);
});
test('clearing an existing field label preserves an incomplete input draft until the user types its replacement', async () => {
  const h = await loaded(); h.page.onFieldText({ ...tap({ key: 'original', field: 'label' }), ...ev('') }); assert.equal(h.page._draft.form_fields[0].label, ''); assert.equal(h.page.data.fields[0].label, ''); assert.ok(h.page.data.validation); assert.equal(h.page.data.canSave, false); await h.page.save(); assert.equal(h.writes().length, 0);
  h.page.onFieldText({ ...tap({ key: 'original', field: 'label' }), ...ev('重新输入标题') }); assert.equal(h.page.data.fields[0].label, '重新输入标题'); assert.equal(h.page.data.canSave, true); assert.deepEqual(h.page.buildPatch().form_fields[0].future, { keep: [1, null] });
});
for (const action of ['clear', 'remove']) test(action + ' last select option keeps incomplete local draft rather than restoring or filling a fake option', async () => {
  const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: activity({ form_fields: [field({ type: 'select', role: null, options: ['旧选项'] })] }) }) : fallback(a, p));
  const event = { ...tap({ key: 'original', index: 0 }), ...ev('') }; if (action === 'clear') h.page.onOption(event); else h.page.removeOption(event);
  assert.deepEqual(h.page._draft.form_fields[0].options, action === 'clear' ? [''] : []); assert.equal(h.page.data.canSave, false); assert.ok(h.page.data.validation); await h.page.save(); assert.equal(h.writes().length, 0);
  if (action === 'remove') h.page.addOption(tap({ key: 'original' })); h.page.onOption({ ...tap({ key: 'original', index: 0 }), ...ev('新填写选项') }); assert.deepEqual(h.page.buildPatch().form_fields[0].options, ['新填写选项']); assert.equal(h.page.data.canSave, true);
});
test('type-role conflict preserves the original role visibly until an explicit role change resolves it', async () => {
  const h = await loaded(); h.page.onFieldType({ ...tap({ key: 'original' }), ...ev('5') }); assert.equal(h.page._draft.form_fields[0].type, 'select'); assert.equal(h.page._draft.form_fields[0].role, 'profile_screenshot'); assert.equal(h.page.data.fields[0].roleConflict, true); assert.match(h.page.data.fields[0].roleOptions[h.page.data.fields[0].roleIndex].label, /不兼容/);
  h.page.addOption(tap({ key: 'original' })); h.page.onOption({ ...tap({ key: 'original', index: 0 }), ...ev('一项') }); assert.match(h.page.data.validation, /角色/); assert.equal(h.page.data.canSave, false);
  h.page.onFieldRole({ ...tap({ key: 'original' }), ...ev('0') }); assert.equal(h.page._draft.form_fields[0].role, null); assert.equal(h.page.data.fields[0].roleConflict, false); assert.equal(h.page.data.canSave, true); assert.deepEqual(h.page.buildPatch().form_fields[0].future, { keep: [1, null] });
  const xml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8'); assert.match(xml, /wx:if="\{\{item.roleConflict\}\}"/); assert.match(xml, /明确.*普通字段/);
});
test('local draftField whitelist retains every loaded key/metadata and rejects unknown schemas, duplicate/foreign/immutable keys and malformed patches', () => {
  const m = model(), raw = JSON.parse('[{"key":"original","label":"旧标题","type":"textarea","role":null,"__proto__":{"safe":true},"future":{"nested":[1,null]}}]'); assert.equal(typeof m.draftField, 'function');
  const next = m.draftField(raw, 'original', { type: 'select', label: '', options: [''] }); assert.equal(next[0].key, raw[0].key); assert.equal(next[0].type, 'select'); assert.deepEqual(next[0].future, raw[0].future); assert.deepEqual(next[0].__proto__, { safe: true }); next[0].future.nested.push(2); assert.deepEqual(raw[0].future.nested, [1, null]); assert.equal(raw[0].type, 'textarea');
  for (const changes of [{ key: 'different' }, { future: {} }, JSON.parse('{"__proto__":{}}'), { type: 'future' }, { role: 'future' }, { required: 'true' }, { options: [1] }, { label: null }, { placeholder: null }]) assert.throws(() => m.draftField(raw, 'original', changes));
  for (const rows of [[field(), field()], [field({ type: 'future' })], [field({ role: 'future' })], [field({ key: 'x'.repeat(65) })], { old: true }]) assert.throws(() => m.draftField(rows, rows[0] && rows[0].key || 'original', { label: '' })); assert.throws(() => m.draftField(raw, 'missing', { label: '' }));
});
test('unknown field type/role is still readonly at direct draft handlers and cannot be converted through selector', async () => {
  for (const original of [field({ type: 'future' }), field({ role: 'future' })]) {
    const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: activity({ form_fields: [original] }) }) : fallback(a, p)); h.page.onFieldType({ ...tap({ key: 'original' }), ...ev('0') }); h.page.onFieldRole({ ...tap({ key: 'original' }), ...ev('0') }); h.page.onFieldText({ ...tap({ key: 'original', field: 'label' }), ...ev('') }); assert.deepEqual(h.page._draft.form_fields, [original]); assert.equal(h.page.data.fields[0].readonly, true); assert.equal(h.writes().length, 0);
  }
});
test('preview supports the natural incomplete select draft workflow but no write or status handler can execute', async () => {
  const h = await loaded(async (a, p, fallback) => a === 'activity-manage-detail' ? detail({ activity: activity({ form_fields: [field({ type: 'textarea', role: null })] }) }) : fallback(a, p), { preview: true }); h.page.onFieldType({ ...tap({ key: 'original' }), ...ev('5') }); assert.equal(h.page._draft.form_fields[0].type, 'select'); assert.ok(h.page.data.validation); h.page.addOption(tap({ key: 'original' })); h.page.onOption({ ...tap({ key: 'original', index: 0 }), ...ev('本地选项') }); assert.equal(h.page.data.validation, ''); assert.equal(h.page.data.canSave, false); await h.page.save(); await h.page.remove(); await h.page.reconcile(); await h.page.setStatus(tap({ status: 'active' })); assert.equal(h.writes().length, 0); assert.equal(h.states().length, 0);
});
