function clone(value) { return JSON.parse(JSON.stringify(value)); }
function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}
function stale() { const error = new Error('当前页面已变化'); error.code = 'stale_operation'; return error; }
async function read(api, id, shopId, active) {
  const pages = new Set();
  for (let page = 0; ; page++) {
    if (!active()) throw stale();
    const data = await api.action('objectives', { page, page_size: 50 });
    if (!active()) throw stale();
    if (!data || data.shop_id !== shopId || data.page !== page || data.page_size !== 50 || typeof data.has_more !== 'boolean' || !Array.isArray(data.items) || data.items.length > 50) throw new Error('OKR 分页数据未确认，请重新读取');
    for (const item of data.items) {
      if (!item || typeof item.id !== 'string' || !item.id || (item.shop_id !== null && item.shop_id !== shopId)) throw new Error('OKR 来源门店不一致，请重新读取');
    }
    const item = data.items.find(item => item.id === id);
    if (item) {
      if (typeof item.title !== 'string' || !Array.isArray(item.key_results) || (item.key_actions !== null && typeof item.key_actions !== 'string')) throw new Error('OKR 内容格式未确认，请重新读取');
      return clone(item);
    }
    if (!data.has_more) throw new Error('未找到指定 OKR，可能已移除或当前无权读取');
    const signature = JSON.stringify(data.items.map(item => item.id));
    if (!data.items.length || pages.has(signature)) throw new Error('OKR 分页未前进，请刷新列表后重试');
    pages.add(signature);
  }
}
function views(results) {
  return results.map((item, index) => {
    const object = item && typeof item === 'object' && !Array.isArray(item);
    return {
      title: typeof item === 'string' ? item : object ? String(item.title || item.text || item.name || 'KR ' + (index + 1)) : 'KR ' + (index + 1),
      completed: !!(object && (item.done || item.completed || (typeof item.progress === 'number' && item.progress >= 100))),
      editable: typeof item === 'string' || !!object
    };
  });
}
function change(results, index, completed) {
  const next = clone(results), item = next[index];
  if (typeof item === 'string') next[index] = { text: item, done: completed };
  else if (item && typeof item === 'object' && !Array.isArray(item)) {
    const flags = ['done', 'completed'].filter(key => Object.prototype.hasOwnProperty.call(item, key));
    flags.forEach(key => { item[key] = completed; });
    if (typeof item.progress === 'number') {
      if (completed || item.progress >= 100) item.progress = completed ? 100 : 0;
    } else if (!flags.length) item.done = completed;
  }
  return next;
}
function matches(row, expected) {
  return row && row.id === expected.id && equal(row.key_results, expected.key_results) && row.key_actions === expected.key_actions;
}
function receipt(row, expected) {
  return matches(row, expected) && typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at));
}
module.exports = { clone, equal, read, views, change, matches, receipt };
