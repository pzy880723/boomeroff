const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreview } = require('../miniprogram/shared/preview');
const keys = ['id','name','category','ip_name','summary','era','origin','cover_url','selling_points','tips','view_count','favorite_count','importance_score','updated_at'];

test('preview official-library returns the fixed lightweight bounded contract and exact filters', async () => {
  const api = createPreview({}).api, all = await api.action('official-library', {});
  assert.equal(all.window_limit, 60); assert.equal(all.persisted, false);
  assert.equal(all.requested_sort, 'latest'); assert.equal(all.effective_sort, 'latest');
  assert.deepEqual(all.filters, { q: null, category: null, ip_name: null, era: null, origin: null });
  assert.ok(Date.parse(all.as_of)); assert.equal(all.items.length, 3);
  assert.deepEqual(all.items.map(row => row.id), all.items.map(row => row.id).sort().reverse(), 'equal update times retain latest id-desc ties');
  for (const row of all.items) { assert.deepEqual(Object.keys(row).sort(), keys.slice().sort()); assert.match(row.name, /示例/); }
  for (const field of ['category','ip_name','era','origin']) {
    const wanted = all.items[0][field], result = await api.action('official-library', { [field]: wanted, sort: 'hot' });
    assert.ok(result.items.length); assert.ok(result.items.every(row => row[field] === wanted));
    assert.equal(result.filters[field], wanted); assert.equal(result.requested_sort, 'hot');
    assert.equal(result.effective_sort, field === 'category' ? 'latest' : 'hot');
    assert.deepEqual((await api.action('official-library', { [field]: wanted + ' ' })).items, []);
  }
  const summary = all.items[0].summary;
  assert.deepEqual((await api.action('official-library', { q: '  ' + summary + '  ' })).items.map(row => row.id), [all.items[0].id]);
  for (const q of ['%', '_', '\\', 'absent']) assert.deepEqual((await api.action('official-library', { q })).items, []);
  for (const sort of ['latest','hot','important']) assert.equal((await api.action('official-library', { sort })).effective_sort, sort);
  assert.equal((await api.action('official-library', { q: '𠮷'.repeat(80) })).filters.q.length, 160);
});

test('preview official-library rejects unsupported fields and malformed text instead of emulating success', async () => {
  const api = createPreview({}).api;
  for (const params of [{ shop_id: 'foreign' }, { page: 0 }, { actor: 'someone' }, { sort: '' }, { sort: 'popular' }, { q: 1 }, { category: {} }, { q: '𠮷'.repeat(81) }, { category: 'a'.repeat(81) }, { era: 'a'.repeat(121) }, { q: '\ud800' }, { origin: 'a\u0000b' }]) {
    await assert.rejects(api.action('official-library', params), error => error.status === 400 && error.code === 'invalid_params');
  }
});

test('preview owned source metadata stays minimal, synthetic and does not change practice state', async () => {
  const api = createPreview({}).api;
  for (const action of ['my-library','practice-library']) {
    const data = await api.action(action, {});
    for (const row of data.items) {
      assert.ok(row.snapshot); assert.equal(typeof row.passed, 'boolean');
      assert.deepEqual(Object.keys(row.source_metadata).sort(), ['category','cover_url','name']);
      assert.match(row.source_metadata.name, /示例/);
      assert.equal(row.quiz_available, true);
    }
  }
});
