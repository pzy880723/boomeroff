const model = require('./manual-copy');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = value => typeof value === 'string' && UUID.test(value);
const FIELDS = 'id,user_id,shop_id,kind,output_text,meta,created_at';
const error = (code, message, status) => Object.assign(new Error(message), { code, status });
function projected(row, context, id) {
  model.ownedRow(context, row);
  if (row.id !== id || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw error('manual_copy_unconfirmed', '手工文案返回来源或格式未确认，请只读核对', 502);
  return { id: row.id, user_id: row.user_id, shop_id: row.shop_id, kind: row.kind, output_text: row.output_text, meta: JSON.parse(JSON.stringify(row.meta)), created_at: row.created_at };
}
function restRequest(name, body) {
  const operation = name.slice('rest:manual-copy-'.length);
  if (!['read', 'create', 'update', 'delete'].includes(operation)) throw error('invalid_params', '无效手工文案入口', 400);
  if (operation === 'read') {
    if (!body || Object.keys(body).length !== 3 || !validId(body.id) || !validId(body.userId) || !validId(body.shopId)) throw error('invalid_params', '缺少本人文案与当前门店绑定', 400);
  } else { model.validateIntent(body); if (body.operation !== operation) throw error('invalid_params', '文案操作不一致', 400); }
  const params = [['select', FIELDS]];
  if (operation !== 'create') {
    params.push(['id', 'eq.' + body.id], ['user_id', 'eq.' + body.userId], ['shop_id', 'eq.' + body.shopId], ['kind', 'eq.copy'], ['meta->>source', 'eq.manual_upload'], ['meta->>asset_class', 'eq.upload']);
    if (operation !== 'read') params.push(['output_text', body.baseOutputText === null ? 'is.null' : 'eq.' + body.baseOutputText]);
  }
  const data = operation === 'create' ? { id: body.id, user_id: body.userId, shop_id: body.shopId, kind: 'copy', output_text: body.outputText, meta: body.meta }
    : operation === 'update' ? { output_text: body.outputText } : undefined;
  return { path: '/rest/v1/marketing_assets?' + params.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&'),
    method: { read: 'GET', create: 'POST', update: 'PATCH', delete: 'DELETE' }[operation], data, headers: operation === 'read' ? {} : { Prefer: 'return=representation' } };
}
function createManualCopyApi({ session, transport, snapshot, settled, ensureFresh }) {
  function context() {
    const value = session.get();
    if (!value || !validId(value.userId) || !value.shop || !validId(value.shop.id)) throw error('invalid_params', '请先选择当前授权工作门店', 400);
    const token = session.token && session.token();
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw error('unauthorized', '请先登录员工账号', 401);
    return { userId: value.userId, shopId: value.shop.id };
  }
  async function manualCopyRead(id) {
    const before = snapshot(); await ensureFresh(before);
    const current = context();
    if (!validId(id)) throw error('invalid_params', '文案编号不合法', 400);
    const rows = await settled(before, transport('rest:manual-copy-read', Object.assign({ id }, current)));
    await ensureFresh(before);
    if (!Array.isArray(rows) || rows.length > 1) throw error('manual_copy_unconfirmed', '文案返回未能核对，请重试读取', 502);
    return rows.length ? projected(rows[0], current, id) : null;
  }
  async function manualCopyWrite(intent) {
    model.validateIntent(intent);
    // Freeze the caller's payload before any asynchronous freshness check.
    const frozen = JSON.parse(JSON.stringify(intent)), before = snapshot();
    await ensureFresh(before); const current = context();
    if (frozen.userId !== current.userId || frozen.shopId !== current.shopId) throw error('stale_operation', '账号或门店已变化，旧文案操作已停止', 409);
    const rows = await settled(before, transport('rest:manual-copy-' + frozen.operation, frozen));
    await ensureFresh(before);
    if (!Array.isArray(rows) || rows.length !== 1) throw error('manual_copy_unconfirmed', '服务器尚未返回唯一文案结果，请只读核对；不会自动重发', 409);
    const row = projected(rows[0], current, frozen.id);
    if (!model.matches(frozen, row)) throw error('manual_copy_unconfirmed', '文案内容回执未能核对，请只读核对；不会自动重发', 502);
    return frozen.operation === 'delete' ? { operation: 'delete', id: frozen.id, deleted: true } : { operation: frozen.operation, id: frozen.id, row };
  }
  return { manualCopyRead, manualCopyWrite };
}
module.exports = { createManualCopyApi, restRequest };
