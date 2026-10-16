const KEYS = ['q', 'category', 'ip_name', 'era', 'origin'];
const SORTS = ['latest', 'hot', 'important'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = require('./knowledge-categories');
function invalid() { const error = new Error('官方知识筛选参数不合法，请核对输入；搜索最多 80 个字'); error.code = 'invalid_params'; return error; }
function object(value) { return value !== null && Object.prototype.toString.call(value) === '[object Object]'; }
function validText(value) {
  if (value.indexOf('\0') >= 0) return false;
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
function normalize(filters = {}) {
  if (!object(filters) || Object.keys(filters).some(key => KEYS.concat('sort').indexOf(key) < 0)) throw invalid();
  const out = {};
  KEYS.forEach(key => {
    let value = filters[key];
    if (value == null) value = null;
    else { if (typeof value !== 'string') throw invalid(); if (key === 'q') value = value.trim(); if (!validText(value) || Array.from(value).length > (key === 'q' || key === 'category' ? 80 : 120)) throw invalid(); if (value === '') value = null; }
    out[key] = value;
  });
  out.sort = filters.sort == null ? 'latest' : filters.sort;
  if (SORTS.indexOf(out.sort) < 0) throw invalid();
  return Object.freeze(out);
}
function readOptions(options = {}) {
  if (!object(options)) throw invalid();
  if (!Object.prototype.hasOwnProperty.call(options, 'official_filters')) return normalize();
  const raw = options.official_filters; if (typeof raw !== 'string') throw invalid();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { try { parsed = JSON.parse(decodeURIComponent(raw)); } catch (_) { throw invalid(); } }
  return normalize(parsed);
}
function urlForFilters(filters = {}) {
  const normalized = normalize(filters), minimal = {};
  KEYS.forEach(key => { if (normalized[key] !== null) minimal[key] = normalized[key]; });
  if (normalized.sort !== 'latest') minimal.sort = normalized.sort;
  return '/pages/list/index?kind=official&official_filters=' + encodeURIComponent(JSON.stringify(minimal));
}
function check(value) { if (!value) { const error = new Error('官方知识窗口或筛选回执不一致，请重新读取'); error.code = 'invalid_response'; throw error; } }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10);
}
function parseWindow(data, request) {
  const filters = normalize(request);
  check(data && Array.isArray(data.items) && data.items.length <= 60 && object(data.filters) && Object.keys(data.filters).length === 5 && KEYS.every(key => Object.prototype.hasOwnProperty.call(data.filters, key) && data.filters[key] === filters[key]));
  check(data.window_limit === 60 && data.requested_sort === filters.sort && data.effective_sort === (filters.category !== null ? 'latest' : filters.sort) && timestamp(data.as_of));
  const seen = new Set(), strings = ['name', 'category', 'ip_name', 'summary', 'era', 'origin', 'cover_url', 'tips'];
  const items = data.items.map(row => {
    check(object(row) && typeof row.id === 'string' && UUID.test(row.id) && !seen.has(row.id.toLowerCase())); seen.add(row.id.toLowerCase());
    const out = { id: row.id };
    strings.forEach(key => { check(row[key] === null || typeof row[key] === 'string' && validText(row[key])); out[key] = row[key]; });
    ['category', 'ip_name', 'era', 'origin'].forEach(key => { if (filters[key] !== null) check(row[key] === filters[key]); });
    ['view_count', 'favorite_count', 'importance_score'].forEach(key => { check(row[key] === null || typeof row[key] === 'number' && Number.isFinite(row[key])); out[key] = row[key]; });
    check(row.updated_at === null || timestamp(row.updated_at)); out.updated_at = row.updated_at;
    return out;
  });
  return { items, filters, requestedSort: data.requested_sort, effectiveSort: data.effective_sort, asOf: data.as_of, windowLimit: 60 };
}
const fields = { officialIPOptions: [], officialIPIndex: 0, officialIPLabel: '全部细分', officialEra: '', officialOrigin: '', officialRequestedSort: 'latest', officialEffectiveSort: 'latest', officialWindowNote: '', learningGroups: [] };
function reset(page, options) {
  page._officialRouteError = null;
  try { page._officialFilters = readOptions(options || {}); } catch (error) { page._officialRouteError = error; page._officialFilters = normalize(); }
  const f = page._officialFilters;
  page.setData(Object.assign({}, fields, { query: f.q || '', category: f.category || '' }));
  discard(page);
}
function discard(page) { page._officialPicker = null; page._officialRows = null; page._officialAccepted = null; page._officialShown = 0; }
function sync(page) {
  page._officialPicker = null;
  const official = page.isOfficialKnowledge(), f = page._officialFilters || normalize(), category = page.data.category;
  const ips = categories.ipOptions(category), ci = categories.OPTIONS.findIndex(x => x.code === category), ii = ips.findIndex(x => x.code === f.ip_name);
  page.setData({ isOfficial: official, officialCategoryIndex: Math.max(0, ci), officialCategoryLabel: category ? categories.label(category) : '全部分类', officialIPOptions: ips, officialIPIndex: Math.max(0, ii), officialIPLabel: f.ip_name || '全部细分', officialEra: f.era || '', officialOrigin: f.origin || '', officialRequestedSort: f.sort, officialEffectiveSort: category ? 'latest' : f.sort });
}
function requestFilters(page) { return normalize(Object.assign({}, page._officialFilters || normalize(), { q: page.data.query, category: page.data.category })); }
function ready(page, model) {
  const accepted = page._officialAccepted, identity = model.scope(page);
  return page.isOfficialKnowledge() && !page._gone && !page._hidden && !page.data.loading && !page.data.loadingMore && !page.data.error && !!identity && !!accepted && accepted.identity === identity && accepted.request === page._request;
}
function renderWindow(page) {
  const rows = page._officialRows || [], count = Math.min(page._officialShown, rows.length);
  const label = page.data.officialEffectiveSort === 'hot' ? '最新窗口内热度排序' : (page.data.officialEffectiveSort === 'important' ? '重要度优先' : '最近更新');
  page.setData({ items: rows.slice(0, count), hasMore: count < rows.length, officialWindowNote: label + ' · 已展示 ' + count + ' / 本次窗口 ' + rows.length + ' 条（最多 60 条，非全量统计）' });
}
function load(page, model) {
  if (page._gone || page._hidden) return Promise.resolve();
  discard(page); sync(page); page._officialReadIdentity = model.scope(page);
  let request;
  return model.remote(page, () => {
    if (page._officialRouteError) throw page._officialRouteError;
    request = requestFilters(page); page._officialFilters = request;
    return page.api.action('official-library', request);
  }, data => {
    const parsed = parseWindow(data, request);
    page._officialRows = model.items({ items: parsed.items }).map((row, i) => Object.assign(row, { ipName: parsed.items[i].ip_name || '', era: parsed.items[i].era || '', origin: parsed.items[i].origin || '' }));
    page._officialAccepted = { identity: model.scope(page), request: page._request, filters: request };
    page._officialShown = 20;
    page.setData({ officialRequest: page._request, freshness: model.freshness({ as_of: parsed.asOf }), officialEffectiveSort: parsed.effectiveSort }); renderWindow(page);
  }, { items: [], allItems: [], learningGroups: [], loadedSummary: '', pagingNote: '', categories: [], freshness: '', hasMore: false, loadingMore: false, officialWindowNote: '' });
}
function more(page, model) {
  if (!ready(page, model) || !page.data.hasMore) return;
  let current; try { current = requestFilters(page); } catch (_) { return; }
  if (JSON.stringify(current) !== JSON.stringify(page._officialAccepted.filters)) return;
  page._officialPicker = null; page._officialShown += 20; renderWindow(page);
}
function begin(page, model, field) { page._officialPicker = ready(page, model) ? { identity: model.scope(page), request: page._request, field } : null; }
function choose(page, model, field, event) {
  const token = page._officialPicker; page._officialPicker = null;
  if (!ready(page, model) || !token || token.field !== field || token.identity !== model.scope(page) || token.request !== page._request) return;
  const options = field === 'category' ? categories.OPTIONS : page.data.officialIPOptions;
  const selected = categories.selection(event && event.detail && event.detail.value, options);
  const old = field === 'category' ? page.data.category : page._officialFilters.ip_name || '';
  if (!selected || selected.code === old) return;
  if (field === 'category') { page._officialFilters = normalize(Object.assign({}, page._officialFilters, { category: selected.code, ip_name: null })); page.setData({ category: selected.code }); }
  else page._officialFilters = normalize(Object.assign({}, page._officialFilters, { ip_name: selected.code }));
  return page.load();
}
function currentEvent(page, model, event) { return ready(page, model) && event && event.currentTarget && String(event.currentTarget.dataset.request) === String(page._request); }
function sort(page, model, event) {
  if (!currentEvent(page, model, event) || page.data.category) return;
  const value = event.currentTarget.dataset.sort;
  if (SORTS.indexOf(value) < 0 || value === page._officialFilters.sort) return;
  page._officialFilters = normalize(Object.assign({}, page._officialFilters, { sort: value })); return page.load();
}
function clear(page, model, event) {
  if (!currentEvent(page, model, event)) return;
  const field = event.currentTarget.dataset.field;
  if (['era', 'origin'].indexOf(field) < 0 || page._officialFilters[field] === null) return;
  page._officialFilters = normalize(Object.assign({}, page._officialFilters, { [field]: null })); return page.load();
}
module.exports = { normalize, readOptions, urlForFilters, parseWindow, fields, reset, discard, sync, ready, load, more, begin, choose, sort, clear };
