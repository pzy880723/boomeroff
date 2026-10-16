const knowledgeCategories = require('../../shared/knowledge-categories');
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
  vouchers: { title: '门店优惠券', action: 'vouchers' },
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
  if (historyCollection(kind)) return { page_size: 20 };
  if (learningCollection(kind)) return { page_size: 20 };
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
  if (page._hidden) return Promise.resolve();
  const identity = scope(page);
  const serial = (page._request || 0) + 1;
  page._request = serial;
  page.setData(clear || {});
  return page.run(async () => {
    if (!identity) throw new Error('员工登录已失效，请重新登录');
    try {
      const data = await request();
      if (!page._gone && !page._hidden && page._request === serial && scope(page) === identity) {
        page._loadedIdentity = identity;
        apply(data);
      }
    } catch (error) {
      if (!page._gone && !page._hidden && page._request === serial && scope(page) === identity) throw error;
    }
  });
}

function items(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('接口未返回原生列表数据，请重试或联系管理员');
  const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || '';
  return data.items.map((item) => {
    const snapshot = item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {};
    const rawCategory = firstText(item.category, snapshot.category);
    const categoryLabel = knowledgeCategories.label(rawCategory);
    return {
    id: String(item.id == null ? item.key || '' : item.id),
    title: firstText(item.title, item.name, item.product_name, snapshot.name) || '未命名条目',
    body: firstText(item.summary, item.body, item.description, item.story, snapshot.summary),
    category: rawCategory,
    categoryLabel: categoryLabel !== rawCategory ? categoryLabel : '',
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
  if (kind === 'community') return '/pages/community/index?id=' + encodeURIComponent(id);
  if (kind === 'activities') return '/pages/activity/index?id=' + encodeURIComponent(id);
  return '/pages/detail/index?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id);
}

function libraryKind(item) {
  return item && ['knowledge', 'favorite', 'official', 'history', 'recognition'].indexOf(item.kind) >= 0 ? item.kind : 'favorite';
}

function learningCollection(kind) {
  return ['quiz', 'my-library', 'favorites', 'favorite', 'quiz-history'].indexOf(kind) >= 0;
}

function historyCollection(kind) { return kind === 'history' || kind === 'recognition'; }

function filterHistory(page) {
  if (page._gone || page._hidden) return;
  if (!page._loadedIdentity) return;
  if (page._loadedIdentity !== scope(page)) {
    page.setData({ items: [], allItems: [], loadedSummary: '', pagingNote: '', hasMore: false, error: '员工登录身份已变化，请重新加载识物记录' });
    return;
  }
  const all = page.data.allItems || [], query = (page.data.query || '').trim().toLowerCase();
  page.setData({ items: all.filter(row => !query || row.searchText.indexOf(query) >= 0), loadedSummary: '已加载 ' + all.length + ' 条识物记录', pagingNote: '只搜索已加载的名称、类别、年代及介绍；不是全部历史。' + (page.data.hasMore ? '可继续加载更多。' : '当前没有更多页面。') });
}

function showHistory(page, data, requestedPage, append) {
  if (data.page != null && data.page !== requestedPage || data.has_more != null && typeof data.has_more !== 'boolean') throw new Error('识物记录分页回执不一致，请刷新');
  const rows = items(data).map((row, index) => {
    const raw = data.items[index];
    return Object.assign(row, { searchText: [raw.name, raw.category, knowledgeCategories.label(raw.category), raw.era, raw.description].filter(value => typeof value === 'string').join(' ').toLowerCase() });
  });
  const existing = append ? page.data.allItems || [] : [];
  page.setData({ allItems: existing.concat(rows.filter(row => !existing.some(old => old.id === row.id))), hasMore: pagination(page, data, requestedPage) });
  filterHistory(page);
}

function learningRows(page, data) {
  const rows = items(data);
  const history = page.data.kind === 'quiz-history';
  const names = { official: '官方知识测验', knowledge: '商品知识测验', favorite: '收藏知识测验' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return rows.map((row, index) => {
    const raw = data.items[index];
    if (raw.user_id != null && raw.user_id !== page.session.get().userId) throw new Error('学习记录身份不一致，请重新加载');
    if (!history) {
      const metadata = raw.source_metadata;
      const current = raw.source_type === 'official' || raw.source_type === 'product';
      if (current && metadata != null && (!metadata || Object.prototype.toString.call(metadata) !== '[object Object]' || ['name', 'category', 'cover_url'].some(key => metadata[key] !== null && typeof metadata[key] !== 'string'))) throw new Error('知识来源显示信息不完整，请重新读取');
      const snapshot = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {};
      const text = (...values) => values.find(value => typeof value === 'string' && value.trim()) || '';
      const source = current && metadata || {};
      row.title = text(source.name, snapshot.name, raw.title, raw.name, raw.product_name) || '未命名条目';
      row.category = text(source.category, snapshot.category, raw.category) || 'other';
      const label = knowledgeCategories.label(row.category); row.categoryLabel = label !== row.category ? label : '';
      row.cover_url = text(source.cover_url, snapshot.cover_url, snapshot.image_url, raw.cover_url, raw.image_url);
      row.sourceBadge = raw.source_type === 'official' ? '官方' : (raw.source_type === 'recognition' ? '识别' : (raw.source_type === 'product' ? '历史' : '收藏'));
    }
    const passedAt = typeof raw.passed_at === 'string' ? formatTime(raw.passed_at) : '';
    const lastAttemptAt = typeof raw.last_attempt_at === 'string' ? formatTime(raw.last_attempt_at) : '';
    const state = raw.passed_at != null ? (passedAt ? 'mastered' : 'unknown')
      : (history ? (raw.passed_at === null ? 'pending' : 'unknown') : (typeof raw.passed === 'boolean' ? (raw.passed ? 'mastered' : 'pending') : 'unknown'));
    let detailKind = raw.source_type == null ? libraryKind(row) : (['official', 'recognition', 'product'].indexOf(raw.source_type) >= 0 ? 'favorite' : '');
    let detailId = row.id;
    if (history) {
      const knownKind = ['official', 'knowledge', 'favorite'].indexOf(raw.item_kind) >= 0;
      detailKind = knownKind && typeof raw.item_id === 'string' && uuid.test(raw.item_id) ? raw.item_kind : '';
      detailId = detailKind ? raw.item_id : '';
      row.title = knownKind ? names[raw.item_kind] : '测验记录';
      row.time = lastAttemptAt ? '最近作答 ' + lastAttemptAt : '作答时间未提供';
    } else if (raw.kind && ['knowledge', 'favorite', 'official', 'history', 'recognition'].indexOf(raw.kind) < 0) detailKind = '';
    return Object.assign(row, {
      detailKind, detailId, masteryState: state,
      quizKind: ['official', 'favorite', 'knowledge'].indexOf(raw.quiz_kind) >= 0 ? raw.quiz_kind : '',
      passedText: state === 'mastered' ? '已掌握' : (state === 'pending' ? '待掌握' : '掌握状态待确认'),
      passedAt, lastAttemptAt,
      sourceNotice: detailKind ? '' : '来源信息缺失或不支持，无法阅读或重测'
    });
  });
}

function filterLearning(page) {
  if (page._hidden || page._gone) return;
  if (page._loadedIdentity && page._loadedIdentity !== scope(page)) {
    page.setData({ items: [], allItems: [], learningGroups: [], loadedSummary: '', hasMore: false, error: '员工登录身份已变化，请重新加载学习记录' });
    return;
  }
  const all = page.data.allItems || [];
  const query = (page.data.query || '').trim().toLowerCase();
  const mastery = page.data.mastery || 'all';
  const history = page.data.kind === 'quiz-history';
  const visible = all.filter((row) => (history || mastery === 'all' || row.masteryState === mastery)
    && (!query || (row.title + ' ' + row.body).toLowerCase().indexOf(query) >= 0));
  const mastered = all.filter((row) => row.masteryState === 'mastered').length;
  const pending = all.filter((row) => row.masteryState === 'pending').length;
  const groups = new Map();
  if (!history) visible.forEach(row => {
    if (!groups.has(row.category)) groups.set(row.category, { category: row.category, label: knowledgeCategories.label(row.category), count: 0, items: [], order: groups.size });
    const group = groups.get(row.category); group.items.push(row); group.count++;
  });
  page.setData({ items: visible, learningGroups: Array.from(groups.values()).sort((a, b) => b.count - a.count || a.order - b.order), loadedSummary: '已加载 ' + all.length + ' 条 · 待掌握 ' + pending + ' · 已掌握 ' + mastered + (all.length > mastered + pending ? ' · 状态待确认 ' + (all.length - mastered - pending) : '') });
}

function showLearning(page, data, requestedPage, append) {
  if (data.page != null && data.page !== requestedPage) throw new Error('学习分页回执不一致，请刷新列表');
  if (data.has_more != null && typeof data.has_more !== 'boolean') throw new Error('学习分页状态不完整，请刷新列表');
  const rows = learningRows(page, data);
  const existing = append ? page.data.allItems || [] : [];
  const combined = existing.concat(rows.filter((row) => !existing.some((old) => old.id === row.id)));
  page.setData({ allItems: combined, hasMore: pagination(page, data, requestedPage), pagingNote: typeof data.has_more === 'boolean' ? '筛选与搜索仅针对已加载内容，不代表全量统计。' : '筛选与搜索仅针对已加载内容；服务器未提供续页状态。' });
  filterLearning(page);
}

function openLearning(page, item) {
  if (page._hidden || page._gone || page._loadedIdentity !== scope(page)) return;
  if (!item || !item.detailKind || !item.detailId) { page.setData({ error: '来源信息缺失或不支持，无法阅读或重测' }); return; }
  return page.navigate(detailUrl(item.detailKind, item.detailId));
}

function hideLearning(page) {
  page._hidden = true;
  page._request = (page._request || 0) + 1;
  if (page._gone) Object.assign(page.data, { loadingMore: false }); else page.setData({ loadingMore: false });
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
  if (page._hidden || !page.data.hasMore || page.data.loadingMore) return;
  if (historyCollection(page.data.kind) && page._loadedIdentity !== scope(page)) return filterHistory(page);
  if (learningCollection(page.data.kind) && page._loadedIdentity !== scope(page)) return filterLearning(page);
  const serial = page._request;
  const identity = scope(page);
  const nextPage = page._nextPage;
  page.setData({ loadingMore: true, error: '' });
  try {
    const response = await page.api.action(action, Object.assign({}, params, { cursor: page._cursor, page: nextPage }));
    const data = action === 'checkin-status' ? checkinHistory(response) : response;
    if (page._gone || page._hidden || identity !== scope(page) || serial !== page._request) return;
    if (historyCollection(page.data.kind)) return showHistory(page, data, nextPage, true);
    if (learningCollection(page.data.kind)) return showLearning(page, data, nextPage, true);
    const existing = page.data.items;
    const next = items(data).filter((item) => !existing.some((old) => old.id === item.id));
    page.setData({ items: existing.concat(next), hasMore: pagination(page, data, nextPage) });
  } catch (error) {
    if (!page._gone && !page._hidden && identity === scope(page) && serial === page._request) page.setData({ error: error.message || '加载更多失败，请重试' });
  } finally { if (!page._gone && !page._hidden && identity === scope(page) && serial === page._request) page.setData({ loadingMore: false }); }
}

module.exports = { sections, scope, remote, items, categories, detailUrl, quizUrl, freshness, formatTime, notificationCategory, value, pagination, loadMore, listParams, checkinHistory, libraryKind, taskItems, learningCollection, showLearning, filterLearning, openLearning, hideLearning, historyCollection, showHistory, filterHistory };
