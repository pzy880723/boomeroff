const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../miniprogram/pages/list/model');
const base = (id, patch = {}) => ({ id, user_id: 'me', source_type: 'official', quiz_kind: 'favorite', passed: false, passed_at: null, last_attempt_at: null, snapshot: { name: '旧标题', category: 'porcelain', cover_url: 'old' }, ...patch });
function page(kind = 'my-library') { return { data: { kind, query: '', mastery: 'all' }, session: { get: () => ({ userId: 'me' }) }, setData(patch) { Object.assign(this.data, patch); } }; }
function project(p, data) { model.showLearning(p, data, 0, false); return p.data.allItems; }
test('owned official/product fresh metadata overrides snapshot without changing mastery/quiz/raw snapshot', () => {
  const p = page(), data = { items: [base('a', { passed: true, source_metadata: { name: '新标题', category: 'jp_porcelain', cover_url: 'new' } }), base('b', { source_type: 'product', source_metadata: { name: null, category: null, cover_url: null } })] }, before = JSON.stringify(data);
  const rows = project(p, data); assert.equal(rows[0].title, '新标题'); assert.equal(rows[0].categoryLabel, '日瓷'); assert.equal(rows[0].cover_url, 'new'); assert.equal(rows[0].sourceBadge, '官方'); assert.equal(rows[0].masteryState, 'mastered'); assert.equal(rows[0].quizKind, 'favorite'); assert.equal(rows[1].title, '旧标题'); assert.equal(rows[1].sourceBadge, '历史'); assert.equal(JSON.stringify(data), before);
});
test('recognition uses snapshot only, absent metadata falls back, unknown source remains an explicit badge', () => {
  const rows = project(page(), { items: [base('a', { source_type: 'recognition', source_metadata: { name: '不可采用', category: 'other', cover_url: 'bad' } }), base('b', { source_metadata: null }), base('c', { source_type: 'legacy', snapshot: {} })] });
  assert.equal(rows[0].title, '旧标题'); assert.equal(rows[0].category, 'porcelain'); assert.equal(rows[0].sourceBadge, '识别'); assert.equal(rows[1].title, '旧标题'); assert.equal(rows[2].category, 'other'); assert.equal(rows[2].sourceBadge, '收藏');
});
test('malformed supplied source metadata fails rather than lying about current source', () => {
  for (const source_metadata of [[], 'bad', { name: {}, category: null, cover_url: null }, { name: null, category: 3, cover_url: null }, { name: null, category: null }]) assert.throws(() => project(page(), { items: [base('a', { source_metadata })] }));
});
test('loaded groups are count descending, ties stable, row order preserved, unknown categories isolated safely', () => {
  const p = page(); model.showLearning(p, { items: [base('a', { snapshot: { category: '__proto__' } }), base('b', { snapshot: { category: 'jp_porcelain' } }), base('c', { snapshot: { category: 'jp_porcelain' } }), base('d', { snapshot: { category: 'future' } }), base('e', { snapshot: {} })], page: 0, has_more: true }, 0, false);
  assert.deepEqual(p.data.learningGroups.map(x => [x.category, x.label, x.count]), [['jp_porcelain', '日瓷', 2], ['__proto__', '__proto__', 1], ['future', 'future', 1], ['other', '其他', 1]]); assert.deepEqual(p.data.learningGroups[0].items.map(x => x.id), ['b', 'c']); assert.match(p.data.loadedSummary, /已加载 5/); assert.equal(p.data.hasMore, true);
  model.showLearning(p, { items: [base('f', { snapshot: { category: 'future' } })], page: 1, has_more: false }, 1, true); assert.equal(p.data.learningGroups.find(x => x.category === 'future').count, 2);
  p.data.query = 'missing'; model.filterLearning(p); assert.deepEqual(p.data.learningGroups, []); assert.match(p.data.loadedSummary, /已加载 6/);
});
test('history stays flat and foreign ownership is still rejected', () => {
  const p = page('quiz-history'); model.showLearning(p, { items: [{ id: 'result', item_kind: 'official', item_id: '00000000-0000-4000-8000-000000000001', passed_at: null, last_attempt_at: null }], page: 0, has_more: false }, 0, false); assert.deepEqual(p.data.learningGroups, []);
  assert.throws(() => project(page(), { items: [base('a', { user_id: 'other' })] }));
});
test('unknown prototype-looking source types project only the fallback badge, never object members', () => {
  for (const source_type of ['__proto__', 'constructor', 'toString']) assert.equal(project(page(), { items: [base('a', { source_type })] })[0].sourceBadge, '收藏');
});
