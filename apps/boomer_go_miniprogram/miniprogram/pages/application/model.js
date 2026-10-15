const { supabaseUrl } = require('../../config');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{64}$/i;
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const y = Number(value.slice(0, 4)), m = Number(value.slice(5, 7)), d = Number(value.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function time(value) { return timestamp(value) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ') : '未提供'; }
function scope(page) { const u = page.session.get(); return JSON.stringify([u && u.userId, u && u.shop && u.shop.id, u && u.scopeVersion, page.session.revision ? page.session.revision() : null]); }
function text(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
function image(row, boundPrefix) {
  const path = row && text(row.path), url = row && text(row.signed_url);
  let available = false;
  if (path && path.startsWith(boundPrefix) && path.length > boundPrefix.length && url && row.error === null) {
    const prefix = supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/sign/voucher-screenshots/';
    if (url.startsWith(prefix)) {
      const rest = url.slice(prefix.length), split = rest.indexOf('?');
      try { available = split > 0 && decodeURIComponent(rest.slice(0, split)) === path && /^token=[A-Za-z0-9_.-]+$/.test(rest.slice(split + 1)) && !/(^|\/)\.\.(\/|$)|\/\/|[%?#\\\r\n]/.test(path); } catch (_) {}
    }
  }
  return { path, url: available ? url : '', available, status: available ? '查看原图' : '原路径保留，暂不可预览' };
}
function imageView(row, index) { return { index, available: row.available, url: row.url, status: row.status }; }
function parseDetail(row, ids, shop) {
  const a = row && row.application, act = row && row.activity, p = a && a.publish;
  if (!row || row.shop_id !== shop || !a || a.id !== ids.id || a.activity_id !== ids.activityId || !act || act.id !== ids.activityId || typeof row.version !== 'string' || !VERSION.test(row.version) || !timestamp(row.server_time) || !p || typeof p.confirmed !== 'boolean' || !Array.isArray(p.screenshots) || ![p.note, p.url].every(v => v === null || typeof v === 'string')) throw new Error('申请详情回执不匹配，请重新核验');
  const images = p.screenshots.map(value => { if (!value || typeof value.path !== 'string' || !value.path) throw new Error('原证据路径缺失，不能打开编辑器'); return image(value, 'publish/' + ids.id + '/'); });
  const fields = Array.isArray(act.form_fields) ? act.form_fields : [];
  const answers = [];
  for (const answer of Array.isArray(a.answers) ? a.answers : []) {
    const field = fields.find(f => f && f.key === answer.key && f.type === answer.type && (f.role || null) === (answer.role || null));
    if (!field || typeof field.key !== 'string' || field.key.startsWith('__') || !['text', 'phone', 'url', 'image', 'textarea', 'select'].includes(field.type) || (field.role && !['profile_screenshot', 'xhs_profile_url'].includes(field.role))) continue;
    const value = typeof answer.value === 'string' || typeof answer.value === 'number' || typeof answer.value === 'boolean' ? String(answer.value) : '';
    const digits = value.replace(/\D/g, '');
    answers.push({ key: field.key, label: text(field.label, '申请信息'), type: field.type, value: field.type === 'phone' ? digits ? '***' + digits.slice(-4) : '未提供' : field.type === 'image' ? '' : value, image: field.type === 'image' && answer.image ? image(answer.image, 'activity/' + ids.activityId + '/') : null });
  }
  return { version: row.version, serverTime: row.server_time, activityId: act.id, applicationId: a.id, shopId: shop, title: text(act.name, '活动申请'), platform: text(act.platform), name: text(a.applicant_name_masked, '顾客（脱敏信息未提供）'), phoneTail: /^\d{4}$/.test(a.applicant_phone_tail || '') ? a.applicant_phone_tail : '', status: ({ pending: '待审核', approved: '已审核', rejected: '已拒绝' })[a.status] || '未提供', createdAt: time(a.created_at), publish: { confirmed: p.confirmed, confirmed_at: p.confirmed_at, confirmed_by: p.confirmed_by, note: p.note, url: p.url, screenshots: images.map(v => v.path) }, images, answers };
}
function draftFrom(publish) { return { note: publish.note || '', url: publish.url || '', paths: publish.screenshots.slice() }; }
function ipv4(value) { const parts = value.split('.'); return parts.length === 4 && parts.every(v => /^\d{1,3}$/.test(v) && Number(v) <= 255); }
function httpUrl(value) {
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);
  if (!match) return false;
  const authority = match[1].slice(match[1].lastIndexOf('@') + 1);
  const pair = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!pair || (pair[2] !== undefined && Number(pair[2]) > 65535)) return false;
  let host = pair[1];
  if (host.startsWith('[')) {
    const halves = host.slice(1, -1).split('::');
    if (halves.length > 2) return false;
    const groups = halves.flatMap(v => v ? v.split(':') : []);
    let count = groups.length;
    const valid = groups.every((v, i) => { if (v.includes('.')) { count++; return i === groups.length - 1 && ipv4(v); } return /^[0-9a-f]{1,4}$/i.test(v); });
    return valid && (halves.length === 2 ? count < 8 : count === 8);
  }
  try { host = decodeURIComponent(host); } catch (_) { return false; }
  if (/^\d+(?:\.\d+){3}$/.test(host)) return ipv4(host);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host.length > 0 && host.length <= 253 && host.split('.').every(v => /^[A-Za-z0-9_\u0080-\uFFFF](?:[A-Za-z0-9_\u0080-\uFFFF-]{0,61}[A-Za-z0-9_\u0080-\uFFFF])?$/.test(v));
}
function orderedPaths(paths) { return paths.filter((path, index) => paths.indexOf(path) === index); }
function normalizeDraft(draft, allowed) {
  const note = draft.note.trim(), url = draft.url.trim();
  if (Array.from(note).length > 200) throw new Error('备注最多 200 字，请修改后再确认');
  if (Array.from(url).length > 500) throw new Error('发布链接最多 500 字符');
  if (url && !httpUrl(url)) throw new Error('请输入含有效主机的完整 HTTP(S) 发布链接');
  if (!draft.paths.every(p => allowed.includes(p))) throw new Error('只能保留或移除本申请原有发布截图');
  return { note: note || null, url: url || null, screenshots: orderedPaths(draft.paths) };
}
function receiptValid(row, payload, activityId, userId) {
  return !!(row && typeof payload.activity_id === 'string' && UUID.test(payload.activity_id) && payload.activity_id === activityId && row.request_id === payload.request_id && row.shop_id === payload.shop_id && row.application_id === payload.application_id && row.activity_id === payload.activity_id && row.target_confirmed === payload.target_confirmed && typeof row.version === 'string' && VERSION.test(row.version) && typeof row.replay === 'boolean' && (payload.target_confirmed ? timestamp(row.confirmed_at) && row.confirmed_by === userId : row.confirmed_at === null && row.confirmed_by === null));
}
function readbackMatches(server, confirmed) {
  const p = server.publish, r = confirmed.receipt, body = confirmed.payload;
  return server.version === r.version && p.confirmed === body.target_confirmed && p.confirmed_at === r.confirmed_at && p.confirmed_by === r.confirmed_by && (p.note || '').trim() === (body.note || '') && (p.url || '').trim() === (body.url || '') && JSON.stringify(orderedPaths(p.screenshots)) === JSON.stringify(orderedPaths(body.screenshots));
}
function transactionAborted(error) {
  return !!(error && ((error.status === 400 && error.code === 'invalid_params') || (error.status === 404 && error.code === 'not_found') || (error.status === 409 && error.code === 'version_conflict') || (error.status === 422 && ['screenshot_not_allowed', 'note_too_long', 'invalid_url'].includes(error.code))));
}
function requestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }
module.exports = { UUID, VERSION, timestamp, time, scope, imageView, parseDetail, draftFrom, normalizeDraft, receiptValid, readbackMatches, transactionAborted, requestId };
