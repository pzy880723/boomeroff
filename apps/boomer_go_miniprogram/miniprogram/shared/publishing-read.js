const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const labels = { pending: '等待发布', claimed: '准备发布', queued: '排队中', scheduled: '已定时', running: '发布中', success: '已成功', done: '全部成功', partial: '部分成功', failed: '失败', cancelled: '已取消' };
const text = value => typeof value === 'string' ? value : '';
const statusLabel = value => Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : '未知状态：' + value;
function invalid() { return new Error('发布记录来源或格式未能核对，请刷新后重试'); }
function date(value, optional) {
  if (optional && value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw invalid();
  return value;
}
function job(row, shopId, id) {
  if (!row || typeof row.id !== 'string' || !uuid.test(row.id) || row.shop_id !== shopId || (id && row.id !== id) || typeof row.status !== 'string' || !row.status) throw invalid();
  return { id: row.id, title: text(row.title) || '未命名发布任务', kind: text(row.kind), status: row.status, statusLabel: statusLabel(row.status),
    createdAt: date(row.created_at), scheduleAt: date(row.schedule_at, true) };
}
function history(rows, shopId) {
  if (!Array.isArray(rows) || rows.length > 50) throw invalid();
  const seen = new Set();
  const items = rows.map(row => {
    const item = job(row, shopId);
    if (seen.has(item.id) || !Array.isArray(row.social_publish_targets) || row.social_publish_targets.some(t => !t || typeof t.platform !== 'string' || !t.platform)) throw invalid();
    seen.add(item.id);
    return Object.assign(item, { platforms: [...new Set(row.social_publish_targets.map(t => t.platform))] });
  });
  return { shopId, items, limit: 50 };
}
function detail(data, shopId, id) {
  const result = job(data && data.job, shopId, id);
  if (!Array.isArray(data.targets)) throw invalid();
  const seen = new Set();
  const targets = data.targets.map(row => {
    if (!row || typeof row.id !== 'string' || !uuid.test(row.id) || row.job_id !== id || seen.has(row.id) || typeof row.status !== 'string' || !row.status) throw invalid();
    seen.add(row.id);
    const url = text(row.platform_post_url);
    return { id: row.id, status: row.status, statusLabel: statusLabel(row.status), progress: typeof row.progress === 'number' && Number.isFinite(row.progress) ? Math.max(0, Math.min(100, row.progress)) : null,
      error: text(row.error_message), platform: text(row.platform) || text(row.account && row.account.platform), name: text(row.account && row.account.account_name),
      postUrl: /^https:\/\/[^\s\\]+$/i.test(url) ? url : '' };
  });
  return { shopId, job: result, targets };
}
module.exports = { uuid, history, detail };
