const model = require('../store-kb/model');
const markdown = require('../store-kb/markdown');
const ERROR_MESSAGES = Object.freeze({
  ai_budget_exhausted: 'AI 额度不足，请联系管理员；原稿未改动',
  ai_rate_limited: 'AI 起草请求过于频繁，请稍后再试；原稿未改动',
  ai_unavailable: 'AI 起草服务暂不可用；原稿未改动',
  ai_invalid_response: 'AI 未返回完整草稿，请重试；原稿未改动',
  reference_unavailable: '门店知识参考暂时无法读取；原稿未改动',
  ai_timeout: 'AI 起草超时；原稿未改动，请确认后再次生成',
  draft_scope_changed: '生成过程中门店或权限已变化，候选已停止接收；原稿未改动'
});
function errorMessage(e) {
  return e && typeof e.code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, e.code) ? ERROR_MESSAGES[e.code] : '未取得可用候选，原草稿与说明已保留。请明确重试，不会自动重新生成。';
}
function check(value) { model.check(value, 'AI 候选数据不完整或归属不匹配，原草稿未改变'); }
function input(binding, title, hint) {
  model.check(typeof title === 'string' && typeof hint === 'string', '请输入有效标题和说明');
  const topic = title.trim(), normalizedHint = hint.trim();
  model.check(topic && Array.from(topic).length <= 200, '生成主题来自标题，请填写 1-200 字标题');
  model.check(Array.from(normalizedHint).length <= 2000, '生成说明最多 2000 字，输入未被截断');
  return { shop_id: binding.shop_id, type: binding.type, topic, hint: normalizedHint };
}
function parse(r, p, existingTags) {
  check(r && r.shop_id === p.shop_id && r.type === p.type && r.topic === p.topic && r.hint === p.hint && r.persisted === false && model.timestamp(r.generated_at));
  check(Array.isArray(r.categories));
  const categoryIds = new Set(), categories = r.categories.map(c => {
    check(c && model.UUID.test(c.id) && !categoryIds.has(c.id) && c.type === p.type && (c.shop_id === p.shop_id || c.shop_id === null) && typeof c.name === 'string' && c.name.trim() && Number.isFinite(c.sort_order));
    categoryIds.add(c.id); return { id: c.id, type: c.type, shop_id: c.shop_id, name: c.name };
  }), d = r.draft;
  check(d && typeof d.title === 'string' && d.title.trim() && Array.from(d.title).length <= 200 && typeof d.body === 'string' && d.body.trim() && Array.from(d.body).length <= 40000);
  check(Array.isArray(d.tags) && d.tags.length <= 20 && d.tags.every(t => typeof t === 'string' && t && t === t.trim() && Array.from(t).length <= 40 && t !== 'okr-highlight') && new Set(d.tags).size === d.tags.length);
  check(d.category_id === null || model.UUID.test(d.category_id) && categories.some(c => c.id === d.category_id));
  const tags = d.tags.slice(), preservedHighlight = existingTags.includes('okr-highlight');
  if (preservedHighlight) tags.push('okr-highlight');
  check(tags.length <= 20);
  check(Array.isArray(r.sources) && r.sources.length <= 5 && (r.reference_state === 'none' && r.sources.length === 0 || r.reference_state === 'matched' && r.sources.length > 0));
  const seen = new Set(), sources = r.sources.map(s => {
    check(s && model.UUID.test(s.id) && !seen.has(s.id) && typeof s.source_type === 'string' && s.source_type.trim() && (s.source_id === null || typeof s.source_id === 'string') && (s.shop_id === null || s.shop_id === p.shop_id) && typeof s.title === 'string' && s.title.trim());
    seen.add(s.id); return { title: s.title };
  });
  return { title: d.title.trim(), body: d.body, tags, categoryId: d.category_id, categoryName: d.category_id === null ? '不分类' : categories.find(c => c.id === d.category_id).name, categories,
    blocks: markdown.parse(d.body), sources, referenceLabel: r.reference_state === 'none' ? '未匹配到参考资料' : '参考资料', preservedHighlight };
}
module.exports = { input, parse, errorMessage };
