const form = require('../../shared/activity-form');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const TYPES = ['text', 'phone', 'url', 'image', 'textarea', 'select'];
const TYPE_OPTIONS = TYPES.map((value, i) => ({ value, label: ['文本', '手机号', '网址', '图片', '多行文本', '选择'][i] }));
const KEYS = ['name', 'description', 'voucher_id', 'form_fields', 'status', 'requires_review', 'starts_at', 'ends_at', 'min_followers'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = o => o !== null && Object.prototype.toString.call(o) === '[object Object]';
const uuid = value => typeof value === 'string' && UUID.test(value);
function check(value, message = '活动管理数据未通过范围或格式核对，请重新读取') { if (!value) { const e = new Error(message); e.code = 'invalid_response'; throw e; } }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10);
}
function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && equal(a[k], b[k]));
}
function frozen(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(k => frozen(value[k])); Object.freeze(value); } return value; }
function caps(r, shop) { check(r && r.shop_id === shop && typeof r.can_view === 'boolean' && typeof r.can_manage === 'boolean' && (!r.can_manage || r.can_view)); return { canView: r.can_view, canManage: r.can_manage }; }
function detail(r, shop, id) {
  check(r && r.shop_id === shop && typeof r.version === 'string' && HASH.test(r.version) && timestamp(r.server_time));
  const a = r.activity; check(object(a) && a.id === id && uuid(a.id) && KEYS.every(k => own(a, k)));
  ['name', 'description', 'status'].forEach(k => check(a[k] === null || typeof a[k] === 'string'));
  check((a.voucher_id === null || uuid(a.voucher_id)) && typeof a.requires_review === 'boolean' && (a.min_followers === null || typeof a.min_followers === 'number' && Number.isFinite(a.min_followers)));
  ['starts_at', 'ends_at'].forEach(k => check(a[k] === null || timestamp(a[k])));
  const row = { id: a.id }; KEYS.forEach(k => { row[k] = form.cloneJson(a[k]); });
  let voucher = null;
  if (r.voucher !== null) { const v = r.voucher; check(object(v) && v.id === a.voucher_id && uuid(v.id) && (v.name === null || typeof v.name === 'string') && typeof v.active === 'boolean' && typeof v.deleted === 'boolean'); voucher = { id: v.id, name: v.name, active: v.active, deleted: v.deleted }; }
  return { activity: row, version: r.version, serverTime: r.server_time, voucher };
}
function candidatePage(r, p) {
  check(r && r.shop_id === p.shop_id && r.limit === p.limit && r.cursor === (p.cursor || null) && Array.isArray(r.items) && r.items.length <= p.limit && typeof r.has_more === 'boolean');
  check(r.next_cursor === null || typeof r.next_cursor === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(r.next_cursor));
  check(!r.has_more || r.items.length > 0 && r.next_cursor && r.next_cursor !== (p.cursor || null)); check(r.has_more || r.next_cursor === null);
  const seen = new Set(), rows = r.items.map(v => {
    check(object(v) && uuid(v.id) && !seen.has(v.id) && timestamp(v.created_at)); seen.add(v.id);
    ['name', 'threshold_type'].forEach(k => check(v[k] === null || typeof v[k] === 'string'));
    ['discount_amount', 'min_spend', 'valid_days'].forEach(k => check(v[k] === null || typeof v[k] === 'number' && Number.isFinite(v[k])));
    ['starts_at', 'ends_at'].forEach(k => check(v[k] === null || timestamp(v[k])));
    return { id: v.id, name: v.name || '未命名优惠券', amountText: v.discount_amount === null ? '金额未提供' : '¥' + v.discount_amount,
      ruleText: v.threshold_type === 'none' ? '无门槛' : v.threshold_type === 'min_spend' ? (v.min_spend === null ? '门槛金额未提供' : '满 ¥' + v.min_spend) : '使用门槛待核对', daysText: v.valid_days === null ? '有效天数未提供' : '领取后 ' + v.valid_days + ' 天' };
  }); return { items: rows, hasMore: r.has_more, nextCursor: r.next_cursor };
}
function bytes(value) { return Array.from(JSON.stringify(value)).reduce((n, c) => { const x = c.codePointAt(0); return n + (x <= 127 ? 1 : x <= 2047 ? 2 : x <= 65535 ? 3 : 4); }, 0); }
function bounds(base, p) {
  if (own(p, 'min_followers')) check(p.min_followers <= 2147483647, '粉丝数要求不能超过 2147483647');
  if (!own(p, 'form_fields')) return;
  check(p.form_fields.length <= 50 && bytes(p.form_fields) <= 65536, '报名字段最多 50 项，定义大小最多 65536 字节；原文未截断');
  const old = new Map((base && Array.isArray(base.form_fields) ? base.form_fields : []).map(f => [f.key, f]));
  p.form_fields.forEach(f => {
    check(Array.from(f.key).length <= 64, '字段 key 最多 64 字'); const previous = old.get(f.key);
    for (const [key, max] of [['label', 100], ['placeholder', 200]]) if (!previous || !equal(previous[key], f[key])) check(f[key] == null || typeof f[key] === 'string' && Array.from(f[key]).length <= max, '字段标题最多 100 字，提示最多 200 字');
    if ((!previous || !equal(previous.options, f.options)) && f.options != null) check(Array.isArray(f.options) && f.options.length <= 50 && f.options.every(x => typeof x === 'string' && Array.from(x).length <= 100), '每字段最多 50 个选项，每项最多 100 字');
  });
}
function patch(base, draft) { const p = form.changedPatch(base, draft); if (base) check(!own(p, 'status'), '状态需要单独明确确认，不能与资料保存合并'); bounds(base, p); return p; }
function expected(base, p) {
  if (p.operation === 'create') return Object.assign({ name: '', description: null, voucher_id: null, form_fields: [], status: 'active', requires_review: false, starts_at: null, ends_at: null, min_followers: 0 }, form.cloneJson(p.patch));
  return Object.assign(form.cloneJson(base.activity), p.patch ? form.cloneJson(p.patch) : {});
}
function instant(value) {
  if (typeof value !== 'string') return null;
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value); if (!m) return null;
  const time = Date.parse(m[1] + m[3]); return Number.isFinite(time) ? String(time / 1000) + ':' + (m[2] || '').padEnd(6, '0') : null;
}
function matches(d, record) {
  const r = record.receipt, e = record.expected, a = d.activity;
  return d.version === r.version && a.id === r.activity_id && KEYS.every(k => k === 'starts_at' || k === 'ends_at' ? a[k] === e[k] || instant(a[k]) !== null && instant(a[k]) === instant(e[k]) : equal(a[k], e[k]));
}
function receipt(r, p, actor) {
  check(r && r.shop_id === p.shop_id && r.request_id === p.request_id && r.operation === p.operation && r.actor_id === actor && uuid(r.activity_id) && (p.operation === 'create' || r.activity_id === p.activity_id) && typeof r.version === 'string' && HASH.test(r.version) && r.deleted === (p.operation === 'delete') && timestamp(r.recorded_at) && typeof r.replay === 'boolean', '原请求回执未通过完整核对，结果仍待确认');
  const out = {}; ['shop_id', 'request_id', 'operation', 'actor_id', 'activity_id', 'version', 'deleted', 'recorded_at', 'replay'].forEach(k => { out[k] = r[k]; }); return out;
}
function status(r, p, actor) {
  check(r && r.shop_id === p.shop_id && r.operation === p.operation && r.request_id === p.request_id && r.requested_activity_id === (p.operation === 'create' ? null : p.activity_id), '原请求状态范围不一致');
  check(r.state === 'not_found' && r.receipt === null || r.state === 'succeeded' && object(r.receipt)); return r.state === 'succeeded' ? receipt(r.receipt, p, actor) : null;
}
function dateParts(value) { const normalized = typeof value === 'string' ? value.replace(/\.(\d{3})Z$/, '.$1000Z') : value; if (!timestamp(normalized)) return { date: '', time: '' }; const t = new Date(Date.parse(normalized) + 8 * 3600000).toISOString(); return { date: t.slice(0, 10), time: t.slice(11, 16) }; }
function draftField(fields, key, patch) {
  const next = form.cloneJson(fields), changes = form.cloneJson(patch), seen = new Set();
  check(Array.isArray(next) && object(changes));
  next.forEach(f => { check(object(f) && typeof f.key === 'string' && !!f.key.trim() && f.key.indexOf('\0') < 0 && Array.from(f.key).length <= 64 && !seen.has(f.key)); seen.add(f.key); });
  const field = next.find(f => f.key === key);
  check(field && TYPES.indexOf(field.type) >= 0 && (field.role == null || field.role === 'profile_screenshot' || field.role === 'xhs_profile_url'));
  Object.keys(changes).forEach(k => {
    const value = changes[k];
    check(k === 'label' || k === 'placeholder' ? typeof value === 'string'
      : k === 'type' ? TYPES.indexOf(value) >= 0
      : k === 'required' ? typeof value === 'boolean'
      : k === 'role' ? value === null || value === 'profile_screenshot' || value === 'xhs_profile_url'
      : k === 'options' && Array.isArray(value) && value.every(x => typeof x === 'string'));
    field[k] = value;
  });
  return next;
}
function fieldViews(fields, expanded) {
  if (!Array.isArray(fields)) return [];
  return fields.map((f, i) => {
    if (!object(f) || typeof f.key !== 'string') return { key: 'invalid-' + i, label: '旧字段无法安全编辑', readonly: true, invalid: true, expanded: false, options: [] };
    const knownRole = f.role == null || f.role === 'profile_screenshot' || f.role === 'xhs_profile_url', readonly = TYPES.indexOf(f.type) < 0 || !knownRole;
    const roles = [{ value: null, label: '普通字段' }]; if (f.type === 'image') roles.push({ value: 'profile_screenshot', label: '小红书主页截图' }); if (f.type === 'url' || f.type === 'text') roles.push({ value: 'xhs_profile_url', label: '小红书主页链接' });
    const roleConflict = !readonly && f.role != null && !roles.some(x => x.value === f.role);
    if (roleConflict) roles.push({ value: f.role, label: (f.role === 'profile_screenshot' ? '小红书主页截图' : '小红书主页链接') + '（与当前类型不兼容）' });
    return { key: f.key, label: typeof f.label === 'string' ? f.label : '旧字段标题未提供', typeLabel: TYPES.indexOf(f.type) < 0 ? '未知旧类型（原样保留）' : TYPE_OPTIONS[TYPES.indexOf(f.type)].label, typeIndex: Math.max(0, TYPES.indexOf(f.type)), required: f.required === true, placeholder: typeof f.placeholder === 'string' ? f.placeholder : '', readonly, invalid: false, expanded: expanded === f.key, roleOptions: roles, roleIndex: Math.max(0, roles.findIndex(x => x.value === (f.role || null))), roleConflict, roleLabel: knownRole ? '' : '未知旧角色（原样保留）', options: Array.isArray(f.options) ? f.options.map((value, index) => ({ index, value: typeof value === 'string' ? value : '旧选项无法编辑' })) : [] };
  });
}
const statusLabel = value => value === 'active' ? '已上线' : value === 'draft' ? '草稿' : value === 'closed' ? '已关闭' : '旧状态（原样保留）';
const errors = { version_conflict: '云端版本已变化，本地草稿及原请求保留；请先只读核对。', request_id_conflict: '原请求编号发生冲突，禁止替换载荷或自动建立新请求。', voucher_unavailable: '所选优惠券当前不可绑定，原请求结果仍需核对。', not_found: '活动不存在或当前不可访问，请核对原请求状态。', invalid_params: '参数未获服务器接受，原请求保留等待核对。', db_error: '云端暂不可用，请只读核对；不会自动重发。' };
function errorText(e) { return e && own(errors, e.code) ? errors[e.code] : '本次读取或操作尚未确认，请重试只读核对；不会自动发送。'; }
function ram(app) { return app._activityManagePending || (app._activityManagePending = Object.create(null)); }
function key(actor, shop, target) { return JSON.stringify([actor, shop, target || 'new']); }
function requestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }
function empty() { return { editorVisible: false, name: '', description: '', minFollowers: '', statusLabel: '', createStatus: 'active', reviewLabel: '', shopName: '', startDate: '', startTime: '', endDate: '', endTime: '', fields: [], fieldsMalformed: false, typeOptions: TYPE_OPTIONS, voucherName: '', voucherNotice: '', voucherOpen: false, vouchers: [], voucherLoading: false, voucherError: '', voucherHasMore: false, editable: false, canSave: false, canDelete: false, canSetStatus: false, pending: false, receiptConfirmed: false, saved: false, deleted: false, canRetrySame: false, canReconcile: false, conflict: false, dirty: false, loading: false, sending: false, confirming: false, error: '', validation: '', notice: '', readbackError: '' }; }
module.exports = { form, uuid, timestamp, check, equal, frozen, caps, detail, candidatePage, patch, expected, matches, receipt, status, dateParts, draftField, fieldViews, statusLabel, errorText, ram, key, requestId, empty, TYPE_OPTIONS };
