// Explicit development-only examples. This adapter never calls a production API.
const { businessDate } = require('./session');
function createPreview(wx) {
  const date = businessDate();
  const stamp = new Date().toISOString();
  const shop = { id: 'example-shop', name: '上海中信泰富店（示例）' };
  const profile = { display_name: '门店伙伴（示例）', real_name: '门店伙伴（示例）' };
  const articles = [
    { id: 'example-porcelain', title: '从底款读懂瓷器：产地、年代与工艺', category: '瓷器餐具', quiz_kind: 'official', quiz_available: true, quiz_persisted: false, kind: 'official', summary: '看釉色、看底款，再把商品故事讲清楚。', body: '先看器型与釉色，再观察底款。底款只能作为判断线索，不能单独证明年代、产地或真伪。\n\n向客人介绍时，把可见的工艺、用途和品相讲清楚；不能确认的信息，明确说明暂无法判断。\n\n中古商品可能有自然使用痕迹。请引导客人查看实物，不承诺未经核实的材质与年代。', updated_at: date },
    { id: 'example-service', title: '热情但不打扰：中古杂货店的服务节奏', category: '门店服务', summary: '一句欢迎、一个观察、一次恰到好处的介绍。', body: '客人进店时友好招呼，留出自由探索的空间。\n\n发现客人持续关注某件商品，再提供具体且有依据的介绍：用途、材质、工艺和可见品相。\n\n价格以当前门店标签为准，不编造折扣，不夸大稀缺性。', updated_at: date }
  ];
  const notifications = [
    { id: 'example-shift', title: '下周排班已更新', body: '这是一条示例排班通知。真实排班以 ERP 发布结果为准。', category: 'notice', created_at: date + 'T09:20:00+08:00', read: false },
    { id: 'example-training', title: '新课程：中古商品的年代辨识', body: '在学习页查看知识内容，完成后可参加知识测验。此处为界面示例。', category: 'notice', created_at: date + 'T08:30:00+08:00', read: false }
  ];
  const bootstrap = { date, profile, staff_profile: profile, user_role: { role_code: 'staff' }, shop_context: { date, scope: 'store', status: 'scheduled', effective_shop: shop, authorized_shops: [shop] }, shifts: [{ id: 'example-shift', work_date: date, shift_code: 'early', shop_id: shop.id }], shift_definitions: [{ shop_id:shop.id, code: 'early', name: '早班', start_time: '10:00', end_time: '18:00' }], shift: { title:'早班',start_time:'10:00',end_time:'18:00',shop_name:shop.name }, tasks:[{id:'example-task',title:'检查价签与品相说明',status:'示例待办'}], learning:[articles[0]], okrs: [], checked_today: false };
  const current = { userId: 'example-employee', profile, shop, shops: [shop], isHeadquarters: false, bootstrap, permissions: [], scopeFresh: true };
  const session = { get: () => current, token: () => null, require: async () => current, hasCredentials: () => false, signOut() {} };
  const unavailable = () => Promise.reject(new Error('初版示例模式不会提交真实数据或付费任务，请使用员工账号登录后操作'));
  async function action(name, params = {}) {
    const stamp = new Date().toISOString();
    if (name === 'dashboard') return bootstrap;
    if (name === 'profile') return { profile, staff: profile, role: { role_code: 'staff' }, erp_scope: { scope: 'store', shop_ids: [shop.id] }, experience: { total_exp: 0 } };
    if (name === 'schedule') return { month: params.month || date.slice(0, 7), schedules: bootstrap.shifts, shift_defs: bootstrap.shift_definitions, as_of: stamp };
    if (name === 'knowledge-detail') { const item = articles.find(a => a.id === params.id); if (!item) throw new Error('该示例条目不存在'); return { item }; }
    if (name === 'knowledge' || name === 'learning') return { items: articles.filter(a => !params.query || (a.title + a.body).includes(params.query)), categories: [{ id: 'porcelain', name: '瓷器餐具' }, { id: 'service', name: '门店服务' }], page: 0, has_more: false, as_of: stamp };
    if (name === 'notifications') return { items: notifications.slice(), as_of: stamp };
    if (name === 'notification-read') { let marked = 0; notifications.forEach(n => { if ((params.all || n.id === params.id) && !n.read) { n.read = true; marked++; } }); return { marked }; }
    if (name === 'tasks') return { date, pending_exp: 0, claimed_today: [], today_counts: { scans: 0, quiz_attempts: 0, community_posts: 0 }, items: [{ id: 'example-learn', title: '读懂一件商品，再讲好它的故事', body: '先进入学习页，了解可观察、可核实的商品信息。', status: '示例待办' }], as_of: stamp };
    if (name === 'quiz-start') return { quiz_token: 'development-example-only', attempt_id: 'development-example-only', questions: [{ id: 'q1', index: 0, stem: '商品年代无法确认时，应当如何介绍？', options: ['直接说是古董', '如实说明暂无法确认', '声称绝版', '只说价格'] }] };
    if (name === 'quiz-submit') return { score: 1, total: 1, passed: true, persisted: false, message: '示例答卷不记入真实考核' };
    if (name === 'quiz-history') return { items: [], as_of: stamp };
    if (name === 'checkin-status') return { date, timezone: 'Asia/Shanghai', checked_today: false, today: null, stats: { current_streak: 0, longest_streak: 0, total_check_ins: 0 }, history: { items: [], page: 0, page_size: 20, has_more: false } };
    if (name === 'objectives') return { items: [{ id: 'example-okr', title: '本周：商品知识与门店体验', objective: '完善商品介绍，保持门店整洁，让伙伴掌握服务要点。', key_results: [{ title: '学习商品知识', done: false }, { title: '检查价签与品相说明', done: false }], body: '这是运营目标的界面示例，不涉及销售业绩考核。' }], as_of: stamp };
    if (name === 'activities') return { items: [{ id: 'example-activity', name: '门店内容共创日', title: '门店内容共创日', body: '用真实商品与门店照片分享好物故事。此活动仅用于界面展示。', status: '示例活动' }], as_of: stamp };
    if (name === 'community') return { items: [{ id: 'example-community', title: '今天学到一个新的瓷器底款知识', body: '分享观察方法，让每一位伙伴都能把商品故事讲得更准确。', user_id: 'example-employee' }], as_of: stamp };
    if (name === 'my-library') return { items: articles.map(a => Object.assign({}, a, { favorite_id: a.id, source_type: 'official' })), as_of: stamp };
    if (['vouchers', 'scan-history', 'marketing-assets', 'conversation-list', 'conversation-messages'].includes(name)) return { items: [], as_of: stamp };
    return unavailable();
  }
  return { session, api: { action, invoke: unavailable, assistant: unavailable, copy: text => new Promise((resolve, reject) => wx.setClipboardData({ data: String(text), success: resolve, fail: reject })), saveMedia: unavailable,
    recognize: async () => ({ name: '识物结果示例 · 日常瓷杯', era: '未作年代鉴定', origin: '仅示例，非照片识别结论', material: '瓷', craft: '釉面装饰', description: '正式登录后，这里会根据拍摄的整体、底款和细节照片展示商品故事。遇到不确定的年代、产地或品牌，会明确标注，不能仅凭图片作保证。', sellingPoints: ['先观察器型与釉面', '向客人如实说明品相', '可补拍底款和细节'] }),
    sales: async () => ({ complete: false, reason: 'development_preview', message: '初版示例模式不展示虚构销售金额', date, last_synced_at: stamp, achieved_cents: null, as_of: stamp, sales_assessment: false }),
    leaderboard: async () => ({ complete: false, reason: 'employee_attribution_unavailable', message: '真实订单尚未接通员工销售归属，暂不生成排名', rows: [], sales_assessment: false, as_of: stamp })
  } };
}
module.exports = { createPreview };
