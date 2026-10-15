function text(value) { return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''; }
function media(value) { return typeof value === 'string' && /^https:\/\/[^\s/@]+\//i.test(value) ? value : ''; }
function author(value) {
  const item = value || {};
  return { user_id: text(item.user_id), name: text(item.name), avatar_url: media(item.avatar_url) };
}
function time(value) {
  const date = Date.parse(value);
  return Number.isFinite(date) ? new Date(date + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '';
}
function statistics(value) {
  return value && typeof value.liked === 'boolean' && Number.isSafeInteger(value.likes_count) && value.likes_count >= 0 && Number.isSafeInteger(value.comments_count) && value.comments_count >= 0
    ? { liked: value.liked, likesCount: value.likes_count, commentsCount: value.comments_count } : null;
}
function checked(value) {
  if (!value || typeof value !== 'object' || value.ok === false || value.error || value.persisted === false) throw new Error('服务器尚未确认结果，请重新核对');
  return value;
}
function postView(row) {
  const fields = [], sections = [];
  for (const [key, label] of [['era', '年代'], ['origin', '产地'], ['material', '材质'], ['craft', '工艺'], ['dimensions', '尺寸'], ['condition', '品相'], ['rarity', '稀有度（原帖）']]) {
    if (text(row[key])) fields.push({ label, value: text(row[key]) });
  }
  const add = (title, entries) => { if (entries.length) sections.push({ title, entries }); };
  for (const [key, title] of [['story', '商品故事'], ['description', '商品介绍'], ['appreciation', '鉴赏要点'], ['care_tips', '养护建议'], ['collection_value', '收藏参考'], ['market_value', '市场参考（原帖）'], ['buy_reason', '入手理由（原帖）']]) {
    if (text(row[key])) add(title, [{ body: text(row[key]) }]);
  }
  add('核心卖点', (Array.isArray(row.selling_points) ? row.selling_points : []).map(point => typeof point === 'string' ? { body: point } : {
    title: text(point && point.tag), body: [text(point && point.text), text(point && point.detail)].filter(Boolean).join('\n'),
  }).filter(point => point.body));
  const tips = row.tips;
  add('实用提示', typeof tips === 'string' && text(tips) ? [{ body: text(tips) }] : Array.isArray(tips) ? tips.map(body => ({ body: text(body) })).filter(item => item.body) : tips && typeof tips === 'object'
    ? [['memory', '记忆提示'], ['objection', '异议应对']].filter(([key]) => text(tips[key])).map(([key, title]) => ({ title, body: text(tips[key]) })) : []);
  return { post: { id: row.id, name: text(row.name), category: text(row.category), imageUrl: media(row.image_url) || media(row.thumbnail_url),
    author: author(row.author), mine: row.mine === true, time: time(row.created_at) }, fields, sections };
}
function commentView(row, postId) {
  if (!row || typeof row.id !== 'string' || !row.id || row.post_id !== postId || typeof row.content !== 'string' || !row.content.trim() || typeof row.mine !== 'boolean'
    || !row.author || typeof row.author.user_id !== 'string' || !row.author.user_id || typeof row.created_at !== 'string' || !time(row.created_at) || typeof row.cursor !== 'string' || !row.cursor) {
    throw new Error('评论返回不完整，请重试核对');
  }
  return { id: row.id, post_id: row.post_id, author: author(row.author), mine: row.mine, content: row.content, created_at: row.created_at, time: time(row.created_at), cursor: row.cursor };
}
function mergeComments(...groups) {
  const rows = new Map();
  for (const group of groups) for (const row of group) rows.set(row.id, row);
  // Keep sub-millisecond ordering; Date.parse alone collapses server microseconds.
  return [...rows.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    || text((a.created_at.match(/\.(\d+)/) || [])[1]).padEnd(6, '0').localeCompare(text((b.created_at.match(/\.(\d+)/) || [])[1]).padEnd(6, '0'))
    || a.id.localeCompare(b.id));
}
function empty() {
  return { post: null, fields: [], sections: [], comments: [], liked: null, likesCount: null, commentsCount: null, canInteract: false,
    detailLoading: false, commentsLoading: false, commentsLoaded: false, writing: '', detailError: '', commentsError: '', likeError: '', sendError: '',
    hasMore: false, nextCursor: null, draft: '', draftLocked: false, notice: '', unavailable: false, keyboardInset: 0 };
}
module.exports = { author, statistics, checked, postView, commentView, mergeComments, empty };
