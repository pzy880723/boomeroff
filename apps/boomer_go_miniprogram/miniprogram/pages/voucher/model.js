const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseCode(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^[A-Za-z0-9]{8}$/.test(text)) return text.toUpperCase();
  const match = /^https:\/\/ai\.boomeroff\.com(?::443)?\/me\/vouchers\/redeem\/([A-Za-z0-9]{8})\/?$/.exec(text);
  return match ? match[1].toUpperCase() : '';
}
function scope(page) {
  const user = page.session.get();
  return JSON.stringify([user && user.userId, user && user.shop && user.shop.id, user && user.scopeVersion, page.session.revision ? page.session.revision() : null]);
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function time(value) {
  if (!timestamp(value)) return '未提供';
  return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ');
}
function money(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? '¥' + value : '金额未提供'; }
const reasons = { development_preview: '开发示例不可核销', already_redeemed: '该券已核销', void: '该券已作废', not_claimed: '该券尚未领取', expired: '该券已过期', voucher_unavailable: '该券当前不可使用', permission_denied: '当前账号没有核销权限', no_redeem_permission: '当前账号没有核销权限' };
function reason(value) { return reasons[value] || '是否可核销以服务器核验为准'; }
function lookupValid(row, shopId, code) {
  const claim = row && row.claim, voucher = claim && claim.voucher;
  return !!(row && row.shop_id === shopId && timestamp(row.server_time) && typeof row.can_redeem === 'boolean' && claim && UUID.test(claim.id) && claim.code === code && typeof claim.status === 'string' && voucher && UUID.test(voucher.id));
}
function text(value, fallback) { return typeof value === 'string' && value ? value : fallback; }
function lookupView(row) {
  const claim = row.claim, voucher = claim.voucher;
  const amount = money(voucher.discount_amount);
  const threshold = money(voucher.min_spend);
  const statuses = { claimed: '已领取', redeemed: '已核销', expired: '已过期', void: '已作废', unclaimed: '未领取' };
  return {
    title: text(voucher.name, '优惠券'), code: claim.code, status: statuses[claim.status] || '状态待核验', amount,
    rule: voucher.threshold_type === 'none' ? '无消费门槛' : voucher.threshold_type === 'min_spend' ? '满 ' + threshold + ' 可用' : '消费门槛未提供',
    terms: text(voucher.template_terms, '未提供使用条款，请核对门店规则'),
    claimedAt: time(claim.claimed_at), expiresAt: time(claim.expires_at), redeemedAt: time(claim.redeemed_at),
    startsAt: time(voucher.starts_at), endsAt: time(voucher.ends_at), active: voucher.active === true ? '启用' : voucher.active === false ? '停用' : '未提供',
    recipient: text(claim.recipient_name_masked, '未提供脱敏信息'), phoneTail: /^\d{4}$/.test(claim.recipient_phone_tail || '') ? claim.recipient_phone_tail : '',
    checkedAt: time(row.server_time), reason: row.can_redeem ? '' : reason(row.reason)
  };
}
function receiptValid(row, pending) {
  const payload = pending.payload;
  return !!(row && row.request_id === payload.request_id && row.shop_id === payload.shop_id && row.claim_id === pending.claimId && row.code === payload.code && row.status === 'redeemed' && row.redeemed_by_me === true && timestamp(row.redeemed_at) && typeof row.replay === 'boolean');
}
function transactionAborted(error) {
  const status = error && error.status, code = error && error.code;
  return (status === 400 && code === 'invalid_params') || (status === 404 && code === 'not_found') ||
    (status === 409 && (code === 'already_redeemed' || code === 'void' || code === 'not_claimed' || code === 'voucher_unavailable')) ||
    (status === 410 && code === 'expired');
}
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
module.exports = { parseCode, scope, timestamp, time, lookupValid, lookupView, receiptValid, transactionAborted, requestId, reason };
