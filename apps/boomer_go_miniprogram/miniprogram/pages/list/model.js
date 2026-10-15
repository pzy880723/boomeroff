const sections = {
  knowledge: { title: '商品知识', action: 'knowledge' },
  official: { title: '官方知识库', action: 'knowledge' },
  training: { title: '培训课程', action: 'learning' },
  quiz: { title: '知识测验', action: 'learning' },
  'quiz-history': { title: '测验记录', action: 'quiz-history' },
  sop: { title: '门店 SOP', action: 'learning' },
  qa: { title: '门店问答', action: 'learning' },
  objectives: { title: '门店 OKR', action: 'objectives' },
  tasks: { title: '每日任务', action: 'tasks' },
  community: { title: 'BOOMER 圈', action: 'community' },
  activities: { title: '我的活动', action: 'activities' },
  vouchers: { title: '我的券包', action: 'vouchers' },
  'my-library': { title: '我的知识库', action: 'my-library' },
  favorites: { title: '我的收藏', action: 'my-library' },
  favorite: { title: '我的收藏', action: 'my-library' },
  history: { title: '识物记录', action: 'scan-history' },
  recognition: { title: '识物记录', action: 'scan-history' },
  'check-ins': { title: '成长签到', action: 'checkin-status' },
  profile: { title: '个人资料', action: 'profile' },
  settings: { title: '设置与帮助', action: 'profile' },
  notifications: { title: '通知详情', action: 'notifications' },
  conversations: { title: 'BOOMER 助手会话', action: 'conversation-list' },
  conversation: { title: 'BOOMER 助手对话', action: 'conversation-messages' }
};

function listParams(kind, query, category, source) {
  if (kind === 'check-ins') return { page_size: 20 };
  if (kind === 'tasks') return {};
  if (kind === 'knowledge' || kind === 'official') return { kind, q: query, category, source: kind === 'official' ? 'official' : source || 'product' };
  if (kind === 'sop' || kind === 'qa' || kind === 'training') return { kind, type: kind === 'qa' ? 'qa' : 'sop', category_id: category };
  return { kind, query, category };
}

function scope(page) {
  const value = page.session.get();
  const revision = typeof page.session.revision === 'function' ? page.session.revision() : '';
  return value ? value.userId + ':' + (value.shop ? value.shop.id : '') + ':' + (value.scopeVersion || '') + ':' + revision : '';
}

function remote(page, request, apply, clear) {
  const identity = scope(page);
  const serial = (page._request || 0) + 1;
  page._request = serial;
  page.setData(clear || {});
  return page.run(async () => {
    if (!identity) throw new Error('员工登录已失效，请重新登录');
    try {
      const data = await request();
      if (!page._gone && page._request === serial && scope(page) === identity) apply(data);
    } catch (error) {
      if (!page._gone && page._request === serial && scope(page) === identity) throw error;
    }
  });
}

function items(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('接口未返回原生列表数据，请重试或联系管理员');
  const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || '';
  return data.items.map((item) => {
    const snapshot = item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {};
    return {
    id: String(item.id == null ? item.key || '' : item.id),
    title: firstText(item.title, item.name, item.product_name, snapshot.name) || '未命名条目',
    body: firstText(item.summary, item.body, item.description, item.story, snapshot.summary),
    category: firstText(item.category, snapshot.category),
    cover_url: firstText(item.cover_url, item.image_url, snapshot.cover_url, snapshot.image_url),
    kind: item.kind || '',
    quizKind: item.quiz_kind || (item.favorite_id ? 'favorite' : ''),
    read: item.read === true,
    status: item.status || '',
    time: formatTime(item.updated_at || item.created_at || item.date) || '时间未提供',
    progress: typeof item.progress === 'number' ? item.progress : null,
    target: typeof item.target === 'number' ? item.target : null,
    completed: typeof item.completed === 'boolean' ? item.completed : null,
    claimed: typeof item.claimed === 'boolean' ? item.claimed : null,
    amount: typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null,
    taskKey: item.task_key || '',
    pendingId: item.pending_id || '',
    scoreText: typeof item.score === 'number' && typeof item.total === 'number' ? item.score + ' / ' + item.total : '',
    passedText: typeof item.passed === 'boolean' ? (item.passed ? '已通过' : '未通过') : ''
    };
  });
}

function taskItems(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('任务接口目前仅返回统计，尚未提供任务条目；请稍后重试。');
  const pending = Array.isArray(data.pending_items) ? data.pending_items : [];
  return Object.assign({}, data, { items: data.items.concat(pending).map((item) => Object.assign({}, item, {
    category: item.pending_id ? '待领经验' : '每日任务',
    status: item.claimed === true ? '已领取' : (item.completed === true ? '可领取' : (item.completed === false ? '进行中' : '状态待同步'))
  })) });
}

function checkinHistory(data) {
  if (!data || !data.history || !Array.isArray(data.history.items)) throw new Error('成长签到接口未返回历史记录，请重试');
  return Object.assign({}, data.history, { items: data.history.items.map((record) => ({
    id: record.id, title: record.check_in_date || '日期未提供', created_at: record.checked_at,
    body: '连续 ' + value(record.streak, false) + ' 天 · 经验 ' + value(record.exp_gained, false)
  })) });
}

function categories(data) {
  return (Array.isArray(data.categories) ? data.categories : []).map((item) => (
    typeof item === 'string' ? { id: item, name: item } : { id: String(item.id), name: item.name || item.title }
  ));
}

function detailUrl(kind, id) {
  return '/pages/detail/index?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id);
}

function libraryKind(item) {
  return item && ['knowledge', 'favorite', 'official', 'history', 'recognition'].indexOf(item.kind) >= 0 ? item.kind : 'favorite';
}

function quizUrl(kind, id) {
  return '/pages/quiz/index?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id);
}

function formatTime(stamp) {
  const time = stamp ? Date.parse(stamp) : NaN;
  if (!Number.isFinite(time)) return '';
  const china = new Date(time + 8 * 3600000);
  return china.toISOString().slice(5, 16).replace('T', ' ');
}

function freshness(data) {
  const readable = formatTime(data && (data.updated_at || data.as_of || data.fetched_at));
  return readable ? (data.stale ? '缓存数据 · ' : '数据更新 · ') + readable : '服务器未提供更新时间';
}

function notificationCategory(category) {
  const labels = { notice: '工作通知', schedule: '排班通知', shift: '排班通知', learning: '学习通知', training: '学习通知', quiz: '学习通知', news: '门店动态', message: '助手消息' };
  return labels[category] || (typeof category === 'string' && /[\u4e00-\u9fff]/.test(category) ? category : '工作通知');
}

function value(number, money) {
  return typeof number === 'number' && Number.isFinite(number) ? (money ? '¥' + number.toFixed(2) : String(number)) : '暂无数据';
}

function pagination(page, data, requestedPage) {
  page._cursor = data.next_cursor || null;
  page._nextPage = data.has_more ? (Number.isInteger(data.page) ? data.page : requestedPage || 0) + 1 : null;
  return !!page._cursor || page._nextPage !== null;
}

async function loadMore(page, action, params) {
  if (!page.data.hasMore || page.data.loadingMore) return;
  const serial = page._request;
  const identity = scope(page);
  const nextPage = page._nextPage;
  page.setData({ loadingMore: true, error: '' });
  try {
    const response = await page.api.action(action, Object.assign({}, params, { cursor: page._cursor, page: nextPage }));
    const data = action === 'checkin-status' ? checkinHistory(response) : response;
    if (page._gone || identity !== scope(page) || serial !== page._request) return;
    const existing = page.data.items;
    const next = items(data).filter((item) => !existing.some((old) => old.id === item.id));
    page.setData({ items: existing.concat(next), hasMore: pagination(page, data, nextPage) });
  } catch (error) {
    if (!page._gone && identity === scope(page) && serial === page._request) page.setData({ error: error.message || '加载更多失败，请重试' });
  } finally { if (!page._gone) page.setData({ loadingMore: false }); }
}

module.exports = { sections, scope, remote, items, categories, detailUrl, quizUrl, freshness, formatTime, notificationCategory, value, pagination, loadMore, listParams, checkinHistory, libraryKind, taskItems };
