const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const image = value => /^https:\/\/[a-z0-9.-]+(?::443)?\//i.test(text(value)) ? value : '';
const filterValue = filter => filter === 'confirmed' ? true : filter === 'unconfirmed' ? false : null;

function time(value) {
  const date = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '时间未提供';
}

function basic(response, context) {
  const row = response && response.item;
  if (!row || row.id !== context.id || row.shop_id !== context.shopId || !text(row.name)) throw new Error('活动标识或门店与当前范围不一致，请重试。');
  const labels = { draft: '草稿', active: '进行中', paused: '已暂停', closed: '已关闭' };
  return { id: row.id, name: row.name, description: text(row.description), coverUrl: image(row.cover_url), posterUrl: image(row.poster_url),
    statusLabel: labels[row.status] || '状态待确认', platform: text(row.platform), startsAt: time(row.starts_at), endsAt: time(row.ends_at), createdAt: time(row.created_at),
    maxApplications: Number.isSafeInteger(row.max_applications) && row.max_applications >= 0 ? row.max_applications : null,
    reviewLabel: typeof row.requires_review === 'boolean' ? (row.requires_review ? '需审核' : '无需审核') : '',
    minFollowers: Number.isSafeInteger(row.min_followers) && row.min_followers >= 0 ? row.min_followers : null,
    fieldLabels: (Array.isArray(row.form_fields) ? row.form_fields : []).map(field => text(field && field.label)).filter(Boolean).join('、') };
}

function capabilities(response, shopId) {
  if (!response || response.shop_id !== shopId || typeof response.can_manage !== 'boolean' || typeof response.can_confirm_publish !== 'boolean'
    || response.can_upload_evidence !== false) throw new Error('活动管理权限尚未确认，请重试。');
  return { canManage: response.can_manage, canConfirmPublish: response.can_confirm_publish, canUploadEvidence: false };
}

function application(row, context) {
  if (!row || !uuid(row.id) || row.activity_id !== context.id || typeof row.publish_confirmed !== 'boolean' || typeof row.has_publish_url !== 'boolean'
    || !Number.isSafeInteger(row.publish_screenshot_count) || row.publish_screenshot_count < 0) throw new Error('申请列表条目返回不完整，请重试当前页。');
  const status = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
  return { id: row.id, maskedName: text(row.applicant_name_masked) || '姓名未提供',
    phoneTail: typeof row.applicant_phone_tail === 'string' && /^\d{4}$/.test(row.applicant_phone_tail) ? row.applicant_phone_tail : '',
    statusLabel: status[row.status] || '审核状态待确认', createdAt: time(row.created_at), publishConfirmed: row.publish_confirmed,
    publishConfirmedAt: row.publish_confirmed_at ? time(row.publish_confirmed_at) : '', hasPublishUrl: row.has_publish_url, screenshotCount: row.publish_screenshot_count };
}

function page(response, context, cursor) {
  if (!response || response.shop_id !== context.shopId || response.activity_id !== context.id || response.publish_confirmed !== filterValue(context.filter)
    || response.order !== 'desc' || !Array.isArray(response.items) || typeof response.has_more !== 'boolean'
    || (response.next_cursor !== null && typeof response.next_cursor !== 'string')
    || (response.has_more && (!response.next_cursor || response.next_cursor === cursor))) throw new Error('申请分页范围或游标不一致，请重试当前页。');
  const items = response.items.map(row => application(row, context));
  if (context.filter !== 'all' && items.some(row => row.publishConfirmed !== filterValue(context.filter))) throw new Error('申请发布筛选与返回条目不一致，请重试。');
  return { items, nextCursor: response.next_cursor, hasMore: response.has_more };
}

function merge(previous, next) {
  const seen = new Set();
  return previous.concat(next).filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; });
}

function emptyApplications() { return { applications: [], applicationsLoaded: false, applicationsLoading: false, applicationsError: '', nextCursor: null, hasMore: false }; }
function emptyCapabilities() { return { capabilitiesLoaded: false, capabilitiesLoading: false, capabilitiesError: '', canManage: false, canConfirmPublish: false, canUploadEvidence: false }; }
function empty() { return { activity: null, basicLoading: false, basicError: '', ...emptyApplications(), ...emptyCapabilities() }; }

module.exports = { uuid, filterValue, basic, capabilities, page, merge, empty, emptyApplications, emptyCapabilities };
