const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../miniprogram/shared/daily-practice.js');
const create = fs.existsSync(file) ? require(file).createDailyPractice : null;
const USER = '10000000-0000-4000-8000-000000000001';
const SHOP = '10000000-0000-4000-8000-000000000002';
const id = n => '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
const row = n => ({ id: id(n), source_type: 'official', source_id: id(n + 1000), snapshot: { name: '知识 ' + n }, created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(), quiz_kind: 'favorite', quiz_available: true, passed: false });
const library = (n = 6) => ({ items: Array.from({ length: n }, (_, i) => row(n - i)), window_limit: 300, has_older: false, as_of: '2026-10-16T00:00:00Z' });
const receipt = (n, passed = false) => ({ kind: 'favorite', id: id(n), score: passed ? 1 : 0, total: 1, submitted: [1], passed, persisted: true });
function setup(options = {}) {
  assert.equal(typeof create, 'function', 'native daily-practice coordinator must exist');
  let user = { userId: USER, shop: { id: SHOP }, scopeVersion: 3 }, revision = 1, time = Date.parse('2026-10-16T00:00:00Z');
  const storage = options.storage || new Map(), writes = [], reads = [];
  const wx = { getStorageSync(key) { reads.push(key); if (options.readError) throw Error('unavailable'); return storage.get(key); }, setStorageSync(key, value) { writes.push({ key, value: structuredClone(value) }); if (options.writeError) throw Error('full'); storage.set(key, structuredClone(value)); } };
  const session = { get: () => user, revision: () => revision };
  const helper = create({ wx, session, preview: options.preview === true, now: () => time });
  return { helper, storage, writes, reads, setUser(value) { user = value; revision++; }, renew() { revision++; }, nextDay() { time = Date.parse('2026-10-16T16:00:00Z'); }, load(data = library()) { return helper.setLibrary(data, helper.stamp()); } };
}

test('latest300 validation and oldest-five-then-attempted selection match Web scope', () => {
  const h = setup(); h.load(); assert.deepEqual(h.helper.view().recommendations.map(x => x.id), [1, 2, 3, 4, 5].map(id));
  h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp());
  assert.deepEqual(h.helper.view().recommendations.map(x => x.id), [2, 3, 4, 5].map(id), 'do not refill before taking five');
  assert.equal(h.helper.view().attemptedCount, 1);
  const fresh = library(); fresh.items.find(x => x.id === id(1)).passed = true; h.load(fresh);
  assert.deepEqual(h.helper.view().recommendations.map(x => x.id), [2, 3, 4, 5, 6].map(id));
});
test('exact300 window and older indicator do not become full-library claims', () => {
  const h = setup(); const d = library(300); d.has_older = true; h.load(d);
  assert.equal(h.helper.view().libraryCount, 300); assert.equal(h.helper.view().hasOlder, true);
  assert.equal(h.helper.view().recommendations.length, 5);
});
test('malformed window, owner, duplicates, dates and mastery are rejected before installing', () => {
  const patches = [{ window_limit: 20 }, { has_older: 'true' }, { items: library(301).items }, { as_of: 'bad' },
    { items: [row(1), row(1)] }, { items: [{ ...row(1), user_id: id(5) }] }, { items: [{ ...row(1), created_at: null }] },
    { items: [{ ...row(1), passed: undefined }] }, { items: [{ ...row(1), quiz_kind: 'official' }] }];
  for (const patch of patches) { const h = setup(); assert.throws(() => h.load({ ...library(), ...patch })); assert.equal(h.helper.view().ready, false); }
});
test('unknown or unavailable source is not silently counted as practiced or recommended', () => {
  const h = setup(); const d = library(2); d.items[0].source_type = 'unsupported'; d.items[1].quiz_available = false; h.load(d);
  assert.equal(h.helper.view().recommendations.length, 0); assert.equal(h.helper.view().attemptedCount, 0);
});
test('start freezes one queue, next needs confirmation and double-next cannot skip items', () => {
  const h = setup(); h.load(); h.helper.start(); assert.equal(h.helper.view().current.id, id(1));
  assert.throws(() => h.helper.next(id(1))); h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp());
  assert.equal(h.helper.matches(id(1)), false); h.helper.next(id(1)); assert.equal(h.helper.view().current.id, id(2));
  assert.throws(() => h.helper.next(id(1))); h.helper.start(); assert.equal(h.helper.view().current.id, id(2));
});
test('both failed and passed server-saved favorite attempts count without local mastery changes', () => {
  const h = setup(); h.load(); h.helper.start();
  for (const n of [1, 2]) { h.helper.recordAttempt(id(n), receipt(n, n === 2), h.helper.stamp()); h.helper.next(id(n)); }
  assert.equal(h.helper.view().attemptedCount, 2); assert.equal(h.helper.view().completedCount, 2);
  assert.equal(h.helper.view().current.id, id(3));
});
test('ordinary single-favorite tests count before a batch is loaded', () => {
  const h = setup(); h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp()); h.load();
  assert.equal(h.helper.view().attemptedCount, 1); assert.equal(h.helper.view().recommendations.some(x => x.id === id(1)), false);
});
test('unconfirmed, malformed or mismatched result never advances or writes progress', () => {
  for (const patch of [{ persisted: false }, { persisted: undefined }, { persisted: 'true' }, { kind: 'knowledge' }, { id: id(3) }, { score: 2 }, { total: 0 }, { passed: 1 }, { submitted: [] }, { submitted: [-1] }]) {
    const h = setup(); h.load(); h.helper.start(); assert.throws(() => h.helper.recordAttempt(id(1), { ...receipt(1), ...patch }, h.helper.stamp()));
    assert.equal(h.writes.length, 0); assert.equal(h.helper.matches(id(1)), true);
  }
});
test('skip is explicit queue movement and does not mark learning complete', () => {
  const h = setup(); h.load(); h.helper.start(); h.helper.skip(id(1));
  assert.equal(h.helper.view().current.id, id(2)); assert.equal(h.helper.view().skippedCount, 1);
  assert.equal(h.helper.view().attemptedCount, 0); assert.equal(h.writes.length, 0); assert.throws(() => h.helper.skip(id(1)));
});
test('exit preserves only confirmed daily attempts and clear removes RAM continuity', () => {
  const h = setup(); h.load(); h.helper.start(); h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp()); h.helper.exit();
  assert.equal(h.helper.view().active, false); assert.equal(h.helper.view().attemptedCount, 1);
  h.helper.clear(); assert.equal(h.helper.view().ready, false); assert.equal(h.helper.view().attemptedCount, 1);
});
test('storage is own-user-and-shop-scoped and contains only version, date and favorite ids', () => {
  const h = setup(); h.helper.recordAttempt(id(1), { ...receipt(1), quiz_token: 'PRIVATE', questions: ['PRIVATE'], name: 'PRIVATE' }, h.helper.stamp());
  assert.match(h.writes[0].key, new RegExp(USER)); assert.match(h.writes[0].key, new RegExp(SHOP));
  assert.deepEqual(Object.keys(h.writes[0].value).sort(), ['attempted', 'date', 'version']); assert.equal(JSON.stringify(h.writes).includes('PRIVATE'), false);
  const restored = setup({ storage: h.storage }); assert.equal(restored.helper.view().attemptedCount, 1);
});
test('another employee or store cannot see prior progress, install old data or record late scores', () => {
  const h = setup(); h.load(); h.helper.start(); const stamp = h.helper.stamp(); h.helper.recordAttempt(id(1), receipt(1), stamp);
  for (const user of [{ userId: id(99), shop: { id: SHOP }, scopeVersion: 3 }, { userId: USER, shop: { id: id(99) }, scopeVersion: 3 }]) {
    h.setUser(user); assert.equal(h.helper.view().attemptedCount, 0); assert.equal(h.helper.view().active, false);
    assert.throws(() => h.helper.setLibrary(library(), stamp)); assert.throws(() => h.helper.recordAttempt(id(1), receipt(1), stamp));
  }
});
test('same-user revision and Shanghai midnight invalidate active queue and old results', () => {
  for (const change of ['renew', 'nextDay']) {
    const h = setup(); h.load(); h.helper.start(); const stamp = h.helper.stamp(); h[change]();
    assert.equal(h.helper.view().active, false); assert.equal(h.helper.view().ready, false);
    assert.throws(() => h.helper.recordAttempt(id(1), receipt(1), stamp)); assert.equal(h.writes.length, 0);
  }
});
test('storage failures retain RAM progress but report it was not durably saved', () => {
  const h = setup({ writeError: true }); h.load(); h.helper.start(); h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp());
  assert.equal(h.helper.view().attemptedCount, 1); assert.match(h.helper.view().progressError, /本机|保存|内存/); h.helper.next(id(1));
  const broken = setup({ readError: true }); assert.match(broken.helper.view().progressError, /读取|本机/);
});
test('malformed stored progress is not silently called zero completed authoritative history', () => {
  const h = setup(); h.helper.view(); const key = h.reads[0]; h.storage.set(key, { version: 1, date: '2026-10-16', attempted: ['bad'] }); h.helper.clear();
  assert.match(h.helper.view().progressError, /本机|记录/); assert.equal(h.helper.view().attemptedCount, 0);
});
test('preview practice is separate RAM-only and requires synthetic non-persistence', () => {
  const h = setup({ preview: true }); h.load(); h.helper.start();
  assert.throws(() => h.helper.recordAttempt(id(1), receipt(1), h.helper.stamp()));
  h.helper.recordAttempt(id(1), { ...receipt(1), persisted: false }, h.helper.stamp());
  assert.equal(h.helper.view().attemptedCount, 1); assert.equal(h.helper.view().preview, true); assert.equal(h.writes.length + h.reads.length, 0);
});
test('absence of a verified working identity never returns an actionable practice queue', () => {
  const h = setup(); h.setUser(null); assert.equal(h.helper.view().ready, false); assert.equal(h.helper.matches(id(1)), false);
  assert.throws(() => h.helper.stamp()); assert.throws(() => h.helper.start()); assert.equal(h.writes.length, 0);
});
test('read installation and attempt recording require an explicit captured scope guard', () => {
  const h = setup(); assert.throws(() => h.helper.setLibrary(library()));
  assert.throws(() => h.helper.recordAttempt(id(1), receipt(1))); assert.equal(h.writes.length, 0);
});
test('recommendation chronology compares instants rather than timestamp offset text', () => {
  const h = setup(), data = library(2);
  data.items[0].created_at = '2026-10-01T00:00:02Z';
  data.items[1].created_at = '2026-10-01T08:00:01+08:00';
  h.load(data); assert.deepEqual(h.helper.view().recommendations.map(x => x.id), [id(1), id(2)]);
});
