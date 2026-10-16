const model = require('./notification-manage');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = value => typeof value === 'string' && UUID.test(value);
const error = (status, code) => Object.assign(Error(status === 403 ? '当前账号没有系统通知管理权限' : '通知返回或请求未能核对，请保留原稿与原编号，只读重查'), { status, code });
function restRequest(name, body) {
  const operation = name.slice('rest:notification-manage-'.length), params = [['select', model.FIELDS.join(',')]];
  if (operation === 'list' || operation === 'read') {
    const keys = operation === 'list' ? ['userId'] : ['userId','id'];
    if (!body || Object.keys(body).length !== keys.length || Object.keys(body).some(k => !keys.includes(k)) || !uuid(body.userId) || operation === 'read' && !uuid(body.id)) throw error(400, 'invalid_params');
    if (operation === 'list') params.push(['order', 'created_at.desc,id.desc'], ['limit', '50']); else params.push(['id', 'eq.' + body.id]);
  } else {
    if (!['create','update','delete'].includes(operation)) throw error(400, 'invalid_params');
    model.validateIntent(body); if (operation !== body.operation) throw error(400, 'invalid_params');
    if (operation !== 'create') for (const field of model.FIELDS) params.push([field, body.base[field] === null ? 'is.null' : 'eq.' + body.base[field]]);
  }
  return { path: '/rest/v1/notifications?' + params.map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
    method: { list: 'GET', read: 'GET', create: 'POST', update: 'PATCH', delete: 'DELETE' }[operation],
    data: operation === 'create' ? { id: body.id, ...body.payload } : operation === 'update' ? body.payload : undefined,
    headers: ['create','update','delete'].includes(operation) ? { Prefer: 'return=representation' } : {} };
}
function createNotificationManageApi({ session, transport, snapshot, settled, ensureFresh, assertState }) {
  function context(before, actor) {
    assertState(before);
    const user = session.get(), token = session.token && session.token();
    if (!user || !uuid(user.userId) || typeof token !== 'string' || !token || /\s/.test(token)) throw error(401, 'unauthorized');
    if (actor !== undefined && user.userId !== actor) throw error(409, 'stale_operation');
    return user;
  }
  function entitled(user) { const p = user.bootstrap && user.bootstrap.permissions; return Array.isArray(p) && p.every(x => typeof x === 'string') && p.includes('role.manage'); }
  async function gate(before) {
    await ensureFresh(before); const user = context(before);
    if (!entitled(user)) return false;
    const allowed = await settled(before, transport('rpc:user_has_permission', { _user_id: user.userId, _perm: 'role.manage' }));
    assertState(before);
    await ensureFresh(before); const latest = context(before, user.userId);
    if (typeof allowed !== 'boolean') throw error(502, 'notification_manage_unconfirmed');
    return entitled(latest) && allowed === true;
  }
  async function data(operation, body, before) {
    const allowed = await gate(before);
    const user = context(before, body.userId);
    if (!allowed || !entitled(user)) throw error(403, 'forbidden');
    const response = await settled(before, transport('rest:notification-manage-' + operation, body));
    assertState(before);
    const stillAllowed = await gate(before);
    assertState(before);
    if (!stillAllowed) throw error(403, 'forbidden');
    return response;
  }
  return {
    async notificationManageCapabilities(...args) {
      if (args.length) throw error(400, 'invalid_params');
      const before = snapshot(), allowed = await gate(before);
      assertState(before); return { can_manage: allowed };
    },
    async notificationManageList(...args) {
      if (args.length) throw error(400, 'invalid_params'); const before = snapshot(), user = context(before);
      const rows = await data('list', { userId: user.userId }, before);
      assertState(before);
      if (!Array.isArray(rows) || rows.length > 50) throw error(502, 'notification_manage_unconfirmed');
      const items = rows.map(model.row); if (new Set(items.map(x => x.id)).size !== items.length) throw error(502, 'notification_manage_unconfirmed'); return { items };
    },
    async notificationManageRead(...args) {
      if (args.length !== 1 || !uuid(args[0])) throw error(400, 'invalid_params'); const before = snapshot(), user = context(before), id = args[0];
      const rows = await data('read', { userId: user.userId, id }, before);
      assertState(before);
      if (!Array.isArray(rows) || rows.length > 1) throw error(502, 'notification_manage_unconfirmed');
      if (!rows.length) return null; const row = model.row(rows[0]); if (row.id !== id) throw error(502, 'notification_manage_unconfirmed'); return row;
    },
    async notificationManageWrite(...args) {
      if (args.length !== 1) throw error(400, 'invalid_params'); model.validateIntent(args[0]);
      const intent = JSON.parse(JSON.stringify(args[0])), before = snapshot();
      context(before, intent.userId);
      const rows = await data(intent.operation, intent, before);
      assertState(before);
      if (!Array.isArray(rows) || rows.length !== 1 || !model.match(intent, rows[0])) throw error(409, 'notification_manage_unconfirmed');
      return intent.operation === 'delete' ? { operation: 'delete', id: intent.id, deleted: true } : { operation: intent.operation, id: intent.id, row: model.row(rows[0]) };
    },
  };
}
module.exports = { createNotificationManageApi, restRequest };
