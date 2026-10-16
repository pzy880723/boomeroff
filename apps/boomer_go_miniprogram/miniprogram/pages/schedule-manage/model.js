const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{64}$/;
const SOFT = { weekday_unavailable: '不在可上班星期内', fixed_rest_weekday: '固定休息星期', day_off: '已有可见休假记录', blocked_shift: '该班次存在禁排提醒' };
function check(value, message) { if (!value) throw new Error(message || '排班数据或归属未通过核对，请重新读取'); }
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
function timestamp(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:[0-5]\d)$/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value)); }
function time(value) { return typeof value === 'string' && /^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?|24:00(?::00(?:\.0+)?)?)$/.test(value); }
function addDays(value, days) { check(date(value)); return new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
function monday(value) { check(date(value)); return addDays(value, -((new Date(value + 'T00:00:00Z').getUTCDay() + 6) % 7)); }
function today(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function scope(page) { const s = page.session.get(); return JSON.stringify([s && s.userId, s && s.shop && s.shop.id, s && s.scopeVersion, page.session.revision ? page.session.revision() : null, !!page.preview]); }
function binding(page) { const s = page.session.get(); check(s && UUID.test(s.userId) && s.shop && UUID.test(s.shop.id), '请先核验员工身份并选择授权门店'); return { shop_id: s.shop.id }; }
function name(value, user) { return typeof value === 'string' && value.trim() ? value : '姓名未解析 · ' + user; }
function caps(r, shop) {
  check(r && r.shop_id === shop && typeof r.can_view === 'boolean' && typeof r.can_arrange === 'boolean' && timestamp(r.server_time));
  check(Array.isArray(r.implemented_operations) && r.implemented_operations.length === 3 && ['create', 'update', 'delete'].every(op => r.implemented_operations.indexOf(op) >= 0));
  check(r.existing_permissions && ['shift_write', 'dayoff_write', 'swap', 'clear_week', 'ai_schedule'].every(k => typeof r.existing_permissions[k] === 'boolean'));
  return { canView: r.can_view, canArrange: r.can_arrange, serverTime: r.server_time };
}
function assignment(r, p) {
  check(r && UUID.test(r.assignment_id) && r.shop_id === p.shop_id && r.user_id === p.user_id && r.work_date === p.work_date && typeof r.shift_code === 'string' && ['manual', 'ai'].indexOf(r.source) >= 0 && VERSION.test(r.version));
  return { assignment_id: r.assignment_id, shop_id: r.shop_id, user_id: r.user_id, work_date: r.work_date, shift_code: r.shift_code, source: r.source, version: r.version };
}
function week(r, shop, start) {
  check(date(start) && monday(start) === start && r && r.shop_id === shop && r.week_start === start && r.week_end === addDays(start, 6) && VERSION.test(r.week_version) && timestamp(r.server_time) && Array.isArray(r.rows));
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), weekday: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i], rows: [] })), seen = new Set(), cells = new Set();
  r.rows.forEach(row => {
    check(row && UUID.test(row.user_id) && date(row.work_date) && row.work_date >= start && row.work_date <= r.week_end && (row.display_name === null || typeof row.display_name === 'string'));
    const a = assignment(row, { shop_id: shop, user_id: row.user_id, work_date: row.work_date });
    check(!seen.has(a.assignment_id) && !cells.has(a.user_id + a.work_date)); seen.add(a.assignment_id); cells.add(a.user_id + a.work_date);
    check(['resolved', 'ambiguous', 'unresolved'].indexOf(row.shift_status) >= 0);
    let shiftText;
    if (row.shift_status === 'resolved') { check(UUID.test(row.shift_id) && typeof row.shift_name === 'string' && time(row.start_time) && time(row.end_time)); shiftText = row.shift_name + ' ' + row.start_time.slice(0, 5) + '–' + row.end_time.slice(0, 5); }
    else { check(row.shift_id === null && row.shift_name === null && row.start_time === null && row.end_time === null); shiftText = row.shift_status === 'ambiguous' ? '班次代码不唯一，时间未解析' : '班次未解析，时间未提供'; }
    days.find(d => d.date === a.work_date).rows.push(Object.assign(a, { name: name(row.display_name, row.user_id), shiftText, shiftStatus: row.shift_status }));
  });
  return { days, version: r.week_version, end: r.week_end, serverTime: r.server_time };
}
function candidates(r, p) {
  check(r && r.shop_id === p.shop_id && r.work_date === p.work_date && typeof r.has_more === 'boolean' && Array.isArray(r.items) && r.items.length <= 20);
  let last = p.cursor || ''; const items = r.items.map(row => { check(row && UUID.test(row.user_id) && row.user_id > last && typeof row.display_name === 'string'); last = row.user_id; return { id: row.user_id, name: name(row.display_name, row.user_id) }; });
  check(r.has_more ? items.length > 0 && r.next_cursor === last && UUID.test(r.next_cursor) && r.next_cursor !== p.cursor : r.next_cursor === null, '候选分页未前进，请重新搜索');
  return { items, next: r.next_cursor, hasMore: r.has_more };
}
function cell(r, p) {
  check(r && r.shop_id === p.shop_id && r.user_id === p.user_id && r.work_date === p.work_date && VERSION.test(r.cell_version) && timestamp(r.server_time) && typeof r.can_save === 'boolean' && typeof r.can_delete === 'boolean' && typeof r.rules_visible === 'boolean' && Array.isArray(r.shifts) && Array.isArray(r.warnings));
  const a = r.assignment === null ? null : assignment(r.assignment, p), ids = new Set();
  const shifts = r.shifts.map(s => { check(s && UUID.test(s.id) && !ids.has(s.id) && (s.shop_id === null || s.shop_id === p.shop_id) && typeof s.code === 'string' && typeof s.name === 'string' && time(s.start_time) && time(s.end_time) && VERSION.test(s.version) && typeof s.selectable === 'boolean'); ids.add(s.id); return { id: s.id, shop_id: s.shop_id, code: s.code, name: s.name, time: s.start_time.slice(0, 5) + '–' + s.end_time.slice(0, 5), version: s.version, selectable: s.selectable }; });
  shifts.forEach(s => check(!s.selectable || shifts.filter(x => x.code === s.code).length === 1, '班次代码不唯一，不能按名称猜测'));
  const warnings = r.warnings.map(w => { check(w && (w.code === 'occupied_other_shop' ? w.level === 'hard' && w.shift_id === null : Object.prototype.hasOwnProperty.call(SOFT, w.code) && w.level === 'soft' && (w.code === 'blocked_shift' ? UUID.test(w.shift_id) && ids.has(w.shift_id) : w.shift_id === null))); return { code: w.code, shift_id: w.shift_id, level: w.level, label: w.code === 'occupied_other_shop' ? '当天已在其他门店排班，不能在此安排' : SOFT[w.code] }; });
  check(!r.can_delete || !!a);
  return { assignment: a, version: r.cell_version, shifts, warnings, hard: warnings.some(w => w.level === 'hard'), canSave: r.can_save, canDelete: r.can_delete, rulesVisible: r.rules_visible };
}
function initialShift(c) { const found = c.assignment && c.shifts.filter(s => s.code === c.assignment.shift_code && s.selectable); return found && found.length === 1 ? found[0].id : ''; }
function applicable(c, id) { const seen = new Set(); return c.warnings.filter(w => w.level === 'soft' && (w.shift_id === null || w.shift_id === id) && !seen.has(w.code) && seen.add(w.code)); }
function receipt(r, p, actor) {
  check(r && r.actor_id === actor && r.request_id === p.request_id && r.shop_id === p.shop_id && r.user_id === p.user_id && r.work_date === p.work_date && r.operation === p.operation && UUID.test(r.assignment_id) && (p.operation === 'create' || r.assignment_id === p.assignment_id) && VERSION.test(r.version) && r.deleted === (p.operation === 'delete') && timestamp(r.recorded_at) && typeof r.replay === 'boolean', '排班回执未通过精确核对，结果待确认');
  return { request_id: r.request_id, actor_id: r.actor_id, shop_id: r.shop_id, user_id: r.user_id, work_date: r.work_date, operation: r.operation, assignment_id: r.assignment_id, version: r.version, deleted: r.deleted, recorded_at: r.recorded_at, replay: r.replay };
}
function status(r, p, actor) {
  check(r && r.shop_id === p.shop_id && r.request_id === p.request_id && r.user_id === p.user_id && r.work_date === p.work_date && r.operation === p.operation && (r.state === 'not_found' && r.receipt === null || r.state === 'succeeded' && r.receipt), '原请求状态归属不匹配');
  return r.state === 'succeeded' ? receipt(r.receipt, p, actor) : null;
}
function matches(c, p, r) {
  if (c.hard) return false;
  if (p.operation === 'delete') return c.assignment === null;
  const a = c.assignment, s = c.shifts.find(s => s.id === p.shift_id && s.selectable);
  return !!(a && s && a.assignment_id === r.assignment_id && a.version === r.version && a.shift_code === s.code && a.source === 'manual');
}
function requestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }
function freeze(p) { Object.freeze(p.acknowledged_warnings); return Object.freeze(p); }
function ram(app) { return app._scheduleManagePending || (app._scheduleManagePending = Object.create(null)); }
function key(actor, p) { return JSON.stringify([actor, p.shop_id, p.user_id, p.work_date]); }
function records(app, page) { const s = page.session.get(); return s && s.shop ? Object.values(ram(app)).filter(r => r.actorId === s.userId && r.payload.shop_id === s.shop.id && !r.preview) : []; }
function aborted(e) { return !!(e && (e.status === 400 && e.code === 'invalid_params' || e.status === 404 && e.code === 'not_found' || e.status === 409 && ['version_conflict', 'occupied_other_shop', 'shift_ambiguous', 'warnings_unacknowledged'].indexOf(e.code) >= 0 || e.status === 422 && e.code === 'invalid_shift')); }
module.exports = { UUID, VERSION, check, date, timestamp, addDays, monday, today, scope, binding, name, caps, week, candidates, cell, initialShift, applicable, receipt, status, matches, requestId, freeze, ram, key, records, aborted };
