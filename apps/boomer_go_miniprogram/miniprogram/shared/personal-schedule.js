const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
const invalid = () => failure(502, 'invalid_schedule_response', '排班返回的日期、人员或范围不一致，请重新同步');
const unauthorized = () => failure(401, 'unauthorized', '登录身份未能核对，请重新登录');
const staleScope = () => failure(403, 'erp_scope_not_ready', 'ERP 权限未能确认，请重新同步员工身份');

function monthRange(value) {
  const month = value === undefined ? new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7) : value;
  if (typeof month !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw failure(400, 'invalid_params', '月份应为 YYYY-MM');
  const from = month + '-01', end = new Date(from + 'T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return { month, from, to: end.toISOString().slice(0, 10) };
}

function project(data, uid, range) {
  if (!data || data.date !== range.from || data.from !== range.from || data.to !== range.to || data.shop_id !== null ||
      !['store', 'hq'].includes(data.scope) || typeof data.can_view_shop !== 'boolean' || !Array.isArray(data.rows) || !Array.isArray(data.conflicts)) throw invalid();
  if ([...data.rows, ...data.conflicts].some(row => !row || typeof row.user_id !== 'string' || !UUID.test(row.user_id))) throw invalid();
  const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= range.from && value <= range.to &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const nullableText = value => value === null || typeof value === 'string';
  const rows = data.rows.filter(row => row && row.user_id === uid).map(row => {
    if (!dateValid(row.work_date) || typeof row.is_rest !== 'boolean' || !(row.shop_id === null || typeof row.shop_id === 'string' && UUID.test(row.shop_id))) throw invalid();
    for (const key of ['shop_name', 'display_name', 'shift_code', 'shift_name', 'start_time', 'end_time', 'source']) if (!nullableText(row[key])) throw invalid();
    return {
      work_date: row.work_date, shop_id: row.shop_id, shop_name: row.shop_name, user_id: uid, display_name: row.display_name,
      shift_code: row.is_rest ? null : row.shift_code, shift_name: row.is_rest ? null : row.shift_name,
      start_time: row.is_rest ? null : row.start_time, end_time: row.is_rest ? null : row.end_time,
      source: row.source, is_rest: row.is_rest, is_self: true
    };
  });
  const conflicts = data.conflicts.filter(entry => entry && entry.user_id === uid).map(entry => {
    if (!dateValid(entry.work_date) || !Number.isSafeInteger(entry.count) || entry.count < 2) throw invalid();
    return { work_date: entry.work_date, user_id: uid, count: entry.count };
  });
  return { month: range.month, view: 'mine', shop_id: null, can_view_shop: false, rows, conflicts };
}

async function readPersonalSchedule(params, { userId, token, request }) {
  const range = monthRange(params.month);
  if (!userId || !token) throw unauthorized();
  const call = async (name, body = {}, options) => {
    try { return await request(name, body, options); }
    catch (error) {
      if (error.code === 'stale_operation') throw error;
      if (error.status === 401 || ['28000', 'PGRST301'].includes(error.code)) throw unauthorized();
      if (error.status === 403 || error.code === '42501') throw staleScope();
      throw failure(error.status === 400 ? 400 : 500, 'schedule_unavailable', '本人排班暂不可用，请稍后重新同步');
    }
  };
  const actor = await call('auth:user', {}, { accessToken: token });
  if (!actor || actor.id !== userId) throw unauthorized();
  if (await call('rpc:erp_scope_fresh_v1') !== true) throw staleScope();
  const data = await call('rpc:list_shift_schedules_v1', { _from: range.from, _to: range.to, _shop_id: null });
  if (await call('rpc:erp_scope_fresh_v1') !== true) throw staleScope();
  return project(data, userId, range);
}

module.exports = { readPersonalSchedule };
