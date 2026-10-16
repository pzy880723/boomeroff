function stale() { return Object.assign(new Error('页面或员工身份已变化，旧通知读取已停止'), { code: 'stale_operation' }); }
function banner(value) { return typeof value === 'string' && /^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/.test(value) ? value : ''; }
async function read(api, id, current) {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new Error('通知编号无效，请从列表重新进入');
  const seen = new Set();
  for (let page = 0; ; page++) {
    if (!current()) throw stale();
    const data = await api.action('notifications', { page, page_size: 20 });
    if (!current()) throw stale();
    if (!data || data.page !== page || data.page_size !== 20 || typeof data.has_more !== 'boolean' || !Array.isArray(data.items) || data.items.length > 20
      || data.items.some(row => !row || typeof row.id !== 'string' || !row.id) || new Set(data.items.map(row => row.id)).size !== data.items.length
      || !data.items.length && data.has_more) throw new Error('通知分页返回异常，请重新读取');
    const fingerprint = JSON.stringify(data.items.map(row => row.id));
    if (seen.has(fingerprint)) throw new Error('通知列表已变化或分页重复，请重新读取');
    seen.add(fingerprint);
    const item = data.items.find(row => row.id === id);
    if (item) {
      if (typeof item.title !== 'string' || typeof item.body !== 'string') throw new Error('通知内容返回不完整，请重新读取');
      return { item: { ...item, summary: typeof item.summary === 'string' ? item.summary : '', cover_url: banner(item.image_url) }, as_of: data.as_of };
    }
    if (!data.has_more) throw new Error('该通知已移除、过期或当前不可见，请返回列表刷新');
  }
}
module.exports = { read, banner };
