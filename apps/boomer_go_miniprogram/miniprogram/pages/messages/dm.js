const { supabaseUrl } = require('../../config');
const model = require('../list/model');

function capture(page) {
  return JSON.stringify([model.scope(page), page._epoch || 0, page.data.section || '', page.data.peerId || '']);
}
function active(page, context) { return !page._gone && page._visible !== false && capture(page) === context; }
function rows(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('消息接口未返回列表，请重试');
  return data.items;
}
function person(row) {
  if (!row || !row.user_id) throw new Error('联系人资料未完整返回');
  const name = row.name || '同事';
  return { id: row.user_id, name, initial: name.slice(0, 1), avatar: /^https:\/\//.test(row.avatar_url || '') ? row.avatar_url : '', position: row.position || '', shop: row.shop_name || '门店信息未提供', isContact: row.is_contact === true };
}
function people(data, section) {
  return rows(data).map((row) => {
    const item = person(section === 'contacts' ? row : row.peer);
    if (section === 'contacts') return item;
    const last = row.last_message || {};
    return Object.assign(item, { preview: last.preview || '暂无文字摘要', time: model.formatTime(last.created_at), unread: Number.isInteger(row.unread_count) && row.unread_count >= 0 ? row.unread_count : null });
  });
}
function decodeToken(token) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const value = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  let bits = 0, count = 0, escaped = '';
  for (const char of value.replace(/=+$/, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('invalid token');
    bits = (bits << 6) | digit; count += 6;
    if (count >= 8) { count -= 8; escaped += '%' + ((bits >> count) & 255).toString(16).padStart(2, '0'); }
  }
  return JSON.parse(decodeURIComponent(escaped));
}
function attachment(row, sender) {
  if (!row) return null;
  const view = { kind: row.kind, url: '', name: row.name || '附件', error: '' };
  if (row.error) { view.error = row.error === 'attachment_expired' ? '附件链接已过期，请刷新会话' : row.error === 'attachment_not_accessible' ? '当前附件签名不可用，可刷新重试' : '附件来源不可用，请联系发送者'; return view; }
  try {
    if (['image', 'video', 'file'].indexOf(row.kind) < 0) throw new Error('kind');
    const prefix = supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/sign/';
    if (typeof row.url !== 'string' || row.url.indexOf(prefix) !== 0) throw new Error('origin');
    const parts = row.url.slice(prefix.length).split('?');
    const path = decodeURIComponent(parts[0]);
    if (parts.length !== 2 || !/^token=[^&#]+$/.test(parts[1]) || /[\\\s%]/.test(path) || path.split('/').indexOf('..') >= 0 || path.indexOf('chat-attachments/' + sender + '/') !== 0) throw new Error('path');
    const payload = decodeToken(decodeURIComponent(parts[1].slice(6)));
    if (payload.url !== path || !Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now() + 60000 || payload.transform) throw new Error('expired');
    view.url = row.url;
  } catch (_) { view.error = '附件链接无效或已过期，请刷新会话'; }
  return view;
}
function message(row, self, peer) {
  if (!row || !row.id || !row.cursor || !row.created_at || !((row.sender_id === self && row.receiver_id === peer) || (row.sender_id === peer && row.receiver_id === self)) || row.mine !== (row.sender_id === self)) throw new Error('消息参与人或回执不符，已停止展示');
  const fullMessage = { id: row.id, sender_id: row.sender_id, receiver_id: row.receiver_id, mine: row.mine, body: typeof row.body === 'string' ? row.body : null, attachment: row.attachment || null, created_at: row.created_at, read_at: row.read_at || null, cursor: row.cursor };
  return { id: row.id, mine: row.mine, body: fullMessage.body || '', stamp: row.created_at, time: model.formatTime(row.created_at) || '时间未提供', readAt: row.read_at || null, cursor: row.cursor, attachment: attachment(row.attachment, row.sender_id), fullMessage };
}
function messages(data, self, peer) {
  if (!data || data.peer_id !== peer || ['asc', 'desc'].indexOf(data.order) < 0) throw new Error('会话返回对象不一致，请重试');
  return rows(data).map((row) => message(row, self, peer));
}
function merge(existing, incoming) {
  const map = new Map(existing.map((row) => [row.id, row]));
  incoming.forEach((row) => {
    const previous = map.get(row.id);
    if (previous && previous.readAt && !row.readAt) row = Object.assign({}, row, { readAt: previous.readAt, fullMessage: Object.assign({}, row.fullMessage, { read_at: previous.readAt }) });
    map.set(row.id, row);
  });
  return Array.from(map.values()).sort((a, b) => a.stamp === b.stamp ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : (a.stamp < b.stamp ? -1 : 1));
}
module.exports = { capture, active, rows, person, people, attachment, message, messages, merge };
