const text = (value) => typeof value === 'string' ? value.trim() : '';
const monthValid = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function dateValid(value, month) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 7) !== month) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function decode(data, context) {
  const { month, view, userId, shopId } = context;
  const invalid = () => { throw new Error('排班返回的日期、人员或门店范围不一致，请重试同步'); };
  if (!data || typeof data !== 'object') return invalid();
  // A malformed v2 response must never fall back to a less restrictive legacy DTO.
  const modern = ['rows', 'view', 'can_view_shop'].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  if (!modern) {
    const rows = data.items || data.schedules;
    if (view !== 'mine' || !Array.isArray(rows) || (data.month && data.month !== month)) return invalid();
    const defs = Array.isArray(data.shift_defs) ? data.shift_defs : [];
    const items = rows.map((row, index) => {
      if (!row || (Object.prototype.hasOwnProperty.call(row, 'user_id') && row.user_id !== userId) || (Object.prototype.hasOwnProperty.call(row, 'is_self') && row.is_self !== true)) return invalid();
      const date = text(row.date || row.work_date).slice(0, 10);
      if (!dateValid(date, month)) return invalid();
      const shift = defs.find((def) => def.code === row.shift_code && def.shop_id === row.shop_id) || {};
      return { id: text(row.id) || 'legacy-' + date + '-' + index, date,
        title: text(row.title) || text(shift.name) || text(row.shift_code) || '班次待同步',
        start: text(row.start_time) || text(shift.start_time), end: text(row.end_time) || text(shift.end_time),
        shop: text(row.shop_name), shopId: text(row.shop_id), userId, name: '', code: text(row.shift_code),
        isRest: false, isSelf: true, note: text(row.note) };
    });
    return { items: sort(items), conflicts: [], canViewShop: false, revoked: false };
  }
  if (data.month !== month || data.view !== view || data.shop_id !== shopId || typeof data.can_view_shop !== 'boolean' || !Array.isArray(data.rows) || !Array.isArray(data.conflicts)) return invalid();
  if (view === 'shop' && !data.can_view_shop) {
    if (data.rows.length || data.conflicts.length) return invalid();
    return { items: [], conflicts: [], canViewShop: false, revoked: true };
  }
  const keys = new Set();
  const items = data.rows.map((row) => {
    if (!row || !dateValid(row.work_date, month) || !text(row.user_id) || typeof row.is_self !== 'boolean' || typeof row.is_rest !== 'boolean') return invalid();
    if (row.is_self !== (row.user_id === userId) || (view === 'mine' && !row.is_self) || (view === 'shop' && row.shop_id !== shopId)) return invalid();
    const id = [row.work_date, row.user_id, row.shop_id || '', row.is_rest ? 'rest' : 'work'].join(':');
    if (keys.has(id)) return invalid();
    keys.add(id);
    return { id, date: row.work_date, userId: row.user_id, shopId: text(row.shop_id),
      name: text(row.display_name), shop: text(row.shop_name), code: text(row.shift_code),
      title: row.is_rest ? '休息' : text(row.shift_name) || text(row.shift_code) || '班次待同步',
      start: row.is_rest ? '' : text(row.start_time), end: row.is_rest ? '' : text(row.end_time),
      isRest: row.is_rest, isSelf: row.is_self, note: '' };
  });
  const conflicts = data.conflicts.map((entry) => {
    if (!entry || !dateValid(entry.work_date, month) || !text(entry.user_id) || !Number.isSafeInteger(entry.count) || entry.count < 2 || (view === 'mine' && entry.user_id !== userId)) return invalid();
    if (view === 'shop' && ((Object.prototype.hasOwnProperty.call(entry, 'shop_id') && entry.shop_id !== shopId) || !items.some((item) => item.date === entry.work_date && item.userId === entry.user_id && item.shopId === shopId))) return invalid();
    return { date: entry.work_date, userId: entry.user_id, count: entry.count };
  });
  return { items: sort(items), conflicts, canViewShop: data.can_view_shop === true && !!shopId, revoked: false };
}

function sort(items) { return items.sort((a, b) => (a.date + a.start + a.userId).localeCompare(b.date + b.start + b.userId)); }

function calendar(month, selected, entries) {
  const parts = month.split('-').map(Number);
  const offset = (new Date(parts[0], parts[1] - 1, 1).getDay() + 6) % 7;
  const count = new Date(parts[0], parts[1], 0).getDate();
  const days = [];
  for (let index = 0; index < offset; index++) days.push({ key: 'blank-' + index, date: '', day: '', shifts: [] });
  for (let day = 1; day <= count; day++) {
    const date = month + '-' + String(day).padStart(2, '0');
    const rows = entries.filter((entry) => entry.date === date);
    const work = rows.filter((entry) => !entry.isRest), rest = rows.filter((entry) => entry.isRest);
    days.push({ key: date, date, day, selected: date === selected, shifts: work.map((entry) => entry.title),
      restCount: rest.length, status: work.length ? (rest.length ? 'mixed' : 'scheduled') : rest.length ? 'rest' : 'unscheduled' });
  }
  return days;
}

function groups(items) {
  const result = [];
  for (const item of items) {
    const key = [item.date, item.shopId, item.code, item.title, item.start, item.end, item.isRest].join(':');
    let group = result.find((entry) => entry.key === key);
    if (!group) { group = Object.assign({ key, members: [] }, item); result.push(group); }
    group.members.push({ id: item.id, name: item.name || '姓名待同步', isSelf: item.isSelf });
  }
  return result;
}

module.exports = { monthValid, dateValid, decode, calendar, groups };
