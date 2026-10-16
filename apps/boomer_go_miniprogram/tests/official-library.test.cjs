const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const helperPath = path.resolve(__dirname, '../miniprogram/shared/official-library.js');
function helper() { assert.ok(fs.existsSync(helperPath), 'official library helper exists'); return require(helperPath); }
const defaults = { q: null, category: null, ip_name: null, era: null, origin: null, sort: 'latest' };
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const item = (n = 1, extra = {}) => ({ id: id(n), name: '官方器物', category: 'jp_porcelain', ip_name: null, summary: null, era: null, origin: null, cover_url: null, selling_points: null, tips: null, view_count: null, favorite_count: null, importance_score: null, updated_at: null, ...extra });
const windowDto = (filters = defaults, items = [item(1, Object.fromEntries(['category', 'ip_name', 'era', 'origin'].filter(key => filters[key] !== null).map(key => [key, filters[key]])))]) => ({ items, filters: Object.fromEntries(Object.entries(filters).filter(([key]) => key !== 'sort')), requested_sort: filters.sort, effective_sort: filters.category ? 'latest' : filters.sort, window_limit: 60, as_of: '2026-10-16T09:00:00+08:00' });

test('stable route helper returns a normalized six-field object and minimal native JSON URL', () => {
  const h = helper(); assert.deepEqual(h.readOptions({}), defaults);
  assert.deepEqual(h.readOptions({ kind: 'official', official_filters: '{}' }), defaults);
  const filters = { category: 'jp_porcelain', ip_name: '品牌窑口' }, url = h.urlForFilters(filters);
  assert.match(url, /^\/pages\/list\/index\?kind=official&official_filters=/);
  const encoded = url.split('official_filters=')[1]; assert.deepEqual(JSON.parse(decodeURIComponent(encoded)), filters);
  assert.deepEqual(h.readOptions({ official_filters: encoded }), { ...defaults, ...filters });
});

test('raw JSON is parsed before one decode so percent literals, plus and encoded-looking strings survive exactly', () => {
  const h = helper(), filters = { q: '100%20_中文+&', era: '%25', origin: ' 日本 ' };
  for (const raw of [JSON.stringify(filters), encodeURIComponent(JSON.stringify(filters))]) assert.deepEqual(h.readOptions({ official_filters: raw }), { ...defaults, ...filters });
  const json = JSON.stringify({ q: '%7B%22category%22%3A%22other%22%7D' });
  assert.equal(h.readOptions({ official_filters: json }).q, '%7B%22category%22%3A%22other%22%7D');
});

test('malformed supplied route filters fail closed rather than becoming all content', () => {
  const h = helper();
  for (const value of [null, undefined, {}, [], ['{}'], '', '%', '%E0%A4%A', '{bad', 'null', '[]', '"text"', JSON.stringify({ page: 1 }), JSON.stringify({ category: {} }), '{"__proto__":{}}']) {
    assert.throws(() => h.readOptions({ official_filters: value }), e => e.code === 'invalid_params', String(value));
  }
});

test('only q is trimmed, null/empty become unset and unknown literal categories are not replaced with all', () => {
  const h = helper();
  assert.deepEqual(h.normalize({ q: '  器物  ', category: ' future ', ip_name: ' IP ', era: '', origin: null, sort: null }), { ...defaults, q: '器物', category: ' future ', ip_name: ' IP ' });
  assert.equal(h.normalize({ q: '   ' }).q, null); assert.equal(h.normalize({ category: 'porcelain' }).category, 'porcelain');
});

test('request validation rejects extra keys, bad types, invalid sort, NUL and lone surrogates without truncating', () => {
  const h = helper();
  for (const filters of [null, [], 'q', { page: 0 }, { shop_id: id(9) }, { actor_id: id(9) }, { q: 3 }, { category: [] }, { ip_name: {} }, { sort: '' }, { sort: 'popular' }, { q: '\ud800' }, { origin: '\udfff' }, { era: 'a\0b' }]) {
    assert.throws(() => h.normalize(filters), e => e.code === 'invalid_params'); assert.throws(() => h.urlForFilters(filters), e => e.code === 'invalid_params');
  }
});

test('80/120 limits count Unicode codepoints and reject overlong original strings', () => {
  const h = helper();
  for (const [key, max] of [['q', 80], ['category', 80], ['ip_name', 120], ['era', 120], ['origin', 120]]) {
    assert.equal(h.normalize({ [key]: '😀'.repeat(max) })[key], '😀'.repeat(max));
    assert.throws(() => h.normalize({ [key]: '😀'.repeat(max + 1) }), e => e.code === 'invalid_params');
  }
});

test('window parser binds normalized filters, requested/effective sort, cap and valid timestamp', () => {
  const h = helper(), filters = h.normalize({ category: 'jp_porcelain', ip_name: '品牌窑口', sort: 'hot', q: '器物' });
  const result = h.parseWindow(windowDto(filters), filters); assert.equal(result.items.length, 1); assert.equal(result.effectiveSort, 'latest'); assert.equal(result.requestedSort, 'hot');
  for (const patch of [{ filters: { ...windowDto(filters).filters, q: 'foreign' } }, { filters: { ...windowDto(filters).filters, page: 0 } }, { filters: {} }, { requested_sort: 'latest' }, { effective_sort: 'hot' }, { window_limit: 20 }, { as_of: '2026-02-30T09:00:00Z' }, { as_of: 'now' }]) assert.throws(() => h.parseWindow({ ...windowDto(filters), ...patch }, filters));
});

test('window parser rejects invalid or duplicate UUIDs, over-60 rows and malformed scalar fields', () => {
  const h = helper();
  for (const rows of [[item(1, { id: 'bad' })], [item(), item()], Array.from({ length: 61 }, (_, i) => item(i)), [item(1, { name: {} })], [item(1, { category: [] })], [item(1, { view_count: '0' })], [item(1, { importance_score: Infinity })], [item(1, { updated_at: 'bad' })], [null]]) assert.throws(() => h.parseWindow(windowDto(defaults, rows), defaults));
  const missing = item(); delete missing.origin; assert.throws(() => h.parseWindow(windowDto(defaults, [missing]), defaults));
});

test('window projection does not invent zero values or copy answer/heavy/private fields', () => {
  const h = helper(), value = item(1, { answers: [1], content: { quiz: [1] }, password: 'secret', selling_points: [{ explanation: 'secret' }] });
  const parsed = h.parseWindow(windowDto(defaults, [value]), defaults);
  assert.equal(parsed.items[0].view_count, null); assert.equal(parsed.items[0].name, '官方器物');
  assert.doesNotMatch(JSON.stringify(parsed), /answers|explanation|password|secret|content|quiz/);
});

test('fixed IP metadata is immutable, exact and empty for other or legacy categories', () => {
  helper(); const m = require('../miniprogram/shared/knowledge-categories');
  const expected = { jp_porcelain: ['品牌窑口', '工艺技法', '器型用途', '花纹寓意', '年代鉴定', '场景搭配'], eu_porcelain: ['品牌', '工艺', '器型', '花纹', '年代'], incense: ['品牌', '香型', '用途场景'], antique_art: ['书画', '漆器', '铜器', '木器', '织物'], local_craft: ['闽南瓷', '茶器', '手作'], anime_toy: ['高达', '圣斗士', '假面骑士', '战队', '怪兽', '食玩'], otaku_goods: ['手办', '景品', '徽章', '挂件', '同人'], luxury: ['包袋', '服饰', '配饰', '腕表'], vintage_jewelry: ['项链', '戒指', '胸针', '耳饰', '手链'], game_console: ['任天堂', '索尼', '世嘉', '掌机', '卡带'], walkman: ['Walkman 磁带', 'Discman', 'MD', '数码'], ccd: ['索尼', '佳能', '卡西欧', '富士', '奥林巴斯'], media_record: ['黑胶', '磁带', 'CD', 'DVD'], playback_device: ['黑胶机', '卡带机', 'CD 机', '收音机'], home_appliance: ['电视', '收音', '厨电', '灯具'], hobby: ['文具', '香水', '烟具', '户外'] };
  for (const [category, values] of Object.entries(expected)) { const options = m.ipOptions(category); assert.ok(Object.isFrozen(options)); assert.deepEqual(options.slice(1).map(x => x.code), values); options.forEach(x => assert.ok(Object.isFrozen(x))); }
  for (const category of ['', 'other', 'porcelain', 'unknown']) assert.equal(m.ipOptions(category).length, 1);
});

module.exports = { defaults, id, item, windowDto };

for (const key of ['category', 'ip_name', 'era', 'origin']) test('every returned row must match exact non-null ' + key + ' without enforcing query substrings', () => {
  const h = helper(), filters = h.normalize({ [key]: ' literal%20 ', q: '数据库排序规则' });
  assert.equal(h.parseWindow(windowDto(filters), filters).items[0][key], filters[key]);
  for (const value of [null, 'literal%20', 'foreign']) assert.throws(() => h.parseWindow(windowDto(filters, [item(1, { [key]: value })]), filters), e => e.code === 'invalid_response');
});
