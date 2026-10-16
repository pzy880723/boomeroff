const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram/pages/schedule-manage');
const SHOP = '00000000-0000-4000-8000-000000000901', ACTOR = '00000000-0000-4000-8000-000000000902';
const USER = '00000000-0000-4000-8000-000000000903', SHIFT = '00000000-0000-4000-8000-000000000904', SHIFT2 = '00000000-0000-4000-8000-000000000905', ASSIGN = '00000000-0000-4000-8000-000000000906', OTHER = '00000000-0000-4000-8000-000000000999';
const V1 = '1'.repeat(64), V2 = '2'.repeat(64), V3 = '3'.repeat(64), DATE = '2026-10-16', MONDAY = '2026-10-12', NOW = DATE + 'T09:30:00+08:00';
const clone = value => JSON.parse(JSON.stringify(value));
const error = (status, code) => Object.assign(new Error('private raw ' + code), { status, code });
const event = dataset => ({ currentTarget: { dataset } });
const input = value => ({ detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const caps = extra => ({ shop_id: SHOP, can_view: true, can_arrange: true, implemented_operations: ['create', 'update', 'delete'], existing_permissions: { shift_write: true, dayoff_write: false, swap: true, clear_week: true, ai_schedule: true }, server_time: NOW, ...extra });
const assignment = extra => ({ assignment_id: ASSIGN, shop_id: SHOP, user_id: USER, work_date: DATE, shift_code: 'AM', source: 'manual', version: V1, ...extra });
const weekRow = extra => ({ ...assignment(), display_name: '授权同事', shift_id: SHIFT, shift_status: 'resolved', shift_name: '早班', start_time: '09:00:00', end_time: '17:00:00', ...extra });
const week = extra => ({ shop_id: SHOP, week_start: MONDAY, week_end: '2026-10-18', week_version: V1, rows: [weekRow()], server_time: NOW, ...extra });
const shift = extra => ({ id: SHIFT, shop_id: SHOP, code: 'AM', name: '早班', start_time: '09:00:00', end_time: '17:00:00', version: V1, selectable: true, ...extra });
const cell = extra => ({ shop_id: SHOP, user_id: USER, work_date: DATE, assignment: assignment(), cell_version: V1, shifts: [shift(), shift({ id: SHIFT2, shop_id: null, code: 'PM', name: '晚班', start_time: '13:00:00', end_time: '21:00:00' })], warnings: [], rules_visible: true, can_save: true, can_delete: true, server_time: NOW, ...extra });
const candidates = extra => ({ shop_id: SHOP, work_date: DATE, items: [{ user_id: USER, display_name: '授权同事' }], next_cursor: null, has_more: false, ...extra });
const receipt = (p, extra) => ({ request_id: p.request_id, actor_id: ACTOR, shop_id: p.shop_id, user_id: p.user_id, work_date: p.work_date, operation: p.operation, assignment_id: p.assignment_id || ASSIGN, version: V2, deleted: p.operation === 'delete', recorded_at: NOW, replay: false, ...extra });
const status = (p, r = null, extra) => ({ shop_id: p.shop_id, request_id: p.request_id, operation: p.operation, user_id: p.user_id, work_date: p.work_date, state: r ? 'succeeded' : 'not_found', receipt: r, ...extra });
const back = p => cell({ assignment: p.operation === 'delete' ? null : assignment({ assignment_id: p.assignment_id || ASSIGN, shift_code: p.shift_id === SHIFT2 ? 'PM' : 'AM', version: V2 }), cell_version: V3, can_delete: p.operation !== 'delete' });
function model() { assert.ok(fs.existsSync(path.join(root, 'model.js')), 'new narrow schedule model exists'); return require(path.join(root, 'model')); }
function harness(handler, options = {}) {
  const filename = path.join(root, 'index.js'); assert.ok(fs.existsSync(filename), 'native management page exists');
  const env = options.env || { current: options.current === undefined ? { userId: ACTOR, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } : options.current, revision: 1 };
  const calls = [], modals = [], scrolls = [], viewCallbacks = [];
  const wx = { showModal(p) { modals.push(p); if (!options.manualModal) p.success({ confirm: true }); }, pageScrollTo(p) { scrolls.push(clone(p)); }, reLaunch(p) { wx.login = p.url; }, stopPullDownRefresh() {} };
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  app.api = { async action(action, params) { calls.push({ action, params: clone(params) }); return handler(action, params); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require(id) { if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; } return require(path.resolve(root, id)); },
    Page(value) { spec = value; }, getApp: () => app, wx, Date
  }, { filename });
  const page = Object.assign({}, spec, { data: clone(spec.data), setData(value, callback) { assert.notEqual(this._gone, true, 'setData must never render an unloaded page'); Object.assign(this.data, value); if (callback) { if (options.manualViewCallbacks) viewCallbacks.push(callback); else callback(); } } });
  return { page, calls, modals, scrolls, viewCallbacks, env, app, wx, async start(q = { week_start: MONDAY }) { await page.onLoad(q); await page.onShow(); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER, name: '另一授权门店' } }; } };
}
function defaults(action) { if (action === 'schedule-manage-capabilities') return caps(); if (action === 'schedule-manage-week') return week(); if (action === 'schedule-manage-candidates') return candidates(); if (action === 'schedule-manage-cell') return cell(); throw new Error('unexpected ' + action); }
async function loaded(handler = defaults, options) { const h = harness(handler, options); await h.start(); return h; }
async function editing(handler, options) { const h = await loaded(handler, options); await h.page.openAssignment(event({ id: ASSIGN })); return h; }
const writes = h => h.calls.filter(x => x.action === 'schedule-manage-write');

test('invalid week/identity/shop has zero API calls; no first/only-shop fallback', async () => {
  for (const q of [{ week_start: 'bad' }, { week_start: DATE }]) { const h = harness(defaults); await h.start(q); assert.equal(h.calls.length, 0); assert.ok(h.page.data.error); }
  for (const current of [null, { userId: ACTOR, shop: null, shops: [{ id: SHOP }] }, { userId: ACTOR, shop: { id: 'bad' } }, { userId: 'bad', shop: { id: SHOP } }]) { const h = await loaded(defaults, { current }); assert.equal(h.calls.length, 0); }
});

test('exact current capability controls read and arrange independently, not roles or permissions list', async () => {
  const h = await loaded(); assert.equal(h.page.data.canArrange, true); assert.equal(h.calls[0].action, 'schedule-manage-capabilities');
  const r = await loaded(a => a === 'schedule-manage-capabilities' ? caps({ can_arrange: false }) : defaults(a));
  assert.equal(r.page.data.days.length, 7); assert.equal(r.page.data.canArrange, false);
  await r.page.addDay(event({ date: DATE })); assert.equal(r.page.data.candidateVisible, false);
  await r.page.openAssignment(event({ id: ASSIGN })); await r.page.save(); await r.page.remove(); assert.equal(writes(r).length, 0);
  const no = await loaded(() => caps({ can_view: false, can_arrange: true })); assert.equal(no.calls.length, 1); assert.equal(no.page.data.days.length, 0);
});

test('week always renders seven real day groups and never invents times for unresolved/ambiguous rows', async () => {
  const rows = [weekRow(), weekRow({ assignment_id: OTHER, user_id: OTHER, work_date: '2026-10-18', display_name: null, shift_id: null, shift_status: 'ambiguous', shift_name: null, start_time: null, end_time: null })];
  const h = await loaded(a => a === 'schedule-manage-week' ? week({ rows }) : defaults(a));
  assert.equal(h.page.data.days.length, 7); assert.equal(h.page.data.days[6].date, '2026-10-18');
  const item = h.page.data.days[6].rows[0]; assert.match(item.name, new RegExp(OTHER)); assert.match(item.shiftText, /不唯一|冲突/); assert.doesNotMatch(item.shiftText, /09:00/);
});

test('caps/week/cell models reject malformed binding, flags, dates, versions and foreign shifts', () => {
  const m = model();
  for (const patch of [{ shop_id: OTHER }, { can_arrange: 'true' }, { can_view: null }, { server_time: 'bad' }, { implemented_operations: ['publish'] }]) assert.throws(() => m.caps(caps(patch), SHOP));
  for (const patch of [{ shop_id: OTHER }, { week_start: DATE }, { week_end: DATE }, { week_version: 'bad' }, { rows: [null] }, { rows: [weekRow({ shop_id: OTHER })] }, { rows: [weekRow({ work_date: '2026-10-19' })] }]) assert.throws(() => m.week(week(patch), SHOP, MONDAY));
  for (const patch of [{ shop_id: OTHER }, { user_id: OTHER }, { work_date: MONDAY }, { rules_visible: 1 }, { can_save: 1 }, { cell_version: 'bad' }, { shifts: [shift({ shop_id: OTHER })] }, { assignment: assignment({ user_id: OTHER }) }, { warnings: [{ code: 'private', level: 'soft', shift_id: null }] }]) assert.throws(() => m.cell(cell(patch), { shop_id: SHOP, user_id: USER, work_date: DATE }));
});

test('candidate literal query/codepoint40 and native cursor paging use exact current date and max20', async () => {
  const h = await loaded((a, p) => a === 'schedule-manage-candidates' ? candidates({ items: [{ user_id: p.cursor ? OTHER : USER, display_name: '候选' }], has_more: !p.cursor, next_cursor: p.cursor ? null : USER }) : defaults(a));
  await h.page.addDay(event({ date: DATE })); h.page.onQuery(input('  %_张  ')); await h.page.searchCandidates();
  assert.equal(h.calls.at(-1).params.q, '%_张'); assert.equal(h.calls.at(-1).params.work_date, DATE);
  await h.page.loadMoreCandidates(); assert.equal(h.calls.at(-1).params.cursor, USER); assert.equal(h.page.data.candidates.length, 2);
  const before = h.calls.length; h.page.onQuery(input('😀'.repeat(41))); await h.page.searchCandidates(); assert.equal(h.calls.length, before); assert.ok(h.page.data.error);
});

test('malformed/repeated candidate cursor cannot silently loop or replace prior page', async () => {
  const m = model(), p = { shop_id: SHOP, work_date: DATE, cursor: USER };
  for (const r of [candidates({ shop_id: OTHER }), candidates({ work_date: MONDAY }), candidates({ has_more: true, next_cursor: USER }), candidates({ has_more: true, next_cursor: null }), candidates({ has_more: false, next_cursor: USER }), candidates({ items: [{ user_id: 'bad', display_name: 'bad' }] })]) assert.throws(() => m.candidates(r, p));
});

test('creation chooses only server candidates; existing assignment fixes employee and date', async () => {
  const h = await loaded(a => a === 'schedule-manage-cell' ? cell({ assignment: null, can_delete: false }) : defaults(a));
  await h.page.addDay(event({ date: DATE })); await h.page.chooseCandidate(event({ id: OTHER })); assert.equal(h.page.data.editorVisible, false);
  await h.page.chooseCandidate(event({ id: USER })); assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.targetDate, DATE);
  const e = await editing(); assert.equal(e.page.data.targetDate, DATE); assert.equal(e.page.data.targetUser, USER);
  assert.equal(e.calls.at(-1).action, 'schedule-manage-cell');
});

test('selected-shift-specific soft warnings require current explicit acknowledgment; changing shift resets acknowledgment', async () => {
  const warnings = [{ code: 'day_off', shift_id: null, level: 'soft' }, { code: 'blocked_shift', shift_id: SHIFT2, level: 'soft' }];
  const h = await editing(a => a === 'schedule-manage-cell' ? cell({ warnings }) : defaults(a));
  h.page.chooseShift(event({ id: SHIFT2 })); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.visibleWarnings.length, 2);
  h.page.onWarnings(input(['day_off', 'blocked_shift'])); assert.equal(h.page.data.canSave, true);
  h.page.chooseShift(event({ id: SHIFT })); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.visibleWarnings.length, 1);
  h.page.onWarnings(input(['day_off'])); assert.equal(h.page.data.canSave, true);
});

test('hard occupancy blocks writes without revealing another shop and unselectable duplicate-code shifts stay disabled', async () => {
  const h = await editing(a => a === 'schedule-manage-cell' ? cell({ assignment: null, can_save: false, can_delete: false, warnings: [{ code: 'occupied_other_shop', shift_id: null, level: 'hard', other_shop_name: 'SECRET' }], shifts: [shift({ selectable: false }), shift({ id: SHIFT2, shop_id: null, selectable: false })] }) : defaults(a));
  h.page.chooseShift(event({ id: SHIFT })); await h.page.save(); await h.page.remove();
  assert.equal(writes(h).length, 0); assert.equal(h.page.data.canSave, false); assert.doesNotMatch(JSON.stringify(h.page.data), /SECRET/); assert.match(h.page.data.notice, /其他门店/);
});

for (const operation of ['create', 'update', 'delete']) test(operation + ' requires an explicit original-to-new modal, exact receipt and cell readback', async () => {
  let sent;
  const h = await loaded((a, p) => {
    if (a === 'schedule-manage-write') { sent = p; return receipt(p); }
    if (a === 'schedule-manage-cell') return sent ? back(sent) : cell({ assignment: operation === 'create' ? null : assignment(), can_delete: operation !== 'create' });
    return defaults(a);
  });
  if (operation === 'create') { await h.page.addDay(event({ date: DATE })); await h.page.chooseCandidate(event({ id: USER })); } else await h.page.openAssignment(event({ id: ASSIGN }));
  if (operation !== 'delete') h.page.chooseShift(event({ id: SHIFT2 }));
  await (operation === 'delete' ? h.page.remove() : h.page.save());
  assert.equal(sent.operation, operation); assert.equal(sent.shop_id, SHOP); assert.equal(sent.user_id, USER); assert.equal(sent.work_date, DATE); assert.equal(sent.expected_cell_version, V1);
  assert.equal(sent.assignment_id, operation === 'create' ? null : ASSIGN); assert.equal(sent.shift_id, operation === 'delete' ? null : SHIFT2); assert.deepEqual(clone(sent.acknowledged_warnings), []);
  assert.deepEqual(Object.keys(sent).sort(), ['shop_id', 'request_id', 'operation', 'user_id', 'work_date', 'assignment_id', 'expected_cell_version', 'shift_id', 'acknowledged_warnings'].sort());
  assert.match(h.modals[0].content, /授权门店/); assert.match(h.modals[0].content, /授权同事/); assert.match(h.modals[0].content, /2026-10-16/); assert.match(h.modals[0].content, /立即生效/);
  if (operation === 'delete') assert.match(h.modals[0].content, /不.*休息|不.*请假/);
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.loading, false); assert.equal(h.page.data.sending, false); assert.equal(Object.keys(model().ram(h.app)).length, 0);
});

test('receipt parser binds actor/request/shop/user/date/op/assignment/version/deletion/timestamp/replay', () => {
  const m = model(), p = { shop_id: SHOP, request_id: OTHER, user_id: USER, work_date: DATE, operation: 'update', assignment_id: ASSIGN, shift_id: SHIFT2, expected_cell_version: V1, acknowledged_warnings: [] };
  for (const patch of [{ actor_id: USER }, { request_id: USER }, { shop_id: OTHER }, { user_id: OTHER }, { work_date: MONDAY }, { operation: 'create' }, { assignment_id: OTHER }, { version: 'bad' }, { deleted: true }, { recorded_at: '2026-02-30T00:00:00Z' }, { replay: 1 }]) assert.throws(() => m.receipt(receipt(p, patch), p, ACTOR));
});

for (const mismatch of ['assignment', 'version', 'shift', 'occupied', 'timeout']) test('readback ' + mismatch + ' never declares success; confirmed receipt is only read again', async () => {
  let sent;
  const h = await editing((a, p) => {
    if (a === 'schedule-manage-write') { sent = p; return receipt(p); }
    if (a === 'schedule-manage-cell' && sent) {
      if (mismatch === 'timeout') throw Error('timeout');
      const r = back(sent);
      if (mismatch === 'assignment') r.assignment.assignment_id = OTHER;
      if (mismatch === 'version') r.assignment.version = V1;
      if (mismatch === 'shift') r.assignment.shift_code = 'AM';
      if (mismatch === 'occupied') r.warnings = [{ code: 'occupied_other_shop', level: 'hard', shift_id: null }];
      return r;
    }
    return defaults(a);
  });
  h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save();
  assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, true); assert.ok(h.page.data.readbackError);
  await h.page.retryReadback(); await h.page.save(); assert.equal(writes(h).length, 1);
});

for (const mode of ['version', 'timeout', 'receipt']) test('failure ' + mode + ' preserves selected shift and never automatically resends', async () => {
  const h = await editing((a, p) => { if (a === 'schedule-manage-write') { if (mode === 'receipt') return receipt(p, { actor_id: OTHER }); throw mode === 'version' ? error(409, 'version_conflict') : Error('timeout'); } return defaults(a); });
  h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save(); assert.equal(h.page.data.selectedShift, SHIFT2); assert.equal(h.page.data.saved, false);
  await h.page.save(); assert.equal(writes(h).length, 1);
  if (mode === 'version') { assert.equal(h.page.data.conflict, true); await h.page.refresh(); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.selectedShift, SHIFT2); await h.page.reloadLatest(); assert.equal(h.page.data.conflict, false); }
});

for (const kind of ['cancel', 'edit', 'hide', 'unload', 'user', 'shop', 'revision']) test('stale final confirmation after ' + kind + ' cannot mutate', async () => {
  const h = await editing(undefined, { manualModal: true }); h.page.chooseShift(event({ id: SHIFT2 })); const save = h.page.save();
  await tick();
  assert.equal(h.modals.length, 1);
  if (kind === 'edit') h.page.chooseShift(event({ id: SHIFT })); else if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else if (kind !== 'cancel') h.change(kind);
  h.modals[0].success({ confirm: kind !== 'cancel' }); await save; assert.equal(writes(h).length, 0);
});

test('dirty editor closes only after confirmation and never mutates', async () => {
  const h = await editing(undefined, { manualModal: true }); h.page.chooseShift(event({ id: SHIFT2 })); const close = h.page.cancelEditor();
  assert.equal(h.page.data.editorVisible, true); h.modals[0].success({ confirm: false }); await close; assert.equal(h.page.data.editorVisible, true);
  const again = h.page.cancelEditor(); h.modals[1].success({ confirm: true }); await again; assert.equal(h.page.data.editorVisible, false); assert.equal(writes(h).length, 0);
});

async function uncertain(options) {
  const h = await editing((a, p) => a === 'schedule-manage-write' ? Promise.reject(Error('timeout')) : defaults(a), options);
  h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save(); return h;
}

test('unknown immutable RAM record has no names/disk data and restores only after fresh capabilities', async () => {
  const h = await uncertain(), memory = model().ram(h.app), record = Object.values(memory)[0], original = clone(record.payload);
  assert.equal(record.unknown, true); assert.doesNotMatch(JSON.stringify(memory), /授权同事|授权门店|晚班|早班/);
  assert.ok(Object.isFrozen(record.payload)); assert.ok(Object.isFrozen(record.payload.acknowledged_warnings));
  h.page.onUnload(); const next = await loaded(defaults, { env: h.env });
  assert.equal(next.calls[0].action, 'schedule-manage-capabilities'); assert.equal(next.page.data.pendingRequests.length, 1);
  await next.page.resume(event({ index: 0 })); assert.equal(next.page.data.pending, true); assert.equal(next.page.data.canSave, false);
  assert.deepEqual(clone(record.payload), original); assert.equal(writes(next).length, 0);
  const outsider = await loaded(defaults, { current: { userId: OTHER, shop: { id: SHOP } } }); outsider.app._scheduleManagePending = memory; await outsider.page.refresh(); assert.equal(outsider.page.data.pendingRequests.length, 0);
});

test('status not_found preserves original request; explicit same-key retry uses byte-identical frozen payload', async () => {
  const h = await uncertain(), record = Object.values(model().ram(h.app))[0], original = clone(record.payload);
  h.page.api.action = async (a, p) => { h.calls.push({ action: a, params: clone(p) }); if (a === 'schedule-manage-write-status') return status(p); if (a === 'schedule-manage-write') throw error(409, 'version_conflict'); return defaults(a); };
  await h.page.reconcile(); assert.equal(h.calls.at(-1).action, 'schedule-manage-write-status'); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.canRetrySame, true);
  assert.match(h.page.data.notice, /不代表未执行/);
  await h.page.retrySame(); assert.deepEqual(writes(h).at(-1).params, original); assert.equal(Object.values(model().ram(h.app))[0], record); assert.equal(record.unknown, true);
});

test('status succeeds then exact delete empty-cell readback clears RAM without comparing deleted-row version to empty-cell version', async () => {
  const h = await editing((a, p) => a === 'schedule-manage-write' ? Promise.reject(Error('timeout')) : defaults(a)); await h.page.remove();
  const record = Object.values(model().ram(h.app))[0];
  h.page.api.action = async (a, p) => a === 'schedule-manage-write-status' ? status(p, receipt(record.payload, { replay: true })) : a === 'schedule-manage-cell' ? back(record.payload) : defaults(a);
  await h.page.reconcile(); assert.equal(h.page.data.saved, true); assert.equal(h.page.data.loading, false); assert.equal(Object.keys(model().ram(h.app)).length, 0);
});

test('status wrapper mismatches or missing receipt never erase an uncertain request', () => {
  const m = model(), p = { shop_id: SHOP, request_id: OTHER, user_id: USER, work_date: DATE, operation: 'delete', assignment_id: ASSIGN };
  for (const r of [status(p, null, { shop_id: OTHER }), status(p, null, { user_id: OTHER }), status(p, null, { operation: 'create' }), status(p, null, { work_date: MONDAY }), status(p, null, { request_id: USER }), status(p, null, { state: 'succeeded' }), status(p, receipt(p), { state: 'not_found' })]) assert.throws(() => m.status(r, p, ACTOR));
});

test('loss of arrangement permission hides recovery controls but never erases RAM', async () => {
  const h = await uncertain(); h.page.onHide(); const n = await loaded(a => a === 'schedule-manage-capabilities' ? caps({ can_arrange: false }) : defaults(a), { env: h.env });
  assert.equal(n.page.data.pendingRequests.length, 0); await n.page.reconcile(); assert.equal(n.calls.some(c => c.action === 'schedule-manage-write-status'), false); assert.equal(Object.keys(model().ram(n.app)).length, 1);
});

for (const kind of ['hide', 'unload', 'user', 'shop', 'revision']) test('late write after ' + kind + ' cannot paint data or run readback and preserves original RAM', async () => {
  const d = deferred(); let payload;
  const h = await editing((a, p) => { if (a === 'schedule-manage-write') { payload = p; return d.promise; } return defaults(a); });
  h.page.chooseShift(event({ id: SHIFT2 })); const save = h.page.save(); await tick(); const before = h.calls.length;
  if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
  d.resolve(receipt(payload)); await save; assert.equal(h.calls.length, before); assert.equal(h.page.data.saved, false); assert.equal(Object.keys(model().ram(h.app)).length, 1);
  if (kind === 'hide' || kind === 'unload') { assert.deepEqual(clone(h.page.data.days), []); assert.equal(h.page.data.targetName, ''); }
});

test('old 401 cannot sign out a new actor; current 401 clears private UI and uses shared handler', async () => {
  const d = deferred(); const h = await editing((a, p) => a === 'schedule-manage-write' ? d.promise : defaults(a)); h.page.chooseShift(event({ id: SHIFT2 })); const save = h.page.save(); await tick();
  h.change('user'); d.reject(error(401, 'unauthorized')); await save; assert.equal(h.env.current.userId, OTHER); assert.equal(h.wx.login, undefined);
  const current = await editing((a, p) => a === 'schedule-manage-write' ? Promise.reject(error(401, 'unauthorized')) : defaults(a)); current.page.chooseShift(event({ id: SHIFT2 })); await current.page.save(); assert.equal(current.env.current, null); assert.equal(current.wx.login, '/pages/login/index'); assert.deepEqual(clone(current.page.data.days), []);
});

test('preview direct write/status/retry handlers make zero mutation/status calls', async () => {
  const h = await editing(undefined, { preview: true }); h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save(); await h.page.remove(); await h.page.reconcile(); await h.page.retrySame();
  assert.equal(h.calls.some(c => /write/.test(c.action)), false); assert.equal(h.page.data.canSave, false);
});

test('native quartet uses dynamic WXML bindings, no H5/publish or disk persistence and reachable editor close', () => {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, 'index.' + ext)));
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'), js = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  for (const match of wxml.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
  assert.match(wxml, /bindtap="cancelEditor"/); assert.match(wxml, /即时|立即生效/); assert.match(wxml, /preview/); assert.match(wxml, /加载更多/);
  assert.doesNotMatch(wxml, /<web-view|\.includes\(|&amp;&amp;/); assert.doesNotMatch(js, /setStorage|wx\.request|supabase|service_role/);
});

test('onLoad followed immediately by onShow starts exactly one authorized week read', async () => {
  const d = deferred(), h = harness(a => a === 'schedule-manage-week' ? d.promise : defaults(a));
  h.page.onLoad({ week_start: MONDAY }); const first = h.page.onShow(), second = h.page.onShow(); await tick();
  assert.equal(h.calls.filter(c => c.action === 'schedule-manage-capabilities').length, 1);
  assert.equal(h.calls.filter(c => c.action === 'schedule-manage-week').length, 1);
  d.resolve(week()); await first; await second; assert.equal(h.page.data.loading, false);
});

test('editing a candidate query invalidates old results and late responses without issuing a new request', async () => {
  const d = deferred(); let searches = 0;
  const h = await loaded(a => a === 'schedule-manage-candidates' ? (++searches === 1 ? candidates() : d.promise) : defaults(a));
  await h.page.addDay(event({ date: DATE })); h.page.onQuery(input('旧查询')); const old = h.page.searchCandidates();
  const count = h.calls.length; h.page.onQuery(input('新查询'));
  assert.equal(h.calls.length, count); assert.equal(h.page.data.candidates.length, 0); assert.equal(h.page.data.candidateMore, false);
  d.resolve(candidates()); await old;
  assert.equal(h.page.data.candidates.length, 0); await h.page.chooseCandidate(event({ id: USER })); assert.equal(h.page.data.editorVisible, false);
});

test('a failed refresh of an existing editor cannot reactivate cached cell write authority', async () => {
  let fail = false;
  const h = await editing(a => a === 'schedule-manage-cell' && fail ? Promise.reject(error(500, 'db_error')) : defaults(a));
  h.page.chooseShift(event({ id: SHIFT2 })); assert.equal(h.page.data.canSave, true); fail = true;
  await h.page.refresh(); assert.equal(h.page.data.selectedShift, SHIFT2); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  await h.page.save(); assert.equal(writes(h).length, 0); fail = false; await h.page.refresh(); assert.equal(h.page.data.canSave, true);
});

test('fresh final capability denial immediately renders reader-only controls and makes zero writes', async () => {
  let deny = false;
  const h = await editing(a => a === 'schedule-manage-capabilities' ? caps({ can_arrange: !deny }) : defaults(a));
  h.page.chooseShift(event({ id: SHIFT2 })); deny = true; await h.page.save();
  assert.equal(h.page.data.canArrange, false); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false); assert.equal(h.modals.length, 0); assert.equal(writes(h).length, 0);
});

test('only exact first-never-unknown RPC abort pairs release RAM and every released draft requires a full fresh cell', async () => {
  const pairs = [[400, 'invalid_params'], [404, 'not_found'], [409, 'version_conflict'], [409, 'occupied_other_shop'], [409, 'shift_ambiguous'], [409, 'warnings_unacknowledged'], [422, 'invalid_shift']];
  for (const [statusCode, code] of pairs) {
    let broken = false;
    const h = await editing((a) => a === 'schedule-manage-write' ? Promise.reject(error(statusCode, code)) : a === 'schedule-manage-cell' && broken ? Promise.reject(error(500, 'db_error')) : defaults(a));
    h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save();
    assert.equal(Object.keys(model().ram(h.app)).length, 0, code); assert.equal(h.page.data.pending, false); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.selectedShift, SHIFT2); assert.equal(h.page.data.canSave, false);
    assert.match(h.page.data.notice, /明确.*拒绝|版本.*变化/);
    await h.page.save(); assert.equal(writes(h).length, 1);
    broken = true; await h.page.refresh(); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
    broken = false; await h.page.refresh();
    assert.equal(h.page.data.canSave, code !== 'version_conflict');
    if (code === 'version_conflict') { h.page.render(); assert.equal(h.page.data.conflict, true); await h.page.reloadLatest(); assert.equal(h.page.data.conflict, false); }
  }
});

test('wrong status/code pairs, auth, transport, server and conflicting key never release an uncertain RAM slot', async () => {
  const errors = [error(500, 'invalid_params'), error(400, 'not_found'), error(404, 'invalid_shift'), error(422, 'version_conflict'), error(409, 'request_id_conflict'), error(500, 'db_error'), error(403, 'forbidden'), Error('timeout')];
  for (const e of errors) {
    const h = await editing(a => a === 'schedule-manage-write' ? Promise.reject(e) : defaults(a)); h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save();
    assert.equal(Object.keys(model().ram(h.app)).length, 1); assert.equal(Object.values(model().ram(h.app))[0].unknown, true); assert.equal(h.page.data.saved, false);
  }
});

for (const restored of [false, true]) test((restored ? 'restored' : 'historically unknown') + ' request never releases on a later otherwise-definitive rejection', async () => {
  const initial = await uncertain(), record = Object.values(model().ram(initial.app))[0], original = clone(record.payload);
  let h = initial;
  if (restored) { initial.page.onUnload(); h = await loaded(defaults, { env: initial.env }); await h.page.resume(event({ index: 0 })); }
  h.page.api.action = async (a, p) => a === 'schedule-manage-write-status' ? status(p) : a === 'schedule-manage-write' ? Promise.reject(error(404, 'not_found')) : defaults(a);
  await h.page.reconcile(); await h.page.retrySame();
  assert.equal(Object.values(model().ram(h.app))[0], record); assert.deepEqual(clone(record.payload), original); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true);
});

for (const restore of ['hide', 'unload']) test('confirmed receipt restored after ' + restore + ' clears only its RAM and finishes loading before epoch changes', async () => {
  let sent, readFails = true;
  const handler = (a, p) => { if (a === 'schedule-manage-write') { sent = p; return receipt(p); } if (a === 'schedule-manage-cell' && sent) { if (readFails) throw error(500, 'db_error'); return back(sent); } return defaults(a); };
  let h = await editing(handler); h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save();
  assert.equal(h.page.data.receiptConfirmed, true); const record = Object.values(model().ram(h.app))[0]; readFails = false;
  if (restore === 'hide') { h.page.onHide(); await h.page.onShow(); } else { h.page.onUnload(); h = await loaded(handler, { env: h.env }); await h.page.resume(event({ index: 0 })); }
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.loading, false); assert.equal(h.page.data.sending, false); assert.equal(h.page.data.editorVisible, false); assert.equal(Object.keys(model().ram(h.app)).length, 0); assert.ok(record.receipt);
});

for (const kind of ['hide', 'unload', 'user', 'shop', 'revision']) test('late week read after ' + kind + ' never installs private rows or continues into a cell', async () => {
  const d = deferred(), h = harness(a => a === 'schedule-manage-week' ? d.promise : defaults(a)); const load = h.start(); await tick(); const before = h.calls.length;
  if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
  d.resolve(week()); await load; assert.equal(h.calls.length, before); assert.equal(h.page.data.days.length, 0); assert.equal(h.page.data.targetName, '');
});

test('actual labeled preview DTOs render seven days, current assignment and shift-specific warnings with zero writes/status', async () => {
  const p = require('../miniprogram/shared/preview').createPreview({}), current = p.session.get();
  const h = await loaded((a, params) => p.api.action(a, params), { preview: true, current });
  assert.equal(h.page.data.error, ''); assert.equal(h.page.data.days.length, 7);
  const own = h.page.data.days[4].rows[0], peer = h.page.data.days[6].rows[0];
  assert.ok(own); assert.ok(peer); await h.page.openAssignment(event({ id: peer.assignment_id }));
  assert.equal(h.page.data.error, ''); assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.visibleWarnings[0].code, 'fixed_rest_weekday');
  assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false); await h.page.save(); await h.page.remove(); await h.page.reconcile();
  assert.equal(h.calls.some(c => /write/.test(c.action)), false);
});

test('confirmed original cell remains successful if the subsequent week-list refresh fails', async () => {
  let sent;
  const h = await editing((a, p) => { if (a === 'schedule-manage-write') { sent = p; return receipt(p); } if (a === 'schedule-manage-cell' && sent) return back(sent); if (a === 'schedule-manage-week' && sent) throw error(500, 'db_error'); return defaults(a); });
  h.page.chooseShift(event({ id: SHIFT2 })); await h.page.save();
  assert.equal(h.page.data.saved, true); assert.equal(Object.keys(model().ram(h.app)).length, 0); assert.equal(h.page.data.loading, false);
  assert.match(h.page.data.error, /周列表.*刷新/); assert.doesNotMatch(h.page.data.error, /操作未确认/); assert.equal(writes(h).length, 1);
});

test('unload never renders after the shared wrapper sets gone and still clears private state without losing RAM', async () => {
  const h = await uncertain(), record = Object.values(model().ram(h.app))[0], original = clone(record.payload);
  h.page.onUnload();
  assert.equal(h.page._gone, true); assert.equal(h.page._visible, false); assert.equal(h.page._target, null); assert.equal(h.page._cell, null); assert.equal(h.page._draft, null);
  assert.equal(Object.values(model().ram(h.app))[0], record); assert.deepEqual(clone(record.payload), original);
});

test('hidden late write never renders during identity synchronization and never reads back or signs out the new actor', async () => {
  const d = deferred();
  const h = await editing(a => a === 'schedule-manage-write' ? d.promise : defaults(a)); h.page.chooseShift(event({ id: SHIFT2 })); const send = h.page.save(); await tick();
  const record = Object.values(model().ram(h.app))[0], original = clone(record.payload);
  h.page.onHide(); h.change('user'); const before = h.calls.length;
  h.page.setData = () => assert.fail('hidden late callback must not render');
  d.reject(error(401, 'unauthorized')); await send;
  assert.equal(h.calls.length, before); assert.equal(h.env.current.userId, OTHER); assert.equal(h.wx.login, undefined); assert.equal(h.page._target, null); assert.equal(h.page._draft, null);
  assert.equal(Object.values(model().ram(h.app))[0], record); assert.deepEqual(clone(record.payload), original);
});

test('current never renders when identity changed after the shared wrapper marked the page gone', async () => {
  const h = await editing(), c = h.page.capture(); h.page._gone = true; h.change('revision');
  assert.equal(h.page.current(c), false); assert.equal(h.page._target, null); assert.equal(h.page._cell, null); assert.equal(h.page._draft, null);
});

test('successful native candidate and cell panels scroll into view after rendering, not on ordinary draft changes', async () => {
  const h = await loaded(); assert.equal(h.scrolls.length, 0); await h.page.addDay(event({ date: DATE }));
  assert.equal(h.scrolls.length, 1, 'the rendered candidate panel must be scrolled into view');
  assert.equal(h.scrolls.at(-1).selector, '#manager-candidates'); assert.equal(h.page.data.candidateVisible, true);
  await h.page.chooseCandidate(event({ id: USER })); assert.equal(h.scrolls.at(-1).selector, '#manager-editor'); assert.equal(h.page.data.editorVisible, true);
  const count = h.scrolls.length; h.page.chooseShift(event({ id: SHIFT2 })); assert.equal(h.scrolls.length, count);
  const direct = await editing(); assert.equal(direct.scrolls.at(-1).selector, '#manager-editor');
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); assert.match(wxml, /id="manager-candidates"/); assert.match(wxml, /id="manager-editor"/);
});

test('failed candidate/cell reads never scroll to an unverified panel', async () => {
  for (const action of ['schedule-manage-candidates', 'schedule-manage-cell']) {
    const h = await loaded(a => a === action ? Promise.reject(error(500, 'db_error')) : defaults(a));
    if (action === 'schedule-manage-candidates') await h.page.addDay(event({ date: DATE })); else await h.page.openAssignment(event({ id: ASSIGN }));
    assert.equal(h.scrolls.length, 0); assert.ok(h.page.data.error);
  }
});

test('late panel responses after hide/unload/identity changes cannot scroll', async () => {
  for (const action of ['schedule-manage-candidates', 'schedule-manage-cell']) for (const kind of ['hide', 'unload', 'user', 'shop', 'revision']) {
    const d = deferred(), h = await loaded(a => a === action ? d.promise : defaults(a));
    const read = action === 'schedule-manage-candidates' ? h.page.addDay(event({ date: DATE })) : h.page.openAssignment(event({ id: ASSIGN }));
    await tick(); if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
    d.resolve(action === 'schedule-manage-candidates' ? candidates() : cell()); await read; assert.equal(h.scrolls.length, 0, action + ':' + kind);
  }
});

test('deferred native render callbacks recheck visible scope and candidate query before scrolling', async () => {
  for (const panel of ['candidates', 'cell']) for (const kind of ['hide', 'unload', 'user', 'shop', 'revision', 'close']) {
    const h = await loaded(defaults, { manualViewCallbacks: true });
    if (panel === 'candidates') await h.page.addDay(event({ date: DATE })); else await h.page.openAssignment(event({ id: ASSIGN }));
    assert.equal(h.scrolls.length, 0);
    if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else if (kind === 'close') { if (panel === 'candidates') h.page.closeCandidates(); else await h.page.cancelEditor(); } else h.change(kind);
    h.viewCallbacks.splice(0).forEach(callback => callback()); assert.equal(h.scrolls.length, 0, panel + ':' + kind);
  }
  const h = await loaded(defaults, { manualViewCallbacks: true }); await h.page.addDay(event({ date: DATE })); h.page.onQuery(input('changed'));
  h.viewCallbacks.splice(0).forEach(callback => callback()); assert.equal(h.scrolls.length, 0);
});

async function deletedUnavailable(confirmed) {
  let sent, readable = false;
  const handler = (a, p) => {
    if (a === 'schedule-manage-write') { sent = p; if (!confirmed) throw Error('timeout after possible delete'); return receipt(p); }
    if (a === 'schedule-manage-week' && sent) return week({ rows: [] });
    if (a === 'schedule-manage-cell') { if (!sent) return cell({ can_save: false, can_delete: true }); if (!readable) throw error(404, 'not_found'); return back(sent); }
    if (a === 'schedule-manage-write-status') return status(p, receipt(sent, { replay: true }));
    return defaults(a);
  };
  const h = await editing(handler); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, true); await h.page.remove();
  return { h, handler, readable() { readable = true; } };
}

for (const confirmed of [true, false]) for (const lifecycle of ['hide', 'unload']) test((confirmed ? 'confirmed' : 'unknown') + ' delete restores recovery after ' + lifecycle + ' even when the suspended target cell returns 404', async () => {
  const state = await deletedUnavailable(confirmed); let h = state.h;
  const memory = model().ram(h.app), record = Object.values(memory)[0], original = clone(record.payload);
  assert.equal(h.page.data.saved, false); assert.equal(record.payload.operation, 'delete');
  if (lifecycle === 'hide') { h.page.onHide(); await h.page.onShow(); } else { h.page.onUnload(); h = await loaded(state.handler, { env: h.env }); await h.page.resume(event({ index: 0 })); }
  assert.equal(h.calls[0].action, 'schedule-manage-capabilities'); assert.equal(h.page.data.pending, true); assert.equal(h.page._pending, record);
  assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.cellReadable, false); assert.equal(h.page.data.targetUser, USER); assert.equal(h.page.data.targetDate, DATE);
  assert.equal(h.page.data.receiptConfirmed, confirmed); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false); assert.equal(h.page.data.loading, false);
  const before = h.calls.length; await h.page.reconcile();
  const requests = h.calls.slice(before); assert.equal(requests[0].action, 'schedule-manage-capabilities');
  assert.equal(requests.filter(c => c.action === 'schedule-manage-write-status').length, confirmed ? 0 : 1);
  assert.equal(requests.filter(c => c.action === 'schedule-manage-cell').length, 1);
  assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, true); assert.ok(h.page.data.readbackError); assert.equal(h.page.data.editorVisible, true);
  assert.equal(Object.values(memory)[0], record); assert.deepEqual(clone(record.payload), original); assert.equal(requests.some(c => c.action === 'schedule-manage-write'), false);
  state.readable(); await h.page.retryReadback(); assert.equal(h.page.data.saved, true); assert.equal(h.page.data.loading, false); assert.equal(Object.keys(memory).length, 0);
});

for (const permission of ['view', 'arrange']) test('unreadable delete recovery still requires fresh ' + permission + ' capability and never consumes RAM on denial', async () => {
  const { h } = await deletedUnavailable(false), record = Object.values(model().ram(h.app))[0]; h.page.onUnload();
  const next = await loaded(a => a === 'schedule-manage-capabilities' ? caps({ can_view: permission !== 'view', can_arrange: permission !== 'arrange' }) : a === 'schedule-manage-week' ? week({ rows: [] }) : Promise.reject(error(404, 'not_found')), { env: h.env });
  await next.page.resume(event({ index: 0 })); await next.page.reconcile(); await next.page.retryReadback();
  assert.equal(next.page.data.pendingRequests.length, 0); assert.equal(next.page.data.editorVisible, false); assert.equal(!!next.page._pending, false);
  assert.equal(next.calls.some(c => c.action === 'schedule-manage-write-status' || c.action === 'schedule-manage-cell' || c.action === 'schedule-manage-write'), false); assert.equal(Object.values(model().ram(next.app))[0], record);
});

for (const context of ['user', 'shop']) test('unreadable delete RAM is invisible and cannot be adopted by a foreign ' + context, async () => {
  const { h } = await deletedUnavailable(false), record = Object.values(model().ram(h.app))[0]; h.page.onUnload(); h.change(context);
  const shop = h.env.current.shop.id;
  const next = await loaded(a => a === 'schedule-manage-capabilities' ? caps({ shop_id: shop }) : a === 'schedule-manage-week' ? week({ shop_id: shop, rows: [] }) : Promise.reject(error(404, 'not_found')), { env: h.env });
  assert.equal(next.page.data.pendingRequests.length, 0); await next.page.resume(event({ index: 0 })); await next.page.reconcile();
  assert.equal(next.page.data.editorVisible, false); assert.equal(next.calls.some(c => c.action === 'schedule-manage-write-status' || c.action === 'schedule-manage-cell' || c.action === 'schedule-manage-write'), false);
  assert.equal(Object.values(model().ram(next.app))[0], record);
});

test('unreadable cell plus status not_found never proves deletion or offers a resend', async () => {
  const { h, handler } = await deletedUnavailable(false), record = Object.values(model().ram(h.app))[0], original = clone(record.payload);
  h.page.onHide(); await h.page.onShow(); h.page.api.action = async (a, p) => { h.calls.push({ action: a, params: clone(p) }); return a === 'schedule-manage-write-status' ? status(p) : handler(a, p); };
  const before = writes(h).length; await h.page.reconcile();
  assert.equal(h.calls.at(-1).action, 'schedule-manage-write-status'); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false);
  assert.equal(h.page.data.canRetrySame, false); await h.page.retrySame(); await h.page.save(); await h.page.remove();
  assert.equal(writes(h).length, before); assert.equal(Object.values(model().ram(h.app))[0], record); assert.deepEqual(clone(record.payload), original);
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); assert.match(wxml, /wx:if="\{\{cellReadable\}\}"/); assert.match(wxml, /不.*证明.*删除/);
});
