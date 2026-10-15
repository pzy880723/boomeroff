// Explicit development-only examples. This adapter never calls a production API.
const { businessDate } = require('./session');
let nextSnapshot = 0;
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
  const activity = { id: '00000000-0000-4000-8000-000000000031', shop_id: shop.id, name: '门店内容共创日（示例）', description: '用真实商品与门店照片分享好物故事。管理区是只读示例，不读取真实顾客资料、不发券或保存确认。', status: 'active', platform: null, starts_at: null, ends_at: null, cover_url: null, poster_url: null, voucher_id: '00000000-0000-4000-8000-000000000034', requires_review: false, max_applications: null, min_followers: null, share_token: null, created_at: date + 'T00:00:00+08:00', form_fields: [{ key: 'experience', label: '希望分享的内容', type: 'textarea' }, { key: 'contact', label: '联系电话', type: 'phone' }, { key: 'profile_image', label: '主页截图', type: 'image', role: 'profile_screenshot' }] };
  const applicationId = '00000000-0000-4000-8000-000000000032';
  const peer = { user_id: '00000000-0000-4000-8000-000000000001', name: '门店伙伴 A（示例）', avatar_url: null, position: '门店伙伴（示例）', shop_id: shop.id, shop_name: shop.name, is_contact: true };
  const messages = [
    { id: '00000000-0000-4000-8000-000000000011', sender_id: peer.user_id, receiver_id: current.userId, mine: false, body: '今天新到的瓷器已整理好。这是界面示例，不是真实员工私信。', attachment: null, created_at: date + 'T09:00:00+08:00', read_at: null, cursor: 'example-dm-11' },
    { id: '00000000-0000-4000-8000-000000000012', sender_id: current.userId, receiver_id: peer.user_id, mine: true, body: '收到，我先去知识库复习一下。这是合成消息。', attachment: null, created_at: date + 'T09:01:00+08:00', read_at: null, cursor: 'example-dm-12' }
  ];
  const snapshots = new Map();
  const session = { get: () => current, token: () => null, require: async () => current, hasCredentials: () => false, signOut() {} };
  const unavailable = () => Promise.reject(new Error('初版示例模式不会提交真实数据或付费任务，请使用员工账号登录后操作'));
  async function action(name, params = {}) {
    const stamp = new Date().toISOString();
    if (name === 'dashboard') return bootstrap;
    if (name === 'profile') return { profile, staff: profile, role: { role_code: 'staff' }, erp_scope: { scope: 'store', shop_ids: [shop.id] }, experience: { total_exp: 0 } };
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
    if (name === 'knowledge-detail') { const item = articles.find(a => a.id === params.id); if (!item) throw new Error('该示例条目不存在'); return { item }; }
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
    if (name === 'tasks') return { date, pending_exp: 0, claimed_today: [], today_counts: { scans: 0, quiz_attempts: 0, community_posts: 0 }, items: [{ id: 'example-learn', title: '读懂一件商品，再讲好它的故事', body: '先进入学习页，了解可观察、可核实的商品信息。', status: '示例待办' }], as_of: stamp };
    if (name === 'quiz-start') return { quiz_token: 'development-example-only', attempt_id: 'development-example-only', questions: [{ id: 'q1', index: 0, stem: '商品年代无法确认时，应当如何介绍？', options: ['直接说是古董', '如实说明暂无法确认', '声称绝版', '只说价格'] }] };
    if (name === 'quiz-submit') return { score: 1, total: 1, passed: true, persisted: false, message: '示例答卷不记入真实考核' };
    if (name === 'quiz-history') return { items: [], as_of: stamp };
    if (name === 'checkin-status') return { date, timezone: 'Asia/Shanghai', checked_today: false, today: null, stats: { current_streak: 0, longest_streak: 0, total_check_ins: 0 }, history: { items: [], page: 0, page_size: 20, has_more: false } };
    if (name === 'objectives') return { items: [{ id: 'example-okr', title: '本周：商品知识与门店体验', objective: '完善商品介绍，保持门店整洁，让伙伴掌握服务要点。', key_results: [{ title: '学习商品知识', done: false }, { title: '检查价签与品相说明', done: false }], body: '这是运营目标的界面示例，不涉及销售业绩考核。' }], as_of: stamp };
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
    if (name === 'community') return { items: [{ id: 'example-community', title: '今天学到一个新的瓷器底款知识', body: '分享观察方法，让每一位伙伴都能把商品故事讲得更准确。', user_id: 'example-employee' }], as_of: stamp };
    if (name === 'community-detail') {
      if (params.id !== 'example-community') throw new Error('该示例帖子不存在');
      return { post: { id: 'example-community', name: '从底款读懂一只瓷杯', category: '瓷器餐具', story: '这是社区界面示例。先观察器型与釉面，再看底款；不确定的信息如实说明，不把猜测当作产地或年代的承诺。', description: '分享观察方法，让每一位伙伴都能把商品故事讲得更准确。', selling_points: ['先看品相', '如实介绍工艺'], created_at: date + 'T09:00:00+08:00', author: { user_id: current.userId, name: profile.display_name, avatar_url: null }, mine: true }, liked: false, likes_count: 0, comments_count: 1 };
    }
    if (name === 'community-comments') {
      if (params.post_id !== 'example-community') throw new Error('该示例帖子不存在');
      return { post_id: 'example-community', order: 'asc', items: params.cursor ? [] : [{ id: 'example-comment', post_id: 'example-community', author: { user_id: peer.user_id, name: peer.name, avatar_url: null }, mine: false, content: '示例评论：下次接待时，我会先引导客人看品相。', created_at: date + 'T09:01:00+08:00', cursor: 'example-comment-cursor' }], page_size: params.page_size || 20, has_more: false, next_cursor: 'example-comment-cursor' };
    }
    if (name === 'my-library') return { items: articles.map(a => Object.assign({}, a, { favorite_id: a.id, source_type: 'official' })), as_of: stamp };
    if (['vouchers', 'scan-history', 'marketing-assets', 'conversation-list', 'conversation-messages'].includes(name)) return { items: [], as_of: stamp };
    return unavailable();
  }
  return { session, api: { action, invoke: unavailable, assistant: unavailable, uploadChatAttachment: unavailable, openChatAttachment: unavailable, copy: text => new Promise((resolve, reject) => wx.setClipboardData({ data: String(text), success: resolve, fail: reject })), saveMedia: unavailable,
    recognize: async () => ({ name: '识物结果示例 · 日常瓷杯', era: '未作年代鉴定', origin: '仅示例，非照片识别结论', material: '瓷', craft: '釉面装饰', description: '正式登录后，这里会根据拍摄的整体、底款和细节照片展示商品故事。遇到不确定的年代、产地或品牌，会明确标注，不能仅凭图片作保证。', sellingPoints: ['先观察器型与釉面', '向客人如实说明品相', '可补拍底款和细节'] }),
    sales: async () => ({ complete: false, reason: 'development_preview', message: '初版示例模式不展示虚构销售金额', date, last_synced_at: stamp, achieved_cents: null, as_of: stamp, sales_assessment: false }),
    leaderboard: async () => ({ complete: false, reason: 'employee_attribution_unavailable', message: '真实订单尚未接通员工销售归属，暂不生成排名', rows: [], sales_assessment: false, as_of: stamp })
  } };
}
module.exports = { createPreview };
