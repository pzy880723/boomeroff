const { definePage } = require('../../shared/page');
const model = require('../list/model');
const { businessContent } = require('./content');
const objective = require('./objective');
const knowledgeCategories = require('../../shared/knowledge-categories');
const { urlForFilters } = require('../../shared/official-library');
const knowledgeChat = require('../../shared/knowledge-chat');
const notificationRead = require('../../shared/notification-read');
const learningKinds = ['knowledge', 'official', 'sop', 'qa', 'training', 'favorite', 'favorites', 'my-library', 'history', 'recognition'];
const productUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const knowledgeSaveEmpty = { knowledgeSaveState: '', knowledgeSaveNotice: '', knowledgeSaveError: '', knowledgeSaveBusy: false };
function savedFavorite(data, record, userId) {
  const item = data && data.item, raw = item && item.raw, favorite = raw && raw.favorite;
  if (!item || item.kind !== 'favorite' || item.id !== record.favoriteId || !favorite || favorite.id !== record.favoriteId
    || favorite.source_type !== 'recognition' || favorite.source_id !== record.productId
    || (item.user_id != null && item.user_id !== userId) || (favorite.user_id != null && favorite.user_id !== userId)
    || typeof raw.source_available !== 'boolean'
    || (raw.source_available ? !raw.source || raw.source.id !== record.productId : raw.source != null)) throw new Error('收藏来源尚未核对一致');
  return raw.source_available;
}
function practiceCoordinator() { const app = typeof getApp === 'function' ? getApp() : null; return app && app.dailyPractice; }
function chatFor(page) { if (!page._knowledgeChat) page._knowledgeChat = knowledgeChat.create(page, { scope: () => model.scope(page), wx }); return page._knowledgeChat; }

function contentNodes(item) {
  if (Array.isArray(item.nodes)) return item.nodes;
  const body = item.content_html || item.body || item.content || '';
  if (!body) return [];
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return String(body).split('\n').map((text) => ({ name: 'p', children: [{ type: 'text', text }] }));
}

function officialFilters(raw) {
  const result = [];
  for (const key of ['category', 'ip_name', 'era', 'origin']) {
    if (typeof raw[key] !== 'string' || !raw[key]) continue;
    const filters = key === 'ip_name' && typeof raw.category === 'string' && raw.category ? { category: raw.category, ip_name: raw[key] } : { [key]: raw[key] };
    try { result.push({ key, label: key === 'category' ? knowledgeCategories.label(raw[key]) : raw[key], url: urlForFilters(filters) }); }
    catch (_) { /* Invalid source metadata cannot become a navigation filter. */ }
  }
  return result;
}

Page(definePage({
  data: Object.assign({}, knowledgeSaveEmpty, { kind: '', id: '', item: null, nodes: '', fields: [], officialFilters: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], freshness: '', quizUrl: '', unavailable: '', favorite: null, canFavorite: false, canRemoveFavorite: false, claimed: false, completed: false, canSave: false, canShare: false, busy: false, actionNotice: '', resolvedMessage: '', resolvedUrl: '', keyActionsDraft: '', draftResults: [], messages: [], messageDraft: '', profileNameDraft: '', avatarPreview: '' }),
  onLoad(options) { this._hidden = false; this._practiceRequested = options.practice === '1'; this.setData(Object.assign({}, knowledgeChat.fields, { kind: options.kind || 'knowledge', id: options.id || '', practiceRequested: this._practiceRequested })); this.syncPractice(); return this.load(); },
  onShow() { const hidden = this._hidden; this._hidden = false; this._practiceRedirecting = false; this.syncPractice(); if (this.data.kind === 'objectives') { if (hidden || this._objectiveIdentity !== model.scope(this)) return this.loadObjective(); return; } if (this._request && (this._identity !== model.scope(this) || (hidden && (learningKinds.indexOf(this.data.kind) >= 0 || this.data.kind === 'notifications')))) return this.load(); },
  onHide() {
    this.clearKnowledgeSaveView();
    if (this._knowledgeChat) this._knowledgeChat.hide();
    if (this.data.kind === 'objectives') { this._hidden = true; this.clearObjective(); }
    if (this.data.kind === 'notifications') {
      this._hidden = true; this._request = (this._request || 0) + 1;
      const clear = { item: null, nodes: [], fields: [], businessSections: [], gallery: [], freshness: '' };
      if (this._gone) Object.assign(this.data, clear); else this.setData(clear);
    }
    if (learningKinds.indexOf(this.data.kind) >= 0) {
      model.hideLearning(this);
      this._officialLinks = [];
      if (this._gone) Object.assign(this.data, { quizUrl: '', officialFilters: [] }); else this.setData({ quizUrl: '', officialFilters: [] });
    }
  },
  onUnload() { this.onHide(); this._knowledgeSave = null; this._knowledgeBinding = null; if (this._knowledgeChat) this._knowledgeChat.unload(); this._gone = true; },
  onPullDownRefresh() { return Promise.resolve(this.data.kind === 'objectives' ? this.reloadObjective() : this.load()).finally(() => wx.stopPullDownRefresh()); },
  load() {
    const kind = this.data.kind;
    if (kind === 'objectives') return this.loadObjective();
    if (kind === 'official' && (this._gone || this._hidden)) return Promise.resolve();
    this._knowledgeBinding = null;
    if (this._knowledgeSave && this._knowledgeSave.state === 'confirmed') this._knowledgeSave.state = 'receipt';
    this.clearKnowledgeSaveView();
    if (kind === 'official' || this._knowledgeChat) chatFor(this).loadStart();
    const section = model.sections[kind];
    if (learningKinds.indexOf(kind) >= 0) this.setData({ learningNotice: '' });
    this._identity = model.scope(this);
    this._officialLinks = [];
    this._officialId = '';
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
      if (this._practiceRequested && (kind !== 'favorite' || !practiceCoordinator() || !practiceCoordinator().matches(this.data.id))) throw new Error('本轮连续练习条目已变化，请返回清单核对');
      if (!section) throw new Error('该原生详情类型未开放');
      if (!this.data.id && kind !== 'profile' && kind !== 'settings') throw new Error('缺少内容 ID，请从列表重新打开');
      const knowledge = learningKinds.indexOf(kind) >= 0;
      const detailKind = ['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 ? 'favorite' : kind;
      if (kind === 'conversation') return this.api.action('conversation-messages', { conversation_id: this.data.id });
      if (kind === 'profile') return this.api.action('profile', {});
      if (kind === 'tasks') return this.api.action('tasks', {});
      if (kind === 'notifications') {
        const serial = this._request, identity = model.scope(this);
        return notificationRead.read(this.api, this.data.id, () => !this._gone && !this._hidden && this._request === serial && model.scope(this) === identity);
      }
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
      this._officialLinks = kind === 'official' ? officialFilters(Object.assign({}, raw, { category: raw.category || item.category })) : [];
      this._officialId = kind === 'official' ? this.data.id : '';
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
      const recognitionPhotos = ['history', 'recognition'].indexOf(kind) >= 0 || (isFavorite && raw.source_available === true && ['recognition', 'product'].indexOf(favorite.source_type) >= 0);
      const business = businessContent(isFavorite && raw.source ? source : raw, { recognitionPhotos });
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
      const canSave = !isFavorite && productUuid.test(this._productId);
      this._knowledgeBinding = canSave ? { identity: model.scope(this), kind, id: this.data.id, productId: this._productId } : null;
      if (this._knowledgeSave && (!this._knowledgeBinding || !this.sameKnowledgeSave(this._knowledgeSave))) this._knowledgeSave = null;
      const canFavorite = !isFavorite && (item.kind || kind) === 'official';
      this._favoriteTargetId = canFavorite ? item.id || this.data.id : '';
      const favoriteRowId = isFavorite ? favorite.id || raw.favorite_id || (item.kind === 'favorite' ? item.id : '') : '';
      this._favoriteRowId = typeof favoriteRowId === 'string' ? favoriteRowId : '';
      this.setData({
        item: { id: item.id || this.data.id, title: item.title || section.title, category: kind === 'notifications' ? model.notificationCategory(item.category) : (kind === 'official' ? knowledgeCategories.label(item.category || raw.category) : item.category || raw.category) || section.title, author: item.author_name || '', cover_url: item.cover_url || '', summary: kind === 'notifications' && typeof item.summary === 'string' ? item.summary : '' },
        officialFilters: this._officialLinks.map(link => ({ key: link.key, label: link.label })),
        nodes: contentNodes(Object.assign({}, item, { body: item.body || business.body })), fields, businessSections: business.sections, gallery: business.gallery, backstampUrl: business.backstampUrl, videoUrl: business.videoUrl,
        results, freshness: model.freshness(Object.assign({}, raw, item)), quizUrl: quizAllowed ? model.quizUrl(item.quiz_kind, item.id || this.data.id) : '',
        favorite: typeof raw.is_favorite === 'boolean' ? raw.is_favorite : (typeof item.is_favorite === 'boolean' ? item.is_favorite : (typeof item.favorite === 'boolean' ? item.favorite : (['favorite', 'favorites', 'my-library'].indexOf(kind) >= 0 ? true : null))),
        claimed: item.claimed === true, canSave, canShare: !!this._productId, canFavorite, canRemoveFavorite: !!this._favoriteRowId,
        keyActionsDraft: item.key_actions || '', draftResults: results.map((result) => ({ title: result.title, completed: result.completed }))
      });
      if (kind === 'official') chatFor(this).mount(item);
      wx.setNavigationBarTitle({ title: item.title || section.title });
    }, { item: null, nodes: '', fields: [], officialFilters: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], quizUrl: '', canSave: false, canShare: false, canFavorite: false, canRemoveFavorite: false, claimed: false, completed: false, freshness: '', unavailable: '', actionNotice: '', resolvedMessage: '', resolvedUrl: '', messages: [] }).then(() => {
      this.syncKnowledgeSave();
      if (this._knowledgeSave && this._knowledgeSave.state === 'receipt') return this.retryKnowledgeReadback();
    });
  },
  toggleKnowledgeChat() { if (this._knowledgeChat) this._knowledgeChat.toggle(); },
  onKnowledgeQuestion(event) { if (this._knowledgeChat) this._knowledgeChat.input(event.detail.value); },
  sendKnowledgeQuestion() { if (this._knowledgeChat) return this._knowledgeChat.send(); },
  showEarlierKnowledgeMessages() { if (this._knowledgeChat) this._knowledgeChat.earlier(); },
  newKnowledgeConversation() { if (this._knowledgeChat) return this._knowledgeChat.newConversation(); },
  openOfficialFilter(event) {
    if (this._hidden || this._gone || this.data.loading || this.data.error || this.data.kind !== 'official' || this.data.id !== this._officialId || model.scope(this) !== this._loadedIdentity) return;
    const key = event.currentTarget.dataset.key;
    const link = (this._officialLinks || []).find(item => item.key === key);
    if (link) return this.navigate(link.url);
  },
  openQuiz(event) {
    if (this._hidden || this._gone || model.scope(this) !== this._loadedIdentity || !this.data.quizUrl || event.currentTarget.dataset.url !== this.data.quizUrl) return;
    if (this._practiceRequested) {
      const helper = practiceCoordinator();
      if (!helper || !helper.matches(this.data.id)) { this.setData({ error: '本轮条目已变化，请返回清单核对', quizUrl: '' }); return; }
      return this.redirectPractice(this.data.quizUrl + '&practice=1');
    }
    return this.navigate(this.data.quizUrl);
  },
  syncPractice() {
    if (!this._practiceRequested) { this.setData({ practiceMode: false, practiceNote: '' }); return; }
    const helper = practiceCoordinator(), view = helper && helper.view();
    const valid = this.data.kind === 'favorite' && helper && helper.matches(this.data.id);
    this.setData({ practiceMode: !!valid, practiceNote: valid ? '本轮 ' + (view.index + 1) + ' / ' + view.queue.length + ' · 先阅读，再显式开始测验。练过不等于已掌握。' : '本轮条目已变化或失效，请返回清单核对。' });
  },
  redirectPractice(url) {
    if (this._practiceRedirecting || this._hidden || this._gone || this._identity !== model.scope(this)) return;
    const identity = this._identity;
    this._practiceRedirecting = true;
    wx.redirectTo({ url, fail: () => { if (!this._hidden && !this._gone && identity === model.scope(this)) { this._practiceRedirecting = false; this.setData({ error: '页面未能打开，请重试或返回本轮清单' }); } } });
  },
  returnPractice() { if (this._practiceRequested) return this.redirectPractice('/pages/practice/index'); },
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
  clearKnowledgeSaveView() {
    if (this._gone) Object.assign(this.data, knowledgeSaveEmpty); else this.setData(knowledgeSaveEmpty);
  },
  sameKnowledgeSave(record) {
    return !!record && !this._gone && record.identity === model.scope(this) && record.kind === this.data.kind && record.id === this.data.id
      && (!this._knowledgeBinding || record.productId === this._knowledgeBinding.productId);
  },
  knowledgeSaveReady() {
    const binding = this._knowledgeBinding;
    return !!binding && !this._gone && !this._hidden && !this.data.loading && !this.data.error && !!this.data.item
      && binding.identity === model.scope(this) && binding.identity === this._loadedIdentity && binding.kind === this.data.kind && binding.id === this.data.id;
  },
  syncKnowledgeSave() {
    const record = this._knowledgeSave;
    if (!this.knowledgeSaveReady() || !this.sameKnowledgeSave(record)) return;
    const notice = record.state === 'confirmed'
      ? (record.sourceAvailable ? '已核对收藏在我的知识库中。可打开阅读，测验是否可用以收藏详情为准。' : '已核对收藏在我的知识库中；源内容当前不可读取，无法开始测验。')
      : record.state === 'receipt' ? '已收到收藏编号，详情尚未核对。重查只读取该编号，不会再次保存。'
        : record.state === 'unknown' ? '保存结果尚未确认，不会自动或再次发送。请到我的知识库手动核对。' : '正在等待保存回执，不会重复发送。';
    this.setData({ knowledgeSaveState: record.state, knowledgeSaveNotice: notice, knowledgeSaveError: record.error || '', knowledgeSaveBusy: record.state === 'writing' || !!record.reading });
  },
  async saveKnowledge() {
    if (this.preview || this.data.preview || this._writing || this.data.busy || this._knowledgeSave || !this.knowledgeSaveReady()) return;
    const record = Object.assign({}, this._knowledgeBinding, { state: 'writing' });
    this._knowledgeSave = record;
    this.syncKnowledgeSave();
    try {
      const result = await this.api.action('knowledge-save', { product_id: record.productId });
      if (this._knowledgeSave !== record || !this.sameKnowledgeSave(record)) return;
      if (!result || result.saved !== true || typeof result.favorite_id !== 'string' || !productUuid.test(result.favorite_id)) throw new Error('保存回执不完整');
      record.favoriteId = result.favorite_id;
      record.state = 'receipt';
    } catch (error) {
      if (this._knowledgeSave !== record || !this.sameKnowledgeSave(record)) return;
      record.state = 'unknown';
      if (error.status === 401 && !this._hidden) await this.run(async () => { throw error; }, { silent: true });
    }
    if (this._knowledgeSave !== record || !this.sameKnowledgeSave(record)) return;
    this.syncKnowledgeSave();
    if (record.state === 'receipt') return this.retryKnowledgeReadback();
  },
  async retryKnowledgeReadback() {
    const record = this._knowledgeSave;
    if (!this.knowledgeSaveReady() || !this.sameKnowledgeSave(record) || record.state !== 'receipt' || (record.reading && record.reading.request === this._request) || this.preview || this.data.preview) return;
    const reading = { request: this._request };
    const current = () => this._knowledgeSave === record && record.reading === reading && this.sameKnowledgeSave(record) && this.knowledgeSaveReady() && reading.request === this._request;
    record.reading = reading; record.error = ''; this.syncKnowledgeSave();
    try {
      const result = await this.api.action('knowledge-detail', { kind: 'favorite', id: record.favoriteId });
      if (!current()) return;
      record.sourceAvailable = savedFavorite(result, record, this.session.get().userId);
      record.state = 'confirmed';
    } catch (error) {
      if (!current()) return;
      record.error = '收藏详情暂未核对，请只读重查；不会再次保存。';
      if (error.status === 401) await this.run(async () => { throw error; }, { silent: true });
    } finally {
      const visible = current();
      if (record.reading === reading) record.reading = false;
      if (visible) this.syncKnowledgeSave();
    }
  },
  openSavedKnowledge() {
    const record = this._knowledgeSave;
    if (this.knowledgeSaveReady() && this.sameKnowledgeSave(record) && record.state === 'confirmed') return this.navigate(model.detailUrl('favorite', record.favoriteId));
  },
  checkKnowledgeLibrary() {
    if (this.knowledgeSaveReady() && this.sameKnowledgeSave(this._knowledgeSave) && this._knowledgeSave.state === 'unknown') return this.navigate('/pages/list/index?kind=my-library');
  },
  async claimTask() {
    if (this.preview || this.data.preview || this._writing || !this.data.item || this.data.claimed || !this.data.completed) return;
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
  clearObjective() {
    this._objectiveSerial = (this._objectiveSerial || 0) + 1;
    this._objective = null; this._objectiveDraft = null; this._objectiveIdentity = '';
    this.setData({ item: null, nodes: '', fields: [], businessSections: [], gallery: [], backstampUrl: '', videoUrl: '', results: [], draftResults: [], keyActionsDraft: '', freshness: '', actionNotice: '', error: '', loading: false, busy: false, objectiveDirty: false, objectiveBlocked: false });
  },
  objectiveContext() {
    const user = this.session.get();
    return { serial: this._objectiveSerial, identity: model.scope(this), id: this.data.id, shopId: user && user.shop && user.shop.id };
  },
  objectiveActive(c) { return !this._gone && !this._hidden && this.data.kind === 'objectives' && c.id === this.data.id && c.serial === this._objectiveSerial && !!c.identity && c.identity === model.scope(this); },
  async loadObjective() {
    if (this._gone || this._hidden) return;
    if (this._objectiveSaving) {
      this._objectiveResumeRead = this.objectiveContext();
      this.setData({ loading: true });
      return;
    }
    if (this._objectiveRead && this.objectiveActive(this._objectiveRead)) return;
    this.clearObjective();
    const c = this.objectiveContext();
    this._objectiveRead = c;
    this.setData({ loading: true });
    await this.run(async () => {
      try {
        if (!c.identity || !c.shopId || !c.id) throw new Error('缺少已验证员工、门店或 OKR ID，请返回列表');
        const row = await objective.read(this.api, c.id, c.shopId, () => this.objectiveActive(c));
        if (this.objectiveActive(c)) this.showObjective(row, c.identity);
      } catch (error) { if (this.objectiveActive(c)) throw error; }
      finally {
        if (this._objectiveRead === c) this._objectiveRead = null;
        if (this.objectiveActive(c)) this.setData({ loading: false });
      }
    }, { silent: true });
  },
  showObjective(row, identity) {
    this._objective = objective.clone(row); this._objectiveDraft = objective.clone(row.key_results); this._objectiveIdentity = identity;
    const fields = [ ['目标说明', row.objective], ['周期开始', row.period_start], ['周期结束', row.period_end] ].filter(field => field[1] != null).map(field => ({ label: field[0], value: String(field[1]) }));
    this.setData({ item: { id: row.id, title: row.title, category: row.shop_id === null ? '共享 OKR' : '门店 OKR' }, fields, results: objective.views(row.key_results), draftResults: objective.views(row.key_results), keyActionsDraft: row.key_actions || '', freshness: model.freshness(row), objectiveDirty: false, objectiveBlocked: false, error: '' });
    wx.setNavigationBarTitle({ title: row.title });
  },
  objectiveEditable() { return this.objectiveActive(this.objectiveContext()) && this._objectiveIdentity === model.scope(this) && !!this._objective && !!this._objectiveDraft && !this._objectiveSaving && !this.data.loading && !this.data.objectiveBlocked; },
  objectiveDirty() { return this._objective && (!objective.equal(this._objectiveDraft, this._objective.key_results) || this.data.keyActionsDraft !== (this._objective.key_actions || '')); },
  onKeyActionsInput(event) {
    if (this.data.kind !== 'objectives' || !this.objectiveEditable()) return;
    this.setData({ keyActionsDraft: event.detail.value, error: '', actionNotice: '' });
    this.setData({ objectiveDirty: !!this.objectiveDirty() });
  },
  onKeyResultChange(event) {
    if (this.data.kind !== 'objectives' || !this.objectiveEditable()) return;
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.draftResults[index] || !this.data.draftResults[index].editable) return;
    this._objectiveDraft = objective.change(this._objectiveDraft, index, event.detail.value === true);
    this.setData({ draftResults: objective.views(this._objectiveDraft), objectiveDirty: !!this.objectiveDirty(), error: '', actionNotice: '' });
  },
  async saveObjective() {
    if (!this.objectiveEditable() || this.preview || this.data.preview || !this.objectiveDirty()) return;
    if (typeof this.data.keyActionsDraft !== 'string' || this.data.keyActionsDraft.length > 4000) { this.setData({ error: '关键行动最多 4000 个字符，草稿未截断' }); return; }
    const c = this.objectiveContext(), expected = objective.clone(this._objective), params = { id: c.id };
    if (!objective.equal(this._objectiveDraft, expected.key_results)) params.key_results = expected.key_results = objective.clone(this._objectiveDraft);
    if (this.data.keyActionsDraft !== (expected.key_actions || '')) params.key_actions = expected.key_actions = this.data.keyActionsDraft;
    this._objectiveSaving = true;
    this.setData({ busy: true, error: '', actionNotice: '' });
    await this.run(async () => {
      let confirmed = false;
      try {
        const receipt = await this.api.action('objective-update', params);
        if (!this.objectiveActive(c)) return;
        if (!objective.receipt(receipt, expected)) throw new Error('服务器更新回包未通过核对');
        confirmed = true;
        const row = await objective.read(this.api, c.id, c.shopId, () => this.objectiveActive(c));
        if (!this.objectiveActive(c)) return;
        if (!objective.matches(row, expected) || Date.parse(row.updated_at) !== Date.parse(receipt.updated_at)) throw new Error('重新读取内容与更新回包不一致');
        this.showObjective(row, c.identity);
        this.setData({ actionNotice: '服务器保存字段与重新读取内容已核对一致。此接口无并发版本锁，后续修改请再次读取。' });
      } catch (error) {
        if (!this.objectiveActive(c)) return;
        this.setData({ objectiveBlocked: true, actionNotice: confirmed ? '服务器已返回匹配更新字段，但详情尚未核对；未确认保存完成，禁止重复发送。' : '本次保存未完成核对，草稿保留；不会自动重发。请先重新读取云端状态。' });
        if (error.status === 401) { this.clearObjective(); throw error; }
        const safe = new Error(error.status === 403 ? '保存权限由服务器核验，当前未获准保存；草稿保留，请重新读取核对。' : '保存结果未确认，请重新读取核对；草稿已保留。');
        throw safe;
      } finally {
        this._objectiveSaving = false;
        if (this.objectiveActive(c)) this.setData({ busy: false });
        const resume = this._objectiveResumeRead;
        this._objectiveResumeRead = null;
        if (resume && this.objectiveActive(resume)) await this.loadObjective();
      }
    }, { silent: true });
  },
  reloadObjective() {
    if (this._gone || this._hidden || this._objectiveSaving || this.data.loading) return;
    const c = this.objectiveContext();
    if (!this.objectiveDirty() && !this.data.objectiveBlocked) return this.loadObjective();
    const actions = this.data.keyActionsDraft, results = objective.clone(this._objectiveDraft);
    wx.showModal({ title: '重新读取 OKR', content: '将放弃本页未确认草稿并读取当前云端内容；不会重新发送上次保存，也不能据此证明上次请求失败。', confirmText: '读取最新', success: result => { if (result.confirm && this.objectiveActive(c) && !this._objectiveSaving && this.data.keyActionsDraft === actions && objective.equal(this._objectiveDraft, results)) this.loadObjective(); } });
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
  retry() { if (this.data.kind === 'objectives') return this.reloadObjective(); return this.data.kind === 'profile' && this._profileDirty ? this.saveProfile() : this.load(); }
}));
