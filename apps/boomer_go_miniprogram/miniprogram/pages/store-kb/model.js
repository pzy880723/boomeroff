const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{64}$/;
const LIMITS = { title_chars: 200, body_chars: 40000, tags: 20, tag_chars: 40, query_chars: 200 };
function check(value, message) { if (!value) throw new Error(message || '返回数据不匹配，请重新读取'); }
function timestamp(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }
function typeValid(value) { return value === 'sop' || value === 'qa'; }
function scope(page) { const s = page.session.get(); return JSON.stringify([s && s.userId, s && s.shop && s.shop.id, s && s.scopeVersion, page.session.revision ? page.session.revision() : null, !!page.preview]); }
function binding(page) {
  const s = page.session.get();
  check(s && typeof s.userId === 'string' && s.userId && s.shop && (UUID.test(s.shop.id) || page.preview && s.shop.id === 'example-shop'), '请先选择已授权门店');
  check(typeValid(page._type) && (!page._id || UUID.test(page._id)), '页面参数无效');
  return { shop_id: s.shop.id, type: page._type };
}
function capture(page) { return { scope: scope(page), epoch: page._epoch, type: page._type, id: page._id }; }
function active(page, c) { return !!(c && page._visible && !page._gone && c.scope === scope(page) && c.epoch === page._epoch && c.type === page._type && c.id === page._id); }
function envelope(dto, b) { check(dto && dto.shop_id === b.shop_id && dto.type === b.type); }
function parseCaps(dto, b) {
  envelope(dto, b); check(typeof dto.can_write === 'boolean' && dto.limits && Object.keys(LIMITS).every(k => dto.limits[k] === LIMITS[k]), '维护权限返回不完整');
  return { canWrite: dto.can_write };
}
function parseCategories(rows, b) {
  check(Array.isArray(rows)); const seen = new Set();
  return rows.map(r => { check(r && UUID.test(r.id) && !seen.has(r.id) && r.type === b.type && (r.shop_id === b.shop_id || r.shop_id === null) && typeof r.name === 'string' && Number.isFinite(r.sort_order)); seen.add(r.id); return { id: r.id, name: r.name, shop_id: r.shop_id, type: r.type }; });
}
function parseEntry(r, b, full) {
  check(r && UUID.test(r.id) && r.type === b.type && (r.shop_id === b.shop_id || r.shop_id === null) && (r.category_id === null || UUID.test(r.category_id)) && typeof r.title === 'string' && Array.isArray(r.tags) && r.tags.every(t => typeof t === 'string') && Number.isFinite(r.sort_order) && timestamp(r.updated_at));
  check(typeof (full ? r.body : r.body_preview) === 'string');
  return { id: r.id, shop_id: r.shop_id, type: r.type, category_id: r.category_id, title: r.title, body: full ? r.body : '', bodyPreview: full ? '' : r.body_preview, tags: r.tags.slice(), scopeLabel: r.shop_id === null ? '共享 · 只读' : '本店', updatedAt: time(r.updated_at) };
}
function parseList(dto, p) {
  envelope(dto, p); check(dto.query === (p.q || '') && dto.category_id === (p.category_id || null) && dto.page === p.page && dto.page_size === p.page_size && typeof dto.has_more === 'boolean' && timestamp(dto.as_of) && Array.isArray(dto.items) && dto.items.length <= p.page_size);
  const categories = parseCategories(dto.categories, p), seen = new Set();
  const items = dto.items.map(r => { const row = parseEntry(r, p, false); check(!seen.has(row.id)); seen.add(row.id); return row; });
  return { items, categories, hasMore: dto.has_more, asOf: time(dto.as_of) };
}
function parseDetail(dto, b, id) {
  envelope(dto, b); check(VERSION.test(dto.version) && timestamp(dto.as_of) && typeof dto.can_edit === 'boolean' && typeof dto.can_delete === 'boolean');
  const entry = parseEntry(dto.entry, b, true); check(entry.id === id);
  return { entry, categories: parseCategories(dto.categories, b), version: dto.version, canEdit: entry.shop_id === b.shop_id && dto.can_edit, canDelete: entry.shop_id === b.shop_id && dto.can_delete, asOf: time(dto.as_of) };
}
function normalizeDraft(d, categories) {
  check(d && typeof d.title === 'string' && typeof d.body === 'string' && typeof d.tagsText === 'string', '草稿格式无效');
  const title = d.title.trim(), body = d.body, sourceTags = Array.isArray(d.tags) ? d.tags : d.tagsText.split(/[,，]/);
  const tags = Array.from(new Set(sourceTags.map(x => x.trim()).filter(Boolean)));
  check(title && Array.from(title).length <= 200, '标题必填，最多 200 字');
  check(Array.from(body).length <= 40000, '正文最多 40000 字，现有内容未被截断');
  check(tags.length <= 20 && tags.every(x => Array.from(x).length <= 40), '最多 20 个标签，每个最多 40 字');
  check(d.categoryId === null || categories.some(x => x.id === d.categoryId), '原分类不可用，请明确选择一个现有分类或不分类');
  return { title, body, tags, category_id: d.categoryId };
}
function draftFrom(entry) { return { title: entry.title, body: entry.body, tags: entry.tags.slice(), tagsText: entry.tags.join(', '), categoryId: entry.category_id }; }
function requestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); }); }
function freezePayload(p) { if (p.tags) Object.freeze(p.tags); return Object.freeze(p); }
function parseReceipt(r, p, userId) {
  check(r && r.shop_id === p.shop_id && r.type === p.type && r.request_id === p.request_id && r.operation === p.operation && r.actor_id === userId && UUID.test(r.entry_id) && (!p.entry_id || r.entry_id === p.entry_id) && VERSION.test(r.version) && r.deleted === (p.operation === 'delete') && timestamp(r.recorded_at) && typeof r.replay === 'boolean', '操作回执不匹配，结果仍待核对');
  return { shop_id: r.shop_id, type: r.type, request_id: r.request_id, operation: r.operation, actor_id: r.actor_id, entry_id: r.entry_id, version: r.version, deleted: r.deleted, recorded_at: r.recorded_at, replay: r.replay };
}
function parseStatus(r, p, userId) {
  check(r && r.shop_id === p.shop_id && r.type === p.type && r.request_id === p.request_id && r.operation === p.operation && r.requested_entry_id === (p.entry_id || null), '核对回执不匹配');
  check(r.state === 'not_found' && r.receipt === null || r.state === 'succeeded' && r.receipt, '核对状态无效');
  return r.state === 'succeeded' ? parseReceipt(r.receipt, p, userId) : null;
}
function matchesReadback(d, p, r) { const e = d.entry; return d.version === r.version && e.id === r.entry_id && e.shop_id === p.shop_id && e.type === p.type && e.title === p.title && e.body === p.body && e.category_id === p.category_id && JSON.stringify(e.tags) === JSON.stringify(p.tags); }
function ram(app) { return app._storeKbPending || (app._storeKbPending = Object.create(null)); }
function key(page) { const s = page.session.get(); return s && s.shop ? JSON.stringify([!!page.preview, s.userId, s.shop.id, page._type, page._id || 'new']) : ''; }
function transactionAborted(e) {
  return !!(e && (e.status === 400 && e.code === 'invalid_params' || e.status === 404 && e.code === 'not_found' || e.status === 409 && e.code === 'version_conflict' || e.status === 422 && ['invalid_category', 'title_too_long', 'body_too_long', 'invalid_tags'].includes(e.code)));
}
function notFound(e) { return e && e.status === 404 && e.code === 'not_found'; }
function time(value) { if (!timestamp(value)) return ''; const d = new Date(Date.parse(value) + 8 * 3600000); return String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
module.exports = { UUID, LIMITS, check, timestamp, typeValid, scope, binding, capture, active, parseCaps, parseList, parseDetail, normalizeDraft, draftFrom, requestId, freezePayload, parseReceipt, parseStatus, matchesReadback, ram, key, transactionAborted, notFound };
