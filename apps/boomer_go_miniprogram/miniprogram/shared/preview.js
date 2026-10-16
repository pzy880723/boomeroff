// Explicit development-only examples. This adapter never calls a production API.
const { businessDate } = require('./session');
let nextSnapshot = 0;
function createPreview(wx) {
  const date = businessDate();
  const stamp = new Date().toISOString();
  const shop = { id: '00000000-0000-4000-8000-000000000901', name: '上海中信泰富店（示例）' };
  const profile = { display_name: '门店伙伴（示例）', real_name: '门店伙伴（示例）' };
  const articles = [
    { id: 'example-porcelain', title: '从底款读懂瓷器：产地、年代与工艺', category: '瓷器餐具', quiz_kind: 'official', quiz_available: true, quiz_persisted: false, kind: 'official', summary: '看釉色、看底款，再把商品故事讲清楚。', body: '先看器型与釉色，再观察底款。底款只能作为判断线索，不能单独证明年代、产地或真伪。\n\n向客人介绍时，把可见的工艺、用途和品相讲清楚；不能确认的信息，明确说明暂无法判断。\n\n中古商品可能有自然使用痕迹。请引导客人查看实物，不承诺未经核实的材质与年代。', updated_at: date },
    { id: 'example-service', title: '热情但不打扰：中古杂货店的服务节奏', category: '门店服务', summary: '一句欢迎、一个观察、一次恰到好处的介绍。', body: '客人进店时友好招呼，留出自由探索的空间。\n\n发现客人持续关注某件商品，再提供具体且有依据的介绍：用途、材质、工艺和可见品相。\n\n价格以当前门店标签为准，不编造折扣，不夸大稀缺性。', updated_at: date }
  ];
  const officialArticles = [
    { id: '00000000-0000-4000-8000-000000000831', name: '日瓷底款观察（示例）', category: 'jp_porcelain', ip_name: '品牌窑口', brand: '合成知识示例', era: '昭和', origin: '日本', summary: '先观察器型、釉色与底款，不把推测当成鉴定结论。', body: '这是合成官方知识示例，不是真实鉴定资料。\n\n先看器型与釉色，再核实可见底款；无法确认的年代应当明确说明。' },
    { id: '00000000-0000-4000-8000-000000000832', name: '欧瓷花纹介绍（示例）', category: 'eu_porcelain', ip_name: '花纹', brand: '合成知识示例', era: '年代待核实', origin: '欧洲', summary: '介绍可见的花纹与用途，具体产地以可靠资料为准。', body: '这是合成官方知识示例。\n\n向客人介绍可观察的花纹和品相，不承诺未经核实的产地或价值。' },
    { id: '00000000-0000-4000-8000-000000000833', name: '中古首饰品相说明（示例）', category: 'vintage_jewelry', ip_name: '胸针', brand: '合成知识示例', era: '年代待核实', origin: '产地待核实', summary: '核对结构、工艺和使用痕迹，真实介绍商品细节。', body: '这是合成官方知识示例。\n\n展示首饰的可见结构和使用痕迹，不编造材质、品牌与年代。' }
  ];
  const libraryArticles = articles.concat([{ title: '价签与品相：介绍前先核实', summary: '一件一价，真实说明看得见的使用痕迹。', body: '合成门店学习示例。介绍价格前先核对当前价签。\n\n请客人查看实物品相，如实说明可见的磕碰、划痕与自然使用痕迹，不承诺未经核实的原价或折扣。' }]);
  const library = libraryArticles.map((article, index) => ({
    id: '00000000-0000-4000-8000-00000000006' + (index + 1), source_type: 'official',
    source_id: '00000000-0000-4000-8000-00000000007' + (index + 1),
    snapshot: { name: article.title, summary: article.summary }, created_at: stamp,
    source_metadata: { name: article.title + '（示例）', category: index === 0 ? 'jp_porcelain' : 'other', cover_url: null },
    quiz_kind: 'favorite', quiz_available: true, passed: index === 1
  }));
  const quizAttempts = new Map();
  const notifications = [
    { id: 'example-shift', title: '下周排班已更新', body: '这是一条示例排班通知。真实排班以 ERP 发布结果为准。', category: 'notice', created_at: date + 'T09:20:00+08:00', read: false },
    { id: 'example-training', title: '新课程：中古商品的年代辨识', body: '在学习页查看知识内容，完成后可参加知识测验。此处为界面示例。', category: 'notice', created_at: date + 'T08:30:00+08:00', read: false }
  ];
  const bootstrap = { date, profile, staff_profile: profile, user_role: { role_code: 'staff' }, shop_context: { date, scope: 'store', status: 'scheduled', effective_shop: shop, authorized_shops: [shop] }, shifts: [{ id: 'example-shift', work_date: date, shift_code: 'early', shop_id: shop.id }], shift_definitions: [{ shop_id:shop.id, code: 'early', name: '早班', start_time: '10:00', end_time: '18:00' }], shift: { title:'早班',start_time:'10:00',end_time:'18:00',shop_name:shop.name }, tasks:[{id:'example-task',title:'检查价签与品相说明',status:'示例待办'}], learning:[articles[0]], okrs: [], checked_today: false };
  const current = { userId: '00000000-0000-4000-8000-000000000902', profile, shop, shops: [shop], isHeadquarters: false, bootstrap, permissions: [], scopeFresh: true };
  const activity = { id: '00000000-0000-4000-8000-000000000031', shop_id: shop.id, name: '门店内容共创日（示例）', description: '用真实商品与门店照片分享好物故事。管理区是只读示例，不读取真实顾客资料、不发券或保存确认。', status: 'active', platform: null, starts_at: null, ends_at: null, cover_url: null, poster_url: null, voucher_id: '00000000-0000-4000-8000-000000000034', requires_review: false, max_applications: null, min_followers: null, share_token: null, created_at: date + 'T00:00:00+08:00', form_fields: [{ key: 'experience', label: '希望分享的内容', type: 'textarea' }, { key: 'contact', label: '联系电话', type: 'phone' }, { key: 'profile_image', label: '主页截图', type: 'image', role: 'profile_screenshot' }] };
  const applicationId = '00000000-0000-4000-8000-000000000032';
  const peer = { user_id: '00000000-0000-4000-8000-000000000001', name: '门店伙伴 A（示例）', avatar_url: null, position: '门店伙伴（示例）', shop_id: shop.id, shop_name: shop.name, is_contact: true };
  const scheduleShifts = [
    { id: '00000000-0000-4000-8000-000000000921', shop_id: shop.id, code: 'early', name: '早班（示例）', start_time: '10:00:00', end_time: '18:00:00', version: 'c'.repeat(64), selectable: true },
    { id: '00000000-0000-4000-8000-000000000922', shop_id: null, code: 'late', name: '晚班（示例）', start_time: '13:00:00', end_time: '21:00:00', version: 'd'.repeat(64), selectable: true }
  ];
  function scheduleWeekStart(value) {
    const day = new Date(value + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
  }
  function scheduleRows(start) {
    return [current.userId, peer.user_id].map((user_id, index) => {
      const shift = scheduleShifts[index];
      return { assignment_id: '00000000-0000-4000-8000-00000000091' + (index + 1), user_id,
        display_name: index ? peer.name : profile.display_name, work_date: new Date(Date.parse(start + 'T00:00:00Z') + (index ? 6 : 4) * 86400000).toISOString().slice(0, 10),
        shop_id: shop.id, shift_id: shift.id, shift_code: shift.code, shift_status: 'resolved', shift_name: shift.name,
        start_time: shift.start_time, end_time: shift.end_time, source: 'manual', version: 'a'.repeat(64) };
    });
  }
  const messages = [
    { id: '00000000-0000-4000-8000-000000000011', sender_id: peer.user_id, receiver_id: current.userId, mine: false, body: '今天新到的瓷器已整理好。这是界面示例，不是真实员工私信。', attachment: null, created_at: date + 'T09:00:00+08:00', read_at: null, cursor: 'example-dm-11' },
    { id: '00000000-0000-4000-8000-000000000012', sender_id: current.userId, receiver_id: peer.user_id, mine: true, body: '收到，我先去知识库复习一下。这是合成消息。', attachment: null, created_at: date + 'T09:01:00+08:00', read_at: null, cursor: 'example-dm-12' }
  ];
  const snapshots = new Map();
  const kbCategories = ['sop', 'qa'].flatMap((type, i) => [
    { id: '00000000-0000-4000-8000-0000000001' + i + '1', shop_id: shop.id, type, name: '门店服务（示例）', sort_order: 0 },
    { id: '00000000-0000-4000-8000-0000000001' + i + '2', shop_id: null, type, name: '共享知识（示例）', sort_order: 1 }
  ]);
  const kbEntries = ['sop', 'qa'].flatMap((type, i) => [
    { id: '00000000-0000-4000-8000-0000000002' + i + '1', shop_id: shop.id, type, category_id: kbCategories[i * 2].id,
      title: type === 'sop' ? '开店前的三项检查（示例）' : '客人询问商品年代，怎样回答？（示例）',
      body: type === 'sop' ? '## 开店准备\n\n1. **先看通道**：确保出入通畅。\n2. 核对价签与可见品相。\n3. 整理当日学习资料。\n\n| 检查项 | 做法 |\n| --- | --- |\n| 价签 | 一件一价，核对实物 |\n| 品相 | 如实说明使用痕迹 |\n\n这是合成示例，不是真实门店作业记录。' : '**先说能确认的信息**，再说明暂无法判断的部分。\n\n- 展示可见底款与工艺。\n- 不把猜测当作年代或真伪保证。\n\n这是合成问答示例，不是鉴定结论。',
      tags: type === 'sop' ? ['开店', 'okr-highlight', '示例'] : ['接待', '示例'], sort_order: 0, created_by: current.userId, created_at: stamp, updated_at: stamp },
    { id: '00000000-0000-4000-8000-0000000002' + i + '2', shop_id: null, type, category_id: kbCategories[i * 2 + 1].id,
      title: type === 'sop' ? '共享品相说明规范（示例，只读）' : '共享服务问答（示例，只读）',
      body: '**共享内容保持只读**。\n\n请如实介绍可见品相，不编造折扣和未经核实的商品故事。\n\n本条仅供原生界面预览。', tags: ['共享', '示例'], sort_order: 1, created_by: null, created_at: stamp, updated_at: stamp }
  ]);
  const session = { get: () => current, token: () => null, require: async () => current, hasCredentials: () => false, signOut() {} };
  const unavailable = () => Promise.reject(new Error('初版示例模式不会提交真实数据或付费任务，请使用员工账号登录后操作'));
  async function action(name, params = {}) {
    const stamp = new Date().toISOString();
    if (name === 'dashboard') return bootstrap;
    if (name === 'kb-category-list' || name === 'kb-category-detail') {
      const invalid = () => Object.assign(new Error('分类示例参数不合法'), { status: 400, code: 'invalid_params' });
      if (!['sop', 'qa'].includes(params.type)) throw invalid();
      if (params.shop_id !== shop.id) throw Object.assign(new Error('示例模式只展示当前门店'), { status: 403, code: 'shop_forbidden' });
      const common = { shop_id: shop.id, type: params.type, limits: { name_chars: 200, sort_min: -2147483648, sort_max: 2147483647 }, as_of: stamp };
      const rows = kbCategories.filter(row => row.type === params.type).map(row => Object.assign({}, row, { version: 'b'.repeat(64) }));
      if (name === 'kb-category-detail') {
        const category = rows.find(row => row.id === params.id);
        if (!category) throw Object.assign(new Error('该分类示例不存在'), { status: 404, code: 'not_found' });
        return Object.assign(common, { category, can_manage: category.shop_id === shop.id });
      }
      const page = params.page === undefined ? 0 : params.page, page_size = params.page_size === undefined ? 20 : params.page_size;
      if (!Number.isSafeInteger(page) || page < 0 || page_size !== 20) throw invalid();
      return Object.assign(common, { items: rows.slice(page * page_size, (page + 1) * page_size), can_manage: true, page, page_size, has_more: (page + 1) * page_size < rows.length });
    }
    if (['kb-capabilities', 'kb-list', 'kb-detail'].includes(name)) {
      const invalid = () => Object.assign(new Error('知识库示例参数不合法'), { status: 400, code: 'invalid_params' });
      if (!['sop', 'qa'].includes(params.type)) throw invalid();
      if (params.shop_id !== shop.id) throw Object.assign(new Error('示例模式只展示当前门店'), { status: 403, code: 'shop_forbidden' });
      const common = { shop_id: shop.id, type: params.type };
      const categories = kbCategories.filter(row => row.type === params.type).map(row => Object.assign({}, row));
      if (name === 'kb-capabilities') return Object.assign(common, { can_write: true, limits: { title_chars: 200, body_chars: 40000, tags: 20, tag_chars: 40, query_chars: 200 } });
      if (name === 'kb-detail') {
        const entry = kbEntries.find(row => row.type === params.type && row.id === params.id);
        if (!entry) throw Object.assign(new Error('该知识库示例不存在'), { status: 404, code: 'not_found' });
        return Object.assign(common, { entry: Object.assign({}, entry, { tags: entry.tags.slice() }), categories, version: 'a'.repeat(64), can_edit: entry.shop_id === shop.id, can_delete: entry.shop_id === shop.id, as_of: stamp });
      }
      const page = params.page === undefined ? 0 : params.page, page_size = params.page_size === undefined ? 20 : params.page_size;
      if (!Number.isInteger(page) || page < 0 || !Number.isInteger(page_size) || page_size < 1 || page_size > 50 || (params.q !== undefined && typeof params.q !== 'string')) throw invalid();
      const query = (params.q || '').trim(), category_id = params.category_id || null;
      if (Array.from(query).length > 200 || (category_id && !categories.some(row => row.id === category_id))) throw invalid();
      const rows = kbEntries.filter(row => row.type === params.type && (!category_id || row.category_id === category_id) && [row.title, row.body].concat(row.tags).some(text => text.toLowerCase().includes(query.toLowerCase())));
      const items = rows.slice(page * page_size, (page + 1) * page_size).map(row => ({ id: row.id, shop_id: row.shop_id, type: row.type, category_id: row.category_id, title: row.title, body_preview: row.body.slice(0, 400), tags: row.tags.slice(), sort_order: row.sort_order, updated_at: row.updated_at }));
      return Object.assign(common, { query, category_id, items, categories, page, page_size, has_more: (page + 1) * page_size < rows.length, as_of: stamp });
    }
    if (name === 'profile') return { profile, staff: profile, role: { role_code: 'staff' }, erp_scope: { scope: 'store', shop_ids: [shop.id] }, experience: { total_exp: 0 } };
    if (['schedule-manage-capabilities', 'schedule-manage-week', 'schedule-manage-candidates', 'schedule-manage-cell'].includes(name)) {
      const invalid = () => Object.assign(new Error('排班管理示例参数不合法'), { status: 400, code: 'invalid_params' });
      if (!params.shop_id) throw invalid();
      if (params.shop_id !== shop.id) throw Object.assign(new Error('示例模式只展示当前门店'), { status: 403, code: 'shop_forbidden' });
      const common = { shop_id: shop.id, server_time: stamp, persisted: false };
      if (name === 'schedule-manage-capabilities') return Object.assign(common, { can_view: true, can_arrange: true,
        existing_permissions: { shift_write: false, dayoff_write: false, swap: true, clear_week: true, ai_schedule: true }, implemented_operations: ['create', 'update', 'delete'] });
      const value = name === 'schedule-manage-week' ? params.week_start : params.work_date;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw invalid();
      const start = scheduleWeekStart(value);
      if (name === 'schedule-manage-week') {
        if (value !== start) throw invalid();
        return Object.assign(common, { week_start: start, week_end: new Date(Date.parse(start + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10), week_version: 'b'.repeat(64), rows: scheduleRows(start) });
      }
      if (name === 'schedule-manage-candidates') {
        if ((params.q != null && typeof params.q !== 'string') || (params.cursor != null && params.cursor !== '' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.cursor))) throw invalid();
        const query = (params.q || '').trim();
        if (Array.from(query).length > 40) throw invalid();
        const items = [{ user_id: current.userId, display_name: profile.display_name }, { user_id: peer.user_id, display_name: peer.name }]
          .filter(row => (!params.cursor || row.user_id > params.cursor) && row.display_name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.user_id.localeCompare(b.user_id));
        return Object.assign(common, { work_date: value, items, next_cursor: null, has_more: false });
      }
      if (![current.userId, peer.user_id].includes(params.user_id)) throw Object.assign(new Error('该员工示例不存在'), { status: 404, code: 'not_found' });
      const row = scheduleRows(start).find(row => row.user_id === params.user_id && row.work_date === value);
      const assignment = row ? { assignment_id: row.assignment_id, user_id: row.user_id, work_date: row.work_date, shop_id: row.shop_id, shift_code: row.shift_code, source: row.source, version: row.version } : null;
      return Object.assign(common, { user_id: params.user_id, work_date: value, assignment, cell_version: (row ? 'e' : 'f').repeat(64), shifts: scheduleShifts.map(row => Object.assign({}, row)),
        warnings: params.user_id === peer.user_id && new Date(value + 'T00:00:00Z').getUTCDay() === 0 ? [{ code: 'fixed_rest_weekday', shift_id: null, level: 'soft' }] : [], rules_visible: true, can_save: true, can_delete: !!assignment });
    }
    if (name === 'schedule') {
      const month = params.month || date.slice(0, 7), view = params.view || 'mine';
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !['mine', 'shop'].includes(view)) throw Object.assign(new Error('排班月份或视图不合法'), { status: 400, code: 'invalid_params' });
      if ((params.shop_id && params.shop_id !== shop.id) || view === 'shop') throw Object.assign(new Error('示例账号无其他门店或同事排班权限'), { status: 403, code: 'forbidden' });
      const common = { shop_id: shop.id, shop_name: shop.name, user_id: current.userId, display_name: profile.display_name, is_self: true };
      return { month, shop_id: shop.id, view, can_view_shop: false, rows: [
        Object.assign({}, common, { work_date: month + '-01', shift_code: 'early', shift_name: '早班', start_time: '10:00', end_time: '18:00', source: 'schedule', is_rest: false }),
        Object.assign({}, common, { work_date: month + '-02', shift_code: null, shift_name: '休息', start_time: null, end_time: null, source: 'day_off', is_rest: true })
      ], conflicts: [], schedules: bootstrap.shifts, shift_defs: bootstrap.shift_definitions, as_of: stamp, persisted: false };
    }
    if (name === 'knowledge-detail') {
      const official = params.kind === 'official' && officialArticles.find(row => row.id === params.id);
      if (official) return { item: { id: official.id, kind: 'official', title: official.name, body: official.body,
        category: official.category, quiz_kind: 'official', quiz_available: true, quiz_persisted: false, raw: Object.assign({}, official) }, persisted: false };
      const favorite = params.kind === 'favorite' && library.find(row => row.id === params.id);
      if (favorite) {
        const source = Object.assign({}, libraryArticles[library.indexOf(favorite)], { id: favorite.source_id });
        return { item: { id: favorite.id, kind: 'favorite', title: source.title, body: '合成学习示例，不代表真实员工收藏或成绩。\n\n' + source.body,
          quiz_kind: 'favorite', quiz_available: true, raw: { favorite, source, source_available: true, is_favorite: true, favorite_id: favorite.id } } };
      }
      const item = articles.find(a => a.id === params.id); if (!item) throw new Error('该示例条目不存在'); return { item };
    }
    if (name === 'official-library') {
      const invalid = () => Object.assign(new Error('参数不合法'), { status: 400, code: 'invalid_params' });
      const limits = { q: 80, category: 80, ip_name: 120, era: 120, origin: 120 };
      if (Object.keys(params).some(key => !Object.prototype.hasOwnProperty.call(limits, key) && key !== 'sort')) throw invalid();
      const filters = {};
      for (const key of Object.keys(limits)) {
        let value = params[key];
        if (value == null) value = '';
        if (typeof value !== 'string') throw invalid();
        if (key === 'q') value = value.trim();
        const points = Array.from(value);
        if (points.length > limits[key] || value.includes('\u0000') || points.some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) throw invalid();
        filters[key] = value === '' ? null : value;
      }
      const requested_sort = params.sort == null ? 'latest' : params.sort;
      if (!['latest', 'hot', 'important'].includes(requested_sort)) throw invalid();
      const effective_sort = filters.category ? 'latest' : requested_sort;
      const q = (filters.q || '').toLowerCase();
      const items = officialArticles.filter(row => ['category', 'ip_name', 'era', 'origin'].every(key => filters[key] === null || row[key] === filters[key])
        && (!q || [row.name, row.ip_name, row.summary].some(value => value.toLowerCase().includes(q)))).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 60).map(row => ({
        id: row.id, name: row.name, category: row.category, ip_name: row.ip_name, summary: row.summary, era: row.era, origin: row.origin,
        cover_url: null, selling_points: null, tips: null, view_count: 0, favorite_count: 0, importance_score: null, updated_at: stamp
      }));
      return { items, filters, requested_sort, effective_sort, window_limit: 60, as_of: stamp, persisted: false };
    }
    if (name === 'knowledge' && params.source === 'official') {
      const page = Number.isInteger(params.page) && params.page >= 0 ? params.page : 0;
      const page_size = Math.min(Math.max(Number.isInteger(params.page_size) ? params.page_size : 20, 1), 50);
      const q = typeof params.q === 'string' ? params.q.trim().slice(0, 40).replace(/[%,()*]/g, '').toLowerCase() : '';
      const category = typeof params.category === 'string' && /^[a-z_]{2,30}$/.test(params.category) ? params.category : '';
      const filtered = officialArticles.filter(row => (!category || row.category === category) && (!q || [row.name, row.ip_name, row.brand].some(value => value.toLowerCase().includes(q))));
      const items = filtered.slice(page * page_size, (page + 1) * page_size).map(row => {
        const { body, ...summary } = row;
        return Object.assign({}, summary, { quiz_kind: 'official', quiz_available: true, quiz_persisted: false, passed: false, last_score: null });
      });
      return { source: 'official', items, page, page_size, has_more: (page + 1) * page_size < filtered.length, as_of: stamp, persisted: false };
    }
    if (name === 'knowledge' || name === 'learning') return { items: articles.filter(a => !params.query || (a.title + a.body).includes(params.query)), categories: [{ id: 'porcelain', name: '瓷器餐具' }, { id: 'service', name: '门店服务' }], page: 0, has_more: false, as_of: stamp };
    if (name === 'notifications') { const page = params.page || 0, n = params.page_size || 20; return { items: notifications.slice(page * n, (page + 1) * n), page, page_size: n, has_more: (page + 1) * n < notifications.length, as_of: stamp }; }
    if (name === 'notification-read') {
      if (Array.isArray(params.ids)) {
        const read = notifications.filter(n => params.ids.includes(n.id));
        read.forEach(n => { n.read = true; });
        const read_ids = read.map(n => n.id);
        return { marked: read_ids.length, read_ids, ignored_ids: params.ids.filter(id => !read_ids.includes(id)), persisted: false };
      }
      let marked = 0; notifications.forEach(n => { if ((params.all || n.id === params.id) && !n.read) { n.read = true; marked++; } }); return { marked };
    }
    if (name === 'dm-contacts') return { items: params.page ? [] : [peer], page: params.page || 0, page_size: params.page_size || 50, has_more: false };
    if (name === 'dm-conversations') {
      const last = messages[messages.length - 1], unread = messages.filter(m => !m.mine && !m.read_at).length;
      const result = { items: params.page ? [] : [{ peer, last_message: { id: last.id, sender_id: last.sender_id, mine: last.mine, preview: last.body, created_at: last.created_at }, unread_count: unread }], page: params.page || 0, page_size: params.page_size || 20, has_more: false, total_conversations: 1, unread_total: unread, snapshot_at: params.snapshot_at || stamp };
      if (params.snapshot_id === undefined && params.snapshot_at) return result;
      let snapshot_id = params.snapshot_id;
      if (snapshot_id === undefined) {
        for (const [id, value] of snapshots) if (value.expires <= Date.now()) snapshots.delete(id);
        snapshot_id = '00000000-0000-4000-9000-' + String(++nextSnapshot).padStart(12, '0');
        snapshots.set(snapshot_id, { stamp, expires: Date.now() + 300000 });
      }
      const value = snapshots.get(snapshot_id);
      if (!value || value.expires <= Date.now()) throw Object.assign(new Error('会话列表已过期，请刷新'), { status: 409, code: 'snapshot_expired' });
      return Object.assign(result, { snapshot_id, snapshot_at: value.stamp, snapshot_expires_at: new Date(value.expires).toISOString(), total_at_snapshot: 1, skipped_slots: 0 });
    }
    if (name === 'dm-messages') {
      if (params.peer_id !== peer.user_id) throw new Error('该示例同事不存在');
      return { peer_id: peer.user_id, order: params.after ? 'asc' : 'desc', items: params.after || params.before ? [] : messages.slice().reverse().map(m => Object.assign({}, m)), page_size: params.page_size || 30, has_more: false, next_before: params.after || params.before ? null : messages[0].cursor, next_after: params.after || messages[messages.length - 1].cursor };
    }
    if (name === 'dm-read') {
      const found = messages.filter(m => params.peer_id === peer.user_id && m.sender_id === peer.user_id && (params.message_ids || []).includes(m.id));
      found.forEach(m => { m.read_at = m.read_at || stamp; });
      return { updated_ids: found.map(m => m.id), read: found.map(m => ({ id: m.id, read_at: m.read_at })), ignored_ids: (params.message_ids || []).filter(id => !found.some(m => m.id === id)), persisted: false };
    }
    if (name === 'dm-status') {
      if (params.peer_id !== peer.user_id) throw new Error('该示例同事不存在');
      const found = messages.filter(m => (params.message_ids || []).includes(m.id));
      return { peer_id: peer.user_id, statuses: found.map(m => ({ id: m.id, read_at: m.read_at })), ignored_ids: (params.message_ids || []).filter(id => !found.some(m => m.id === id)) };
    }
    if (name === 'voucher-capabilities' || name === 'voucher-lookup') {
      if (params.shop_id && params.shop_id !== shop.id) throw Object.assign(new Error('示例模式不能访问其他门店'), { status: 403, code: 'shop_forbidden' });
      if (name === 'voucher-capabilities') return { shop_id: shop.id, can_lookup: true, can_redeem: false, can_manage: false };
      if (String(params.code || '').trim().toUpperCase() !== 'DEMO1234') throw Object.assign(new Error('该示例券不存在，请输入 DEMO1234'), { status: 404, code: 'not_found' });
      return { shop_id: shop.id, claim: { id: '00000000-0000-4000-8000-000000000021', code: 'DEMO1234', status: 'claimed', claimed_at: stamp, expires_at: null, redeemed_at: null, recipient_name_masked: '顾客（示例，脱敏）', recipient_phone_tail: null,
        voucher: { id: '00000000-0000-4000-8000-000000000022', name: '中古好物体验券（示例）', threshold_type: 'min_spend', discount_amount: 20, min_spend: 100, template_terms: '仅用于原生界面展示，不是真实优惠券，不可核销。', starts_at: null, ends_at: null, active: true } }, can_redeem: false, reason: 'development_preview', server_time: stamp };
    }
    if (name === 'tasks') {
      const pending = [
        { id: '00000000-0000-4000-8000-000000000991', title: '学习分享奖励（示例）', amount: 5, source: 'learning', created_at: date + 'T09:00:00+08:00' },
        { id: '00000000-0000-4000-8000-000000000992', title: '完善商品档案（示例）', amount: 10, source: 'recognition', created_at: date + 'T08:00:00+08:00' }
      ];
      const daily = [
        { task_key: 'daily_first_scan', title: '完成 1 次识别（示例）', amount: 5, target: 1, progress: 1, completed: true },
        { task_key: 'daily_3_scans', title: '完成 3 次识别（示例）', amount: 10, target: 3, progress: 1, completed: false },
        { task_key: 'daily_quiz', title: '通过一次知识测试（示例）', amount: 15, target: 1, progress: 0, completed: false },
        { task_key: 'daily_post', title: '发一条 BOOMER 圈帖子（示例）', amount: 5, target: 1, progress: 0, completed: false }
      ];
      return { date, pending_exp: pending, claimed_today: [], today_counts: { scans: 1, quiz_passed: 0, quiz_attempts: 0, community_posts: 0 },
        items: daily.map(row => Object.assign({ id: row.task_key, claimed: false }, row)),
        pending_items: pending.map(row => Object.assign({ pending_id: row.id, completed: true, claimed: false }, row)), persisted: false, as_of: stamp };
    }
    if (name === 'quiz-start') {
      if (params.kind === 'favorite' && !library.some(row => row.id === params.id)) throw new Error('该示例收藏不存在');
      const token = 'development-example-' + (quizAttempts.size + 1);
      quizAttempts.set(token, params.kind && params.id ? { kind: params.kind, id: params.id } : null);
      return { quiz_token: token, attempt_id: token, questions: [{ id: 'q1', index: 0, stem: '商品年代无法确认时，应当如何介绍？', options: ['直接说是古董', '如实说明暂无法确认', '声称绝版', '只说价格'] }] };
    }
    if (name === 'quiz-submit') {
      if (params.quiz_token && !quizAttempts.has(params.quiz_token)) throw Object.assign(new Error('该示例答题凭据不存在'), { status: 404, code: 'invalid_quiz_token' });
      const correct = !Array.isArray(params.answers) || params.answers[0] === 1;
      return Object.assign({ score: correct ? 1 : 0, total: 1, passed: correct, persisted: false, correct: [correct], correct_answers: [1], message: '示例答卷不记入真实考核' }, quizAttempts.get(params.quiz_token), Array.isArray(params.answers) ? { submitted: params.answers.slice() } : {});
    }
    if (name === 'quiz-history') return { items: params.page ? [] : library.slice(0, 2).map((favorite, index) => ({
      id: '00000000-0000-4000-8000-00000000008' + (index + 1), item_kind: 'favorite', item_id: favorite.id,
      score: index, total: 1, passed_at: favorite.passed ? stamp : null, last_attempt_at: stamp
    })), page: params.page || 0, page_size: 20, has_more: false, as_of: stamp };
    if (name === 'checkin-status') return { date, timezone: 'Asia/Shanghai', checked_today: false, today: null, stats: { current_streak: 0, longest_streak: 0, total_check_ins: 0 }, history: { items: [], page: 0, page_size: 20, has_more: false } };
    if (name === 'objectives') {
      if (params.shop_id && params.shop_id !== shop.id) throw Object.assign(new Error('示例模式只展示当前门店'), { status: 403, code: 'shop_forbidden' });
      const page = Number.isInteger(params.page) && params.page >= 0 ? params.page : 0;
      const page_size = Math.min(Math.max(Number.isInteger(params.page_size) ? params.page_size : 20, 1), 50);
      return { shop_id: shop.id, items: page ? [] : [{ id: 'example-okr', shop_id: shop.id, title: '本周：商品知识与门店体验（示例）', objective: '完善商品介绍，保持门店整洁，让伙伴掌握服务要点。', key_results: [{ name: '学习商品知识', progress: 50 }, { name: '检查价签与品相说明', progress: 100 }], key_actions: '介绍商品前，先核对可观察的品相与当前价签。', updated_at: stamp }], page, page_size, has_more: false, persisted: false, as_of: stamp };
    }
    if (['activities', 'activity-detail', 'activity-capabilities', 'activity-applications', 'application-detail'].includes(name)) {
      if (params.shop_id && params.shop_id !== shop.id) throw Object.assign(new Error('示例模式不能访问其他门店'), { status: 403, code: 'shop_forbidden' });
      const missing = () => Object.assign(new Error('该活动或申请示例不存在'), { status: 404, code: 'not_found' });
      if (name === 'activities') return { shop_id: shop.id, items: [Object.assign({}, activity)], page: 0, has_more: false, as_of: stamp };
      if (name === 'activity-detail') { if (params.id !== activity.id) throw missing(); return { item: Object.assign({}, activity) }; }
      if (name === 'activity-capabilities') return { shop_id: shop.id, can_manage: true, can_confirm_publish: true, can_upload_evidence: false };
      if (name === 'activity-applications') {
        if (params.activity_id && params.activity_id !== activity.id) throw missing();
        if ((params.publish_confirmed !== undefined && typeof params.publish_confirmed !== 'boolean') || params.cursor || (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 50))) throw Object.assign(new Error('示例列表参数不合法'), { status: 400, code: 'invalid_params' });
        return { shop_id: shop.id, activity_id: params.activity_id || null, publish_confirmed: params.publish_confirmed === undefined ? null : params.publish_confirmed, items: params.publish_confirmed === true ? [] : [{ id: applicationId, activity_id: activity.id, activity_name: activity.name, status: 'approved', created_at: date + 'T00:00:00+08:00', applicant_name_masked: '顾客（示例，脱敏）', applicant_phone_tail: '1234', publish_confirmed: false, publish_confirmed_at: null, has_publish_url: false, publish_screenshot_count: 1 }], next_cursor: null, has_more: false, order: 'desc' };
      }
      if (params.application_id !== applicationId) throw missing();
      return { shop_id: shop.id, application: { id: applicationId, activity_id: activity.id, status: 'approved', created_at: date + 'T00:00:00+08:00', reviewed_at: null, applicant_name_masked: '顾客（示例，脱敏）', applicant_phone_tail: '1234', voucher_claim_id: null,
        publish: { confirmed: false, confirmed_at: null, confirmed_by: null, note: '示例备注：仅用于界面预览', url: null, screenshots: [{ path: 'publish/' + applicationId + '/example.jpg', signed_url: null, error: 'sign_failed' }] },
        answers: [{ key: 'experience', label: '希望分享的内容', type: 'textarea', role: null, value: '分享昭和玩具的整理方法（示例）', image: null }, { key: 'contact', label: '联系电话', type: 'phone', role: null, value: '***1234', image: null }, { key: 'profile_image', label: '主页截图', type: 'image', role: 'profile_screenshot', value: null, image: { path: 'activity/' + activity.id + '/example.jpg', signed_url: null, error: 'sign_failed' } }] }, activity: { id: activity.id, name: activity.name, platform: activity.platform, form_fields: activity.form_fields }, version: '1'.repeat(64), server_time: stamp };
    }
    if (name === 'community') return { items: [{ id: 'example-community', title: '今天学到一个新的瓷器底款知识', body: '分享观察方法，让每一位伙伴都能把商品故事讲得更准确。', user_id: current.userId }], as_of: stamp };
    if (name === 'community-detail') {
      if (params.id !== 'example-community') throw new Error('该示例帖子不存在');
      return { post: { id: 'example-community', name: '从底款读懂一只瓷杯', category: '瓷器餐具', story: '这是社区界面示例。先观察器型与釉面，再看底款；不确定的信息如实说明，不把猜测当作产地或年代的承诺。', description: '分享观察方法，让每一位伙伴都能把商品故事讲得更准确。', selling_points: ['先看品相', '如实介绍工艺'], created_at: date + 'T09:00:00+08:00', author: { user_id: current.userId, name: profile.display_name, avatar_url: null }, mine: true }, liked: false, likes_count: 0, comments_count: 1 };
    }
    if (name === 'community-comments') {
      if (params.post_id !== 'example-community') throw new Error('该示例帖子不存在');
      return { post_id: 'example-community', order: 'asc', items: params.cursor ? [] : [{ id: 'example-comment', post_id: 'example-community', author: { user_id: peer.user_id, name: peer.name, avatar_url: null }, mine: false, content: '示例评论：下次接待时，我会先引导客人看品相。', created_at: date + 'T09:01:00+08:00', cursor: 'example-comment-cursor' }], page_size: params.page_size || 20, has_more: false, next_cursor: 'example-comment-cursor' };
    }
    if (name === 'my-library') return { items: params.page ? [] : library.map(row => Object.assign({}, row)), page: params.page || 0, page_size: 20, has_more: false, as_of: stamp };
    if (name === 'practice-library') return { items: library.map(row => Object.assign({}, row)), window_limit: 300, has_older: false, as_of: stamp };
    if (['vouchers', 'scan-history', 'marketing-assets', 'conversation-list', 'conversation-messages'].includes(name)) return { items: [], as_of: stamp };
    return unavailable();
  }
  return { session, api: { action, invoke: unavailable, assistant: unavailable, uploadChatAttachment: unavailable, openChatAttachment: unavailable,
    inspectPublicationFile: unavailable, createPublicationUpload: unavailable, transferPublicationFile: unavailable, commitPublicationUpload: unavailable, publicationUploadStatus: unavailable,
    copy: text => new Promise((resolve, reject) => wx.setClipboardData({ data: String(text), success: resolve, fail: reject })), saveMedia: unavailable,
    recognize: async () => ({ name: '识物结果示例 · 日常瓷杯', era: '未作年代鉴定', origin: '仅示例，非照片识别结论', material: '瓷', craft: '釉面装饰', description: '正式登录后，这里会根据拍摄的整体、底款和细节照片展示商品故事。遇到不确定的年代、产地或品牌，会明确标注，不能仅凭图片作保证。', sellingPoints: ['先观察器型与釉面', '向客人如实说明品相', '可补拍底款和细节'] }),
    sales: async () => ({ complete: false, reason: 'development_preview', message: '初版示例模式不展示虚构销售金额', date, last_synced_at: stamp, achieved_cents: null, as_of: stamp, sales_assessment: false }),
    leaderboard: async () => ({ complete: false, reason: 'employee_attribution_unavailable', message: '真实订单尚未接通员工销售归属，暂不生成排名', rows: [], sales_assessment: false, as_of: stamp })
  } };
}
module.exports = { createPreview };
