const kb = require('../store-kb/model');
const VERSION = /^[0-9a-f]{64}$/;
const LIMITS = { name_chars: 200, sort_min: -2147483648, sort_max: 2147483647 };
function integer(n) { return Number.isInteger(n) && n >= LIMITS.sort_min && n <= LIMITS.sort_max; }
function envelope(r, b) { kb.check(r && r.shop_id === b.shop_id && r.type === b.type && typeof r.can_manage === 'boolean' && r.limits && Object.keys(LIMITS).every(k => r.limits[k] === LIMITS[k]) && kb.timestamp(r.as_of), '分类权限或门店返回不匹配'); }
function category(r, b) {
  kb.check(r && kb.UUID.test(r.id) && r.type === b.type && (r.shop_id === b.shop_id || r.shop_id === null) && typeof r.name === 'string' && integer(r.sort_order) && VERSION.test(r.version), '分类数据不完整或归属不匹配');
  return { id: r.id, shop_id: r.shop_id, type: r.type, name: r.name, sort_order: r.sort_order, version: r.version, scopeLabel: r.shop_id === null ? '共享 · 只读' : '本店' };
}
function parseList(r, p) {
  envelope(r, p); kb.check(r.page === p.page && r.page_size === p.page_size && typeof r.has_more === 'boolean' && Array.isArray(r.items) && r.items.length <= p.page_size);
  const seen = new Set(), items = r.items.map(x => { const c = category(x, p); kb.check(!seen.has(c.id)); seen.add(c.id); return c; });
  return { items, canManage: r.can_manage, hasMore: r.has_more };
}
function parseDetail(r, p) { envelope(r, p); const c = category(r.category, p); kb.check(c.id === p.id); return { category: c, canManage: r.can_manage && c.shop_id === p.shop_id }; }
function normalize(name, sort) {
  kb.check(typeof name === 'string' && name.trim() && Array.from(name.trim()).length <= 200, '分类名称必填，最多 200 字；现有内容未被截断');
  kb.check(typeof sort === 'string' && /^[+-]?\d+$/.test(sort.trim()) && integer(Number(sort.trim())), '排序必须是 -2147483648 到 2147483647 的整数');
  return { name: name.trim(), sort_order: Number(sort.trim()) };
}
function parseReceipt(r, p, user) {
  kb.check(r && r.shop_id === p.shop_id && r.type === p.type && r.request_id === p.request_id && r.operation === p.operation && r.actor_id === user && kb.UUID.test(r.category_id) && (!p.category_id || r.category_id === p.category_id) && VERSION.test(r.version) && r.deleted === (p.operation === 'delete') && kb.timestamp(r.recorded_at) && typeof r.replay === 'boolean', '分类操作回执不匹配，结果仍待核对');
  return { shop_id: r.shop_id, type: r.type, request_id: r.request_id, operation: r.operation, actor_id: r.actor_id, category_id: r.category_id, version: r.version, deleted: r.deleted, recorded_at: r.recorded_at, replay: r.replay };
}
function parseStatus(r, p, user) {
  kb.check(r && r.shop_id === p.shop_id && r.type === p.type && r.request_id === p.request_id && r.operation === p.operation && r.requested_category_id === (p.category_id || null) && (r.state === 'not_found' && r.receipt === null || r.state === 'succeeded' && r.receipt), '分类核对状态不匹配');
  return r.state === 'succeeded' ? parseReceipt(r.receipt, p, user) : null;
}
function matches(c, p, receipt) { return c.id === receipt.category_id && c.shop_id === p.shop_id && c.type === p.type && c.version === receipt.version && c.name === p.name && c.sort_order === p.sort_order; }
function ram(app) { return app._kbCategoryPending || (app._kbCategoryPending = Object.create(null)); }
function key(page, resource) { const s = page.session.get(); return JSON.stringify([!!page.preview, s && s.userId, s && s.shop && s.shop.id, page._type, resource || 'new']); }
function records(app, page) {
  const s = page.session.get(); if (!s || !s.shop) return [];
  return Object.values(ram(app)).filter(r => r.actorId === s.userId && r.preview === !!page.preview && r.payload && r.payload.shop_id === s.shop.id && r.payload.type === page._type);
}
function transactionAborted(e) {
  return !!(e && (e.status === 400 && e.code === 'invalid_params' || e.status === 404 && e.code === 'not_found' || e.status === 409 && (e.code === 'version_conflict' || e.code === 'category_reference_conflict') || e.status === 422 && (e.code === 'name_too_long' || e.code === 'invalid_sort_order')));
}
module.exports = { binding: kb.binding, scope: kb.scope, capture: kb.capture, active: kb.active, UUID: kb.UUID, check: kb.check, requestId: kb.requestId, notFound: kb.notFound, parseList, parseDetail, normalize, parseReceipt, parseStatus, matches, ram, key, records, transactionAborted };
