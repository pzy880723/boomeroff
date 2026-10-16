const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const file = path.resolve(__dirname, '../miniprogram/shared/activity-form.js');
function h() { assert.ok(fs.existsSync(file), 'pure activity form helper exists'); return require(file); }
const voucher = '00000000-0000-4000-8000-000000000021';
const field = (patch = {}) => ({ key: 'original-key', label: '主页截图', type: 'image', required: true, role: 'profile_screenshot', placeholder: '原提示', options: ['原选项'], future: { nested: [null, { retained: true }] }, ...patch });
const base = (patch = {}) => ({ id: 'activity-private-id', shop_id: 'original-shop', created_by: 'actor', created_at: '2026-10-01T00:00:00Z', share_token: 'never-send', name: '原活动', description: null, voucher_id: voucher, status: 'closed', requires_review: true, starts_at: '2026-10-16T01:02:03.123456+00:00', ends_at: '2026-10-17T01:02:03.654321+00:00', min_followers: 1000, form_fields: [field()], future_activity: { keep: [1, null] }, ...patch });
const invalid = fn => assert.throws(fn, error => error.code === 'invalid_params' && typeof error.message === 'string' && !!error.message);

test('JSON clone keeps every nested key/null/array value and edits never alias the original', () => {
  const m = h(), original = base(), copy = m.cloneJson(original); assert.deepEqual(copy, original); assert.notEqual(copy, original); assert.notEqual(copy.form_fields[0].future, original.form_fields[0].future);
  copy.form_fields[0].future.nested[1].retained = false; assert.equal(original.form_fields[0].future.nested[1].retained, true);
});
test('JSON clone preserves explicit proto-like own metadata without modifying object prototypes', () => {
  const m = h(), original = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"nested":{"prototype":"literal"}}'), copy = m.cloneJson(original);
  assert.equal(Object.prototype.hasOwnProperty.call(copy, '__proto__'), true); assert.equal(copy.__proto__.polluted, true); assert.equal(Object.getPrototypeOf(copy), Object.prototype); assert.equal({}.polluted, undefined); assert.deepEqual(JSON.parse(JSON.stringify(copy)), original);
});
test('undefined is not silently dropped or converted to NULL, including nested values and array holes', () => {
  const m = h(); assert.equal(m.cloneJson(null), null); assert.deepEqual(m.cloneJson({ absent: null }), { absent: null });
  for (const value of [undefined, { x: undefined }, [undefined], Array(1), { x: NaN }, Infinity, { x: () => 1 }, new Date(), { x: Symbol('x') }]) invalid(() => m.cloneJson(value));
  const cycle = {}; cycle.self = cycle; invalid(() => m.cloneJson(cycle));
});
test('an unchanged whole row yields an empty patch, not raw identity/tokens/metadata or forced review/status', () => {
  const m = h(), original = base(); assert.deepEqual(m.changedPatch(original, m.cloneJson(original)), {}); assert.equal(original.status, 'closed'); assert.equal(original.requires_review, true);
  const patch = m.changedPatch(original, { name: '新名称' }); assert.deepEqual(patch, { name: '新名称' }); assert.doesNotMatch(JSON.stringify(patch), /actor|share_token|created|future_activity|requires_review|form_fields|starts_at|ends_at/);
});
test('missing draft properties mean untouched while explicit nullable description clearing is distinct', () => {
  const m = h(), original = base({ description: '旧描述' }); assert.deepEqual(m.changedPatch(original, {}), {}); assert.deepEqual(m.changedPatch(original, { description: null }), { description: null }); assert.deepEqual(m.changedPatch(original, { description: '  ' }), { description: null });
  invalid(() => m.changedPatch(original, { description: undefined })); invalid(() => m.changedPatch(original, { name: null })); assert.deepEqual(m.changedPatch(base(), { description: null }), {});
});
test('only explicitly editable top-level changes are returned; forbidden changes raise rather than disappear', () => {
  const m = h(), original = base(); for (const patch of [{ id: 'other' }, { shop_id: null }, { created_by: 'someone' }, { requires_review: false }, { future_activity: null }, JSON.parse('{"__proto__":{"polluted":true}}')]) invalid(() => m.changedPatch(original, patch));
  assert.deepEqual(m.changedPatch(original, { requires_review: true, status: 'closed', future_activity: { keep: [1, null] } }), {});
});
test('changed names are trimmed, nonempty, Unicode50 bounded, and overlong original names remain untouched', () => {
  const m = h(); assert.deepEqual(m.changedPatch(base(), { name: '  ' + '😀'.repeat(50) + '  ' }), { name: '😀'.repeat(50) });
  for (const name of ['', '  ', '😀'.repeat(51), 1, null, 'a\0b', '\ud800']) invalid(() => m.changedPatch(base(), { name }));
  const original = base({ name: 'x'.repeat(80) }); assert.deepEqual(m.changedPatch(original, { description: '新描述' }), { description: '新描述' }); assert.equal(original.name.length, 80);
});
test('changed description is nullable/trimmed/Unicode500 bounded without truncating or validating untouched legacy text', () => {
  const m = h(), original = base({ description: 'x'.repeat(800) }); assert.deepEqual(m.changedPatch(original, { name: '改名' }), { name: '改名' }); assert.deepEqual(m.changedPatch(base(), { description: ' 😀 ' }), { description: '😀' }); assert.equal(m.changedPatch(base(), { description: '😀'.repeat(500) }).description.length, 1000);
  for (const description of ['😀'.repeat(501), {}, [], 'a\0b', '\udfff']) invalid(() => m.changedPatch(base(), { description }));
});
test('normalization that equals the old value does not invent a write', () => {
  const m = h(); assert.deepEqual(m.changedPatch(base(), { name: ' 原活动 ', description: '   ', min_followers: 1000 }), {});
});
test('closed and unknown status remain unchanged unless explicitly changed to active/draft', () => {
  const m = h(); for (const status of ['closed', 'paused', 'unknown-legacy', null]) { const original = base({ status }); assert.deepEqual(m.changedPatch(original, m.cloneJson(original)), {}); assert.deepEqual(m.changedPatch(original, { name: '新名称' }), { name: '新名称' }); assert.deepEqual(m.changedPatch(original, { status: 'active' }), { status: 'active' }); }
  assert.deepEqual(m.changedPatch(base(), { status: 'draft' }), { status: 'draft' }); for (const status of ['closed', 'unknown', '', true, null]) invalid(() => m.changedPatch(base({ status: 'active' }), { status }));
});
test('create projects only business fields, never sends requires_review, and rejects invented statuses', () => {
  const m = h(), draft = { name: ' 新活动 ', description: null, voucher_id: voucher, status: 'draft', starts_at: '2026-10-16T00:00:00Z', ends_at: '2026-10-17T00:00:00Z', min_followers: 0, form_fields: [] };
  assert.deepEqual(m.changedPatch(null, draft), { ...draft, name: '新活动' }); assert.equal(Object.hasOwn(m.changedPatch(null, draft), 'requires_review'), false);
  invalid(() => m.changedPatch(null, { ...draft, requires_review: false })); invalid(() => m.changedPatch(null, { ...draft, status: 'closed' })); invalid(() => m.changedPatch(null, { ...draft, name: '' }));
});
test('voucher and follower edits validate types without coercion, store authority or fake defaults', () => {
  const m = h(); const other = voucher.replace('021', '022'); assert.deepEqual(m.changedPatch(base(), { voucher_id: other, min_followers: 0 }), { voucher_id: other, min_followers: 0 });
  for (const voucher_id of ['bad', [], null, 1]) invalid(() => m.changedPatch(base(), { voucher_id }));
  for (const min_followers of [-1, 1.5, '0', null, Infinity, Number.MAX_SAFE_INTEGER + 1]) invalid(() => m.changedPatch(base(), { min_followers }));
});
test('unmodified ISO strings retain original fractional precision and timezone rather than being rebuilt', () => {
  const m = h(), original = base(), next = m.cloneJson(original); next.name = '改名'; const patch = m.changedPatch(original, next); assert.deepEqual(patch, { name: '改名' }); assert.equal(next.starts_at, original.starts_at); assert.equal(next.ends_at, original.ends_at);
});
test('explicit changed ISO is preserved byte-for-byte and final range uses effective old/new dates', () => {
  const m = h(), starts_at = '2026-10-16T09:12:13.123456+08:00'; assert.deepEqual(m.changedPatch(base(), { starts_at }), { starts_at });
  for (const patch of [{ starts_at: null }, { ends_at: null }, { starts_at: '2026-10-18T00:00:00Z' }, { ends_at: base().starts_at }, { ends_at: 'bad' }, { starts_at: '2026-02-30T00:00:00Z' }, { ends_at: '2026-10-17T00:00:00' }]) invalid(() => m.changedPatch(base(), patch));
  invalid(() => m.changedPatch(base({ ends_at: null }), { starts_at: '2026-10-16T02:00:00Z' }));
});
test('historical NULL dates permit unrelated name/status/follower edits without adding or rebuilding times', () => {
  const m = h(), original = base({ starts_at: null, ends_at: null }), draft = { ...m.cloneJson(original), name: '新名称', status: 'draft', min_followers: 0 };
  assert.deepEqual(m.changedPatch(original, draft), { name: '新名称', status: 'draft', min_followers: 0 }); assert.equal(draft.starts_at, null); assert.equal(draft.ends_at, null);
});
test('untouched reversed/malformed historical dates and legacy form data do not block unrelated edits', () => {
  const m = h();
  for (const dates of [{ starts_at: '2026-10-18T00:00:00Z', ends_at: '2026-10-17T00:00:00Z' }, { starts_at: 'legacy-date', ends_at: 'bad-date' }, { starts_at: null, ends_at: 'bad-date' }]) {
    const original = base({ ...dates, form_fields: { untouched_legacy: true } }), draft = { ...m.cloneJson(original), name: '新名称' };
    assert.deepEqual(m.changedPatch(original, draft), { name: '新名称' }); assert.deepEqual(m.changedPatch(original, { status: 'active' }), { status: 'active' }); assert.deepEqual(m.changedPatch(original, { min_followers: 0 }), { min_followers: 0 }); assert.deepEqual(m.changedPatch(original, m.cloneJson(original)), {});
  }
});
test('changing either historical date still requires a valid final pair; creation never bypasses range checks', () => {
  const m = h(), original = base({ starts_at: null, ends_at: null });
  invalid(() => m.changedPatch(original, { starts_at: '2026-10-16T00:00:00Z' })); invalid(() => m.changedPatch(original, { ends_at: '2026-10-17T00:00:00Z' }));
  invalid(() => m.changedPatch(base({ starts_at: 'bad', ends_at: 'bad' }), { ends_at: '2026-10-17T00:00:00Z' }));
  const valid = { starts_at: '2026-10-16T00:00:00.123456Z', ends_at: '2026-10-16T00:00:00.123457Z' }; assert.deepEqual(m.changedPatch(original, valid), valid);
  const create = { name: '新活动', voucher_id: voucher, status: 'draft', starts_at: null, ends_at: null }; invalid(() => m.changedPatch(null, create)); invalid(() => m.changedPatch(null, { ...create, starts_at: valid.starts_at }));
});
test('date range compares finer-than-millisecond fractions and offset-equivalent instants precisely', () => {
  const m = h(), original = base({ starts_at: '2026-10-16T00:00:00.123456Z', ends_at: '2026-10-16T00:00:00.123457Z' }); assert.deepEqual(m.changedPatch(original, { name: '微秒范围' }), { name: '微秒范围' });
  invalid(() => m.changedPatch(original, { ends_at: '2026-10-16T08:00:00.123456+08:00' })); invalid(() => m.changedPatch(original, { ends_at: '2026-10-16T00:00:00.1234559Z' }));
});
test('Shanghai native date/time converts independently of device timezone and validates calendar rollover', () => {
  const m = h(); assert.equal(m.shanghaiToISO('2026-10-16', '00:05'), '2026-10-15T16:05:00.000Z'); assert.equal(m.shanghaiToISO('2024-02-29', '23:59:58'), '2024-02-29T15:59:58.000Z');
  for (const [date, time] of [['2026-02-29', '12:00'], ['2026-02-30', '12:00'], ['2026-13-01', '12:00'], ['2026-10-16', '24:00'], ['2026-10-16', '12:60'], ['2026-10-16', '1:00'], [null, '12:00'], ['2026-10-16', null]]) invalid(() => m.shanghaiToISO(date, time));
});
test('Shanghai conversion produces identical output under UTC and distant host timezones', () => {
  h(); const script = 'process.stdout.write(require(' + JSON.stringify(file) + ').shanghaiToISO("2026-10-16","09:30"))';
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) { const result = cp.spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ } }); assert.equal(result.status, 0); assert.equal(result.stdout, '2026-10-16T01:30:00.000Z'); }
});
test('field edit patches exactly the stable key and retains every untouched nested metadata property', () => {
  const m = h(), original = [field(), field({ key: 'second', type: 'text', role: null })], before = JSON.stringify(original), next = m.editField(original, 'original-key', { label: '新标题', required: false });
  assert.equal(next[0].key, 'original-key'); assert.equal(next[0].label, '新标题'); assert.equal(next[0].required, false); assert.deepEqual(next[0].future, original[0].future); assert.deepEqual(next[0].options, original[0].options); assert.equal(next[0].placeholder, '原提示'); assert.deepEqual(next[1], original[1]); assert.equal(JSON.stringify(original), before); assert.notEqual(next[0].future, original[0].future);
});
test('key/unknown metadata edits and explicit undefined are rejected instead of rebuilding or dropping JSON', () => {
  const m = h(), fields = [field()]; for (const patch of [{ key: 'new-key' }, { future: null }, { label: undefined }, { role: undefined }, { unexpected: true }, JSON.parse('{"__proto__":{"polluted":true}}')]) invalid(() => m.editField(fields, 'original-key', patch));
  invalid(() => m.editField(fields, 'missing', { label: '新' })); assert.equal({}.polluted, undefined);
});
test('the six supported types validate with role/type compatibility and preserve options on explicit type changes', () => {
  const m = h(); for (const type of ['text', 'phone', 'url', 'image', 'textarea', 'select']) { const next = m.editField([field({ type: 'text', role: null })], 'original-key', { type }); assert.equal(next[0].type, type); assert.deepEqual(next[0].options, ['原选项']); }
  invalid(() => m.editField([field()], 'original-key', { type: 'phone' }));
  const noRole = m.editField([field()], 'original-key', { role: null }), phone = m.editField(noRole, 'original-key', { type: 'phone' }); assert.equal(phone[0].role, null); assert.equal(phone[0].placeholder, '原提示');
  for (const type of ['text', 'url']) assert.equal(m.editField([field({ type, role: null })], 'original-key', { role: 'xhs_profile_url' })[0].role, 'xhs_profile_url');
  invalid(() => m.editField([field({ type: 'textarea', role: null })], 'original-key', { role: 'xhs_profile_url' })); invalid(() => m.editField([field({ type: 'text', role: null })], 'original-key', { role: 'profile_screenshot' }));
});
test('unknown existing type or role stays read-only and survives other field edits rather than being coerced', () => {
  const m = h(), fields = [field({ key: 'legacy', type: 'legacy-matrix', role: 'legacy-role', unknown: [1, 2] }), field({ key: 'normal' })];
  const next = m.editField(fields, 'normal', { label: '仅改正常字段' }); assert.deepEqual(next[0], fields[0]); invalid(() => m.editField(fields, 'legacy', { type: 'text', role: null })); invalid(() => m.editField(fields, 'legacy', { label: '改标题' }));
  const roleOnly = [field({ role: 'legacy-role' })]; invalid(() => m.editField(roleOnly, 'original-key', { label: '改名' }));
});
test('changed select/options, labels, required, placeholder and roles reject malformed values without coercion', () => {
  const m = h(), fields = [field({ type: 'select', role: null })];
  for (const patch of [{ options: [] }, { options: null }, { options: [''] }, { options: [1] }, { options: 'a,b' }, { label: '' }, { label: null }, { required: null }, { required: 1 }, { placeholder: {} }, { role: 'other' }, { type: 'other' }]) invalid(() => m.editField(fields, 'original-key', patch));
  const next = m.editField(fields, 'original-key', { options: ['  原值  ', '第二项'] }); assert.deepEqual(next[0].options, ['  原值  ', '第二项']);
});
test('explicit add uses caller-provided stable key, never regenerates old keys, and rejects duplicates/new unknown schemas', () => {
  const m = h(), original = [field()], added = { key: 'new-key', label: '新字段', type: 'text', required: false }, next = m.addField(original, added); assert.equal(original.length, 1); assert.deepEqual(next[0], original[0]); assert.deepEqual(next[1], added);
  invalid(() => m.addField(original, { ...added, key: 'original-key' })); invalid(() => m.addField(original, { ...added, type: 'future-type' })); invalid(() => m.addField(original, { ...added, role: 'future-role' })); invalid(() => m.addField(original, { ...added, injected: true }));
});
test('explicit reorder/remove keeps metadata and key identity, including unknown read-only fields', () => {
  const m = h(), original = [field({ key: 'one' }), field({ key: 'two', type: 'unknown' }), field({ key: 'three' })];
  const moved = m.moveField(original, 'two', 0); assert.deepEqual(moved.map(x => x.key), ['two', 'one', 'three']); assert.deepEqual(moved[0], original[1]); const removed = m.removeField(moved, 'two'); assert.deepEqual(removed.map(x => x.key), ['one', 'three']); assert.deepEqual(removed[0].future, original[0].future); assert.equal(original.length, 3);
  for (const index of [-1, 3, 1.5, '0', NaN]) invalid(() => m.moveField(original, 'one', index)); invalid(() => m.removeField(original, 'absent'));
});
test('malformed nonarray form definitions remain untouched for unrelated edits, never silently become defaults/empty arrays', () => {
  const m = h(); for (const form_fields of [null, { legacy: true }, 'old-format']) { const original = base({ form_fields }); assert.deepEqual(m.changedPatch(original, { name: '只改名称', form_fields: m.cloneJson(form_fields) }), { name: '只改名称' }); invalid(() => m.changedPatch(original, { form_fields: [] })); for (const fn of [() => m.editField(form_fields, 'x', { label: 'x' }), () => m.addField(form_fields, { key: 'x', label: 'x', type: 'text' }), () => m.moveField(form_fields, 'x', 0), () => m.removeField(form_fields, 'x')]) invalid(fn); }
});
test('changed field patch retains original metadata in output but rejects direct key/unknown metadata modification', () => {
  const m = h(), original = base(), fields = m.editField(original.form_fields, 'original-key', { label: '新名称' }); const patch = m.changedPatch(original, { form_fields: fields }); assert.deepEqual(patch, { form_fields: fields }); assert.deepEqual(patch.form_fields[0].future, original.form_fields[0].future);
  const dirty = m.cloneJson(fields); dirty[0].future.nested = []; invalid(() => m.changedPatch(original, { form_fields: dirty }));
  const renamed = m.cloneJson(fields); renamed[0].key = 'new-key'; invalid(() => m.changedPatch(original, { form_fields: renamed }));
});
test('explicit field reorder/removal are reflected as whole ordered arrays, not sorted or reconstituted minimal rows', () => {
  const m = h(), original = base({ form_fields: [field({ key: 'a' }), field({ key: 'b' })] }); const moved = m.moveField(original.form_fields, 'b', 0); assert.deepEqual(m.changedPatch(original, { form_fields: moved }), { form_fields: moved });
  const removed = m.removeField(original.form_fields, 'a'); assert.deepEqual(m.changedPatch(original, { form_fields: removed }), { form_fields: removed }); assert.deepEqual(m.changedPatch(original, { form_fields: m.moveField(original.form_fields, 'a', 0) }), {});
});
test('duplicate/missing keys and nonobject field members are errors for mutation, not silently filtered', () => {
  const m = h(); for (const fields of [[field(), field()], [null], ['legacy'], [{ label: '无key', type: 'text' }], [field({ key: '' })]]) { invalid(() => m.editField(fields, 'original-key', { label: '新' })); invalid(() => m.changedPatch(base({ form_fields: [] }), { form_fields: fields })); }
});
test('proto-like stable field keys are handled as literal values and nested proto metadata survives partial editing safely', () => {
  const m = h(), original = [JSON.parse('{"key":"__proto__","label":"旧","type":"text","constructor":{"kept":true},"__proto__":{"kept":true}}')], next = m.editField(original, '__proto__', { label: '新' });
  assert.equal(next[0].key, '__proto__'); assert.equal(Object.hasOwn(next[0], '__proto__'), true); assert.equal(next[0].__proto__.kept, true); assert.deepEqual(next[0].constructor, { kept: true }); assert.equal({}.kept, undefined);
});
test('a malformed untouched array member is preserved for unrelated top-level edits, not passed as an edited schema', () => {
  const m = h(), original = base({ form_fields: [null, 'legacy'] }); assert.deepEqual(m.changedPatch(original, { name: '只改名' }), { name: '只改名' }); assert.deepEqual(m.changedPatch(original, { form_fields: [null, 'legacy'] }), {});
});
test('all pure functions leave their inputs unchanged on both success and validation failure', () => {
  const m = h(), original = base(), before = JSON.stringify(original), draft = { name: '  新名称  ', form_fields: m.editField(original.form_fields, 'original-key', { label: '改' }) }, draftBefore = JSON.stringify(draft); m.changedPatch(original, draft); assert.equal(JSON.stringify(original), before); assert.equal(JSON.stringify(draft), draftBefore); invalid(() => m.editField(original.form_fields, 'original-key', { type: 'invalid' })); assert.equal(JSON.stringify(original), before);
});
