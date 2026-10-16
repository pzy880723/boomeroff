const KEYS = ['daily_first_scan', 'daily_3_scans', 'daily_quiz', 'daily_post'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
function day(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
function parse(data) {
  if (!data || !Array.isArray(data.items)) { const error = new Error('任务统计不能替代实际任务条目，请重新读取'); error.code = 'task_items_missing'; throw error; }
  if (!data || !date(data.date) || !Array.isArray(data.items) || data.items.length !== 4 || !Array.isArray(data.pending_items) || data.pending_items.length > 50) throw new Error('任务接口未返回完整日期与任务条目，请重新读取');
  const seen = new Set(), queue = [];
  for (const item of data.pending_items) {
    if (!item || !UUID.test(item.pending_id) || item.id !== item.pending_id || seen.has(item.id) || typeof item.title !== 'string' || !integer(item.amount) || item.completed !== true || item.claimed !== false) throw new Error('待领经验条目未通过核对，请重新读取');
    seen.add(item.id);
    queue.push({ key: 'pending:' + item.id, id: item.id, title: item.title, kind: 'pending', params: { pending_id: item.id } });
  }
  const pendingCount = queue.length;
  for (const item of data.items) {
    if (!item || KEYS.indexOf(item.task_key) < 0 || item.id !== item.task_key || seen.has(item.id) || typeof item.title !== 'string' || typeof item.completed !== 'boolean' || typeof item.claimed !== 'boolean' || !integer(item.amount) || !Number.isFinite(item.progress) || !Number.isInteger(item.target) || item.target < 1) throw new Error('每日任务条目未通过核对，请重新读取');
    seen.add(item.id);
    if (item.completed && !item.claimed) queue.push({ key: 'daily:' + data.date + ':' + item.task_key, id: item.id, title: item.title, kind: 'daily', params: { task_key: item.task_key } });
  }
  return { date: data.date, pendingCount, dailyCount: queue.length - pendingCount, queue };
}
function receipt(value) {
  if (!value || value.ok !== true || !integer(value.amount) || !(integer(value.total_exp) || (value.amount === 0 && value.total_exp === null))) throw new Error('领取回包未通过核对');
  return { amount: value.amount, total: value.total_exp };
}
function amountText(value) { return (value > 0 ? '+' : '') + value; }
function outcomes(items) {
  const counts = { confirmed: 0, rejected: 0, unknown: 0, untouched: 0 }, labels = { confirmed: '服务器已确认', rejected: '服务器拒绝', unknown: '结果未确认', untouched: '未提交', claiming: '正在提交' };
  let total = 0;
  const rows = items.map(item => {
    if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status]++;
    if (item.status === 'confirmed') total += item.amount;
    return Object.assign({}, item, { statusText: labels[item.status], amountText: item.status === 'confirmed' ? amountText(item.amount) : '' });
  });
  return { rewardOutcomes: rows, rewardCounts: counts, rewardTotal: total, rewardTotalText: amountText(total), rewardProgress: (counts.confirmed + counts.rejected + counts.unknown) + ' / ' + items.length };
}
module.exports = { day, parse, receipt, amountText, outcomes };
