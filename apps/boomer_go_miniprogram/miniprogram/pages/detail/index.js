const { definePage } = require('../../shared/page');
const model = require('../list/model');
const { businessContent } = require('./content');
const learningKinds = ['knowledge', 'official', 'sop', 'qa', 'training', 'favorite', 'favorites', 'my-library', 'history', 'recognition'];

function contentNodes(item) {
  if (Array.isArray(item.nodes)) return item.nodes;
  const body = item.content_html || item.body || item.content || '';
  if (!body) return [];
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return String(body).split('\n').map((text) => ({ name: 'p', children: [{ type: 'text', text }] }));
}

Page(definePage({
  data: { kind: '', id: '', item: null, nodes: '', fields: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], freshness: '', quizUrl: '', unavailable: '', favorite: null, canFavorite: false, canRemoveFavorite: false, claimed: false, completed: false, canSave: false, canShare: false, busy: false, actionNotice: '', resolvedMessage: '', resolvedUrl: '', keyActionsDraft: '', draftResults: [], messages: [], messageDraft: '', profileNameDraft: '', avatarPreview: '' },
  onLoad(options) { this._hidden = false; this.setData({ kind: options.kind || 'knowledge', id: options.id || '' }); return this.load(); },
  onShow() { const hidden = this._hidden; this._hidden = false; if (this._request && (this._identity !== model.scope(this) || (hidden && learningKinds.indexOf(this.data.kind) >= 0))) return this.load(); },
  onHide() { if (learningKinds.indexOf(this.data.kind) >= 0) { model.hideLearning(this); this.setData({ quizUrl: '' }); } },
  onUnload() { this.onHide(); this._gone = true; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const kind = this.data.kind;
    const section = model.sections[kind];
    if (learningKinds.indexOf(kind) >= 0) this.setData({ learningNotice: '' });
    this._identity = model.scope(this);
    this._productId = '';
    this._favoriteTargetId = '';
    this._favoriteRowId = '';
    this._taskKey = '';
    this._pendingId = '';
    if (kind === 'conversation' && !this.data.id) {
      this.setData({ item: { title: '新建 BOOMER 助手对话', category: 'BOOMER 助手' }, messages: [], error: '', loading: false });
      return Promise.resolve();
    }
    return model.remote(this, () => {
      if (!section) throw new Error('该原生详情类型未开放');
      if (!this.data.id && kind !== 'profile' && kind !== 'settings') throw new Error('缺少内容 ID，请从列表重新打开');
      const knowledge = learningKinds.indexOf(kind) >= 0;
      const detailKind = ['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 ? 'favorite' : kind;
      if (kind === 'conversation') return this.api.action('conversation-messages', { conversation_id: this.data.id });
      if (kind === 'profile') return this.api.action('profile', {});
      if (kind === 'tasks') return this.api.action('tasks', {});
      if (knowledge) return this.api.action('knowledge-detail', { kind: detailKind, id: this.data.id });
      const action = kind === 'activities' ? 'activity-detail' : (kind === 'vouchers' ? 'voucher-detail' : section.action);
      return this.api.action(action, { kind, id: this.data.id, view: 'detail' });
    }, (data) => {
      if (kind === 'conversation') {
        if (!data || !Array.isArray(data.items)) throw new Error('会话接口未返回消息列表，请重试');
        this.setData({ item: { title: 'BOOMER 助手对话', category: 'BOOMER 助手会话' }, messages: data.items.map((message, index) => ({
          id: String(message.id || index), role: message.role === 'user' ? 'user' : 'assistant',
          content: message.content || message.body || '', time: model.formatTime(message.created_at) || '时间未提供'
        })), freshness: model.freshness(data) });
        return;
      }
      if (kind === 'profile') return this.showProfile(data);
      if (kind === 'tasks') {
        const row = model.taskItems(data).items.find((entry) => String(entry.id) === this.data.id || entry.pending_id === this.data.id);
        if (!row) throw new Error('当前任务或待领经验已不存在，请返回列表刷新云端状态');
        return this.showTask(row, model.freshness(data));
      }
      let item = data && (data.item || (data.id && typeof data.title === 'string' ? data : null));
      if (!item && data && Array.isArray(data.items)) {
        item = data.items.find((entry) => String(entry.id) === this.data.id);
        if (!item) throw new Error('详情接口未返回指定内容，请重试或联系管理员');
      }
      if (!item && data && data.profile && (kind === 'profile' || kind === 'settings')) {
        const session = this.session.get();
        item = { title: section.title, body: kind === 'settings' ? '账号与门店权限由 ERP 管理。需要更正员工身份或门店归属时，请联系门店管理员。退出账号请返回“我的”。' : '', fields: [
          { label: '姓名', value: (data.staff || {}).real_name || data.profile.display_name },
          { label: '工作门店', value: session && session.shop ? session.shop.name : '暂无已验证工作门店' }
        ] };
      }
      if (!item) return;
      const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
      const favorite = raw.favorite && typeof raw.favorite === 'object' ? raw.favorite : {};
      const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
      const isFavorite = ['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 || item.kind === 'favorite';
      const favoriteSourceValid = !isFavorite || favorite.source_type == null || ['official', 'recognition', 'product'].indexOf(favorite.source_type) >= 0;
      const quizAllowed = item.quiz_available === true && ['official', 'knowledge', 'favorite'].indexOf(item.quiz_kind) >= 0 && item.quiz_kind === (isFavorite ? 'favorite' : kind) && raw.source_available !== false && raw.source_missing !== true && favoriteSourceValid;
      if (learningKinds.indexOf(kind) >= 0) {
        const expectedKind = ['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 ? 'favorite' : kind;
        const matchingKind = !item.kind || item.kind === expectedKind || (expectedKind === 'favorite' && ['favorites', 'my-library'].indexOf(item.kind) >= 0) || (kind === 'history' && item.kind === 'recognition') || (kind === 'training' && ['sop', 'qa'].indexOf(item.kind) >= 0);
        const userId = this.session.get().userId;
        if ((item.id != null && String(item.id) !== this.data.id) || !matchingKind || (item.user_id != null && item.user_id !== userId)
          || (isFavorite && favorite.user_id != null && favorite.user_id !== userId)
          || (['history', 'recognition'].indexOf(kind) >= 0 && raw.created_by != null && raw.created_by !== userId)) throw new Error('学习详情来源或身份不一致，请返回列表刷新');
      }
      const business = businessContent(isFavorite && raw.source ? source : raw);
      if (learningKinds.indexOf(kind) >= 0) this.setData({ learningNotice: raw.source_available === false || raw.source_missing === true ? '收藏源内容不存在或当前不可读取，保留快照供查看；无法开始测验。' : (!favoriteSourceValid || (item.quiz_available === true && !quizAllowed) ? '测验来源信息不一致，当前无法开始测验。' : '') });
      const fields = (Array.isArray(item.fields) ? item.fields : []).map((field) => ({ label: field.label, value: field.value == null ? '未提供' : String(field.value) }));
      fields.push(...business.fields);
      const add = (label, value) => { if (value != null && value !== '') fields.push({ label, value: String(value) }); };
      add('状态', item.status);
      add('有效期', item.expires_at);
      add('活动时间', item.starts_at);
      add('目标说明', item.objective);
      add('关键行动', item.key_actions);
      add('周期开始', item.period_start);
      add('周期结束', item.period_end);
      if (typeof item.progress === 'number') add('云端进度', item.progress + (typeof item.target === 'number' ? ' / ' + item.target : ''));
      if (typeof item.score === 'number' && typeof item.total === 'number') add('云端评分', item.score + ' / ' + item.total);
      if (typeof item.passed === 'boolean') add('测验状态', item.passed ? '已通过' : '未通过');
      if (typeof item.claimed === 'boolean') add('领取状态', item.claimed ? '已领取' : '未领取');
      add('券面说明', item.description);
      add('使用规则', item.usage_rules);
      add('参与说明', item.requirements);
      const results = (Array.isArray(item.key_results) ? item.key_results : []).map((result) => ({ title: result.title || result.text || String(result), completed: result.completed === true || result.done === true }));
      const productIds = [raw.product_id, ['history', 'recognition'].indexOf(kind) >= 0 ? raw.id : '', isFavorite && ['recognition', 'product'].indexOf(favorite.source_type) >= 0 ? source.id : ''];
      this._productId = (productIds.find((id) => typeof id === 'string' && id.trim()) || '').trim();
      const canFavorite = !isFavorite && (item.kind || kind) === 'official';
      this._favoriteTargetId = canFavorite ? item.id || this.data.id : '';
      const favoriteRowId = isFavorite ? favorite.id || raw.favorite_id || (item.kind === 'favorite' ? item.id : '') : '';
      this._favoriteRowId = typeof favoriteRowId === 'string' ? favoriteRowId : '';
      this.setData({
        item: { id: item.id || this.data.id, title: item.title || section.title, category: kind === 'notifications' ? model.notificationCategory(item.category) : item.category || raw.category || section.title, author: item.author_name || '', cover_url: item.cover_url || '' },
        nodes: contentNodes(Object.assign({}, item, { body: item.body || business.body })), fields, businessSections: business.sections, gallery: business.gallery, backstampUrl: business.backstampUrl, videoUrl: business.videoUrl,
        results, freshness: model.freshness(Object.assign({}, raw, item)), quizUrl: quizAllowed ? model.quizUrl(item.quiz_kind, item.id || this.data.id) : '',
        favorite: typeof raw.is_favorite === 'boolean' ? raw.is_favorite : (typeof item.is_favorite === 'boolean' ? item.is_favorite : (typeof item.favorite === 'boolean' ? item.favorite : (['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 ? true : null))),
        claimed: item.claimed === true, canSave: !!this._productId, canShare: !!this._productId, canFavorite, canRemoveFavorite: !!this._favoriteRowId,
        keyActionsDraft: item.key_actions || '', draftResults: results.map((result) => ({ title: result.title, completed: result.completed }))
      });
      wx.setNavigationBarTitle({ title: item.title || section.title });
    }, { item: null, nodes: '', fields: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], quizUrl: '', canSave: false, canShare: false, canFavorite: false, canRemoveFavorite: false, claimed: false, completed: false, freshness: '', unavailable: '', actionNotice: '', resolvedMessage: '', resolvedUrl: '', messages: [] });
  },
  openQuiz(event) {
    if (this._hidden || this._gone || model.scope(this) !== this._loadedIdentity || !this.data.quizUrl || event.currentTarget.dataset.url !== this.data.quizUrl) return;
    return this.navigate(this.data.quizUrl);
  },
  showTask(row, freshness) {
    this._taskKey = row.task_key || '';
    this._pendingId = row.pending_id || '';
    const fields = [{ label: '云端状态', value: row.status }, { label: '奖励经验', value: model.value(row.amount, false) }];
    if (typeof row.progress === 'number') fields.push({ label: '云端进度', value: model.value(row.progress, false) + (typeof row.target === 'number' ? ' / ' + model.value(row.target, false) : '') });
    this.setData({ item: { id: row.id, title: row.title, category: row.pending_id ? '待领经验' : '每日任务' }, fields, claimed: row.claimed === true, completed: row.completed === true, freshness });
    wx.setNavigationBarTitle({ title: row.title });
  },
  resolveItem(message, url) {
    this._productId = ''; this._favoriteTargetId = ''; this._favoriteRowId = ''; this._taskKey = ''; this._pendingId = '';
    this.setData({ item: null, nodes: '', fields: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], quizUrl: '', canSave: false, canShare: false, canFavorite: false, canRemoveFavorite: false, favorite: false, freshness: '', actionNotice: '', resolvedMessage: message, resolvedUrl: url });
  },
  showProfile(data) {
    if (!data || !data.profile) throw new Error('资料接口未返回员工资料，请重试');
    const profile = data.profile;
    const staff = data.staff || {};
    const session = this.session.get();
    const role = typeof data.role === 'string' ? data.role : data.role && (data.role.name || data.role.role_code);
    this._profileAvatarPath = '';
    this._profileDirty = false;
    this.setData({
      item: { title: '个人资料', category: '账号资料' }, profileNameDraft: profile.display_name || '', avatarPreview: profile.avatar_url || '',
      fields: [
        { label: 'ERP 真实姓名（只读）', value: staff.real_name || profile.real_name || '未提供' },
        { label: '手机号（只读）', value: staff.phone || profile.phone || '未提供' },
        { label: '角色（只读）', value: role || '未提供' },
        { label: '工作门店（只读）', value: session && session.shop ? session.shop.name : '暂无已验证工作门店' }
      ], freshness: model.freshness(data)
    });
    wx.setNavigationBarTitle({ title: '个人资料' });
  },
  onProfileNameInput(event) { this._profileDirty = true; this.setData({ profileNameDraft: event.detail.value, actionNotice: '' }); },
  chooseAvatar() {
    if (this.data.busy) return Promise.resolve();
    const identity = model.scope(this);
    return new Promise((resolve) => wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['album'],
      success: (result) => {
        if (!this._gone && identity === model.scope(this) && result.tempFilePaths && result.tempFilePaths[0]) {
          this._profileAvatarPath = result.tempFilePaths[0];
          this._profileDirty = true;
          this.setData({ avatarPreview: this._profileAvatarPath, actionNotice: '' });
        }
        resolve();
      },
      fail: (error) => {
        if (!this._gone && identity === model.scope(this) && !/cancel/.test(error.errMsg || '')) this.setData({ error: '头像选择失败，原草稿已保留' });
        resolve();
      }
    }));
  },
  async saveProfile() {
    if (this._writing || this.data.kind !== 'profile' || !this.data.item) return;
    const displayName = this.data.profileNameDraft.trim();
    if (!displayName || Array.from(displayName).length > 30) { this.setData({ error: '昵称需要 1-30 个字', actionNotice: '' }); return; }
    const identity = model.scope(this);
    const avatarPath = this._profileAvatarPath;
    const params = { display_name: displayName };
    if (avatarPath) params.avatar_path = avatarPath;
    this._writing = true;
    this.setData({ busy: true, actionNotice: '' });
    try {
      await this.run(async () => {
        const receipt = await this.api.action('profile-update', params);
        if (this._gone || identity !== model.scope(this)) return;
        if (!receipt || !receipt.profile || receipt.profile.display_name !== displayName) throw new Error('资料保存响应尚未确认，请重新核对');
        const result = await this.api.action('profile', {});
        if (this._gone || identity !== model.scope(this)) return;
        const profile = result && result.profile;
        if (!profile || profile.display_name !== displayName || (avatarPath && (!receipt.profile.avatar_url || profile.avatar_url !== receipt.profile.avatar_url))) throw new Error('资料回读不一致，昵称与头像草稿已保留，请重新核对');
        this.showProfile(result);
        this.setData({ actionNotice: '服务器已确认资料保存，昵称与头像已回读核对。' });
      });
    } finally { this._writing = false; if (!this._gone) this.setData({ busy: false }); }
  },
  async writeAction(action, params) {
    if (this._writing || !this.data.item) return;
    this._writing = true;
    const identity = model.scope(this);
    this.setData({ busy: true, error: '', actionNotice: '' });
    try {
      return await this.run(async () => {
        if (!identity) throw new Error('员工登录已失效，请重新登录');
        const result = await this.api.action(action, params);
        if (!result || result.ok === false || result.success === false) throw new Error('服务器未确认操作，请刷新核对后重试');
        if (this._gone || identity !== model.scope(this)) return;
        await this.load();
        if (!this._gone && identity === model.scope(this) && !this.data.error) this.setData({ actionNotice: '服务器已响应，已重新加载云端内容；请核对最新状态。' });
        return result;
      });
    } finally { this._writing = false; if (!this._gone) this.setData({ busy: false }); }
  },
  toggleFavorite() {
    if (this.data.canRemoveFavorite) return this.removeFavorite();
    if (!this.data.canFavorite || !this._favoriteTargetId) return;
    return this.writeAction('knowledge-favorite', { id: this._favoriteTargetId, favorite: this.data.favorite !== true });
  },
  confirmFavoriteRemoval() {
    if (this.data.busy) return;
    wx.showModal({ title: '移除这条收藏', content: '只移除当前账号的收藏，不删除原商品或官方知识。', confirmText: '移除', confirmColor: '#EB0029', success: (result) => { if (result.confirm) this.removeFavorite(); } });
  },
  async removeFavorite() {
    if (this._writing || !this.data.canRemoveFavorite || !this._favoriteRowId) return;
    const id = this._favoriteRowId;
    const identity = model.scope(this);
    this._writing = true;
    this.setData({ busy: true, actionNotice: '' });
    try {
      await this.run(async () => {
        const result = await this.api.action('favorite-remove', { id });
        if (this._gone || identity !== model.scope(this)) return;
        if (!result || result.removed !== true || result.id !== id) throw new Error('服务器尚未确认该收藏已移除，请刷新核对后重试');
        this.resolveItem('服务器已确认该收藏已移除。', '/pages/list/index?kind=' + (this.data.kind === 'my-library' ? 'my-library' : 'favorites'));
      });
    } finally { this._writing = false; if (!this._gone) this.setData({ busy: false }); }
  },
  saveKnowledge() {
    if (!this._productId) return;
    return this.writeAction('knowledge-save', { product_id: this._productId });
  },
  async claimTask() {
    if (this._writing || !this.data.item || this.data.claimed || !this.data.completed) return;
    const pendingId = this._pendingId;
    const taskKey = this._taskKey;
    if (!pendingId && !taskKey) return;
    const identity = model.scope(this);
    this._writing = true;
    this.setData({ busy: true, actionNotice: '' });
    try {
      await this.run(async () => {
        const receipt = await this.api.action('task-claim', pendingId ? { pending_id: pendingId } : { task_key: taskKey });
        if (this._gone || identity !== model.scope(this)) return;
        if (!receipt || receipt.ok !== true) throw new Error('服务器尚未确认任务领取，请刷新核对');
        const data = await this.api.action('tasks', {});
        if (this._gone || identity !== model.scope(this)) return;
        const rows = model.taskItems(data).items;
        if (pendingId) {
          if (!Array.isArray(data.pending_items)) throw new Error('待领经验回读缺少明确列表，领取尚未确认，请刷新核对');
          if (rows.some((row) => row.pending_id === pendingId || row.id === pendingId)) throw new Error('待领经验回读仍存在，领取尚未确认，请刷新核对');
          this.resolveItem('服务器已确认该笔经验已领取，待领列表已核对移除。', '/pages/list/index?kind=tasks');
          this.setData({ claimed: true, completed: true });
        } else {
          const row = rows.find((entry) => entry.task_key === taskKey);
          if (!row || row.claimed !== true) throw new Error('任务领取回读尚未确认，请刷新核对云端状态');
          this.showTask(row, model.freshness(data));
          this.setData({ actionNotice: '服务器已确认任务奖励领取，已重新读取云端状态。' });
        }
      });
    } finally { this._writing = false; if (!this._gone) this.setData({ busy: false }); }
  },
  onKeyActionsInput(event) { this.setData({ keyActionsDraft: event.detail.value }); },
  onKeyResultChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    const draft = this.data.draftResults.slice();
    if (!draft[index] || this.data.busy) return;
    draft[index] = Object.assign({}, draft[index], { completed: event.detail.value === true });
    this.setData({ draftResults: draft });
  },
  saveObjective() {
    return this.writeAction('objective-update', { id: this.data.id, key_actions: this.data.keyActionsDraft, key_results: this.data.draftResults.map((result) => ({ title: result.title, done: result.completed })) });
  },
  confirmShare() {
    if (this.data.busy) return;
    wx.showModal({ title: '分享到 BOOMER 圈', content: '将当前已保存商品分享至员工社区，发布内容以服务器保存记录为准。', confirmText: '分享', confirmColor: '#EB0029', success: (result) => { if (result.confirm) this.shareCommunity(); } });
  },
  shareCommunity() {
    if (!this._productId) return;
    return this.writeAction('community-post', { product_id: this._productId });
  },
  onMessageInput(event) { this.setData({ messageDraft: event.detail.value }); },
  async sendMessage() {
    const content = this.data.messageDraft.trim();
    if (!content || this._writing) return;
    this._writing = true;
    const identity = model.scope(this);
    this.setData({ busy: true, error: '' });
    try {
      await this.run(async () => {
        if (!identity) throw new Error('员工登录已失效，请重新登录');
        const params = { content };
        if (this.data.id) params.conversation_id = this.data.id;
        const result = await this.api.action('conversation-send', params);
        if (this._gone || identity !== model.scope(this)) return;
        if (!result || !result.conversation_id || typeof result.reply !== 'string') throw new Error('服务器未确认会话回复，请先刷新核对；草稿已保留。');
        this.setData({ id: result.conversation_id, messageDraft: '' });
        await this.load();
      });
    } finally { this._writing = false; if (!this._gone) this.setData({ busy: false }); }
  },
  openActivity() {
    if (this._gone || this.data.kind !== 'activities' || this._identity !== model.scope(this) ||
        !this.data.item || String(this.data.item.id) !== this.data.id) return;
    return this.navigate(model.detailUrl('activities', this.data.id));
  },
  explainUnavailable() {
    const kind = this.data.kind;
    const descriptions = {
      community: '可从自己的已保存商品详情分享到社区。当前接口不提供任意文本帖子和评论，不会本地模拟发布。',
      vouchers: '当前 API 契约未开放员工券核销和分享写入。券状态以服务器为准，不会在本地模拟核销。',
      favorites: '收藏移除仅作用于本人收藏行，不会删除原商品或官方知识。测验可用性以服务器为准。'
    };
    this.setData({ unavailable: descriptions[kind] || '昵称和头像请前往个人资料修改；真实姓名、手机号、角色和门店由 ERP 管理，不可在此编辑。' });
  },
  retry() { return this.data.kind === 'profile' && this._profileDirty ? this.saveProfile() : this.load(); }
}));
