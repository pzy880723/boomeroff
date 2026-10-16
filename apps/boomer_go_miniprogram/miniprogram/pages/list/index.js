const { definePage } = require('../../shared/page');
const model = require('./model');
const rewards = require('./rewards');
const knowledgeCategories = require('../../shared/knowledge-categories');
const official = require('../../shared/official-library');

Page(definePage({
  data: { kind: '', title: '', query: '', category: '', categories: [], items: [], allItems: [], mastery: 'all', loadedSummary: '', pagingNote: '', isLearningCollection: false, freshness: '', hasMore: false, loadingMore: false, checkin: null, checkingIn: false, checkinNotice: '', rewardSummary: null, rewardOutcomes: [], rewardCounts: {}, rewardTotal: 0, rewardTotalText: '0', rewardProgress: '', rewardNotice: '', rewardRefreshError: '', rewardBusy: false, rewardModal: false, rewardCanClaim: false, rewardNeedsRefresh: false, rewardBatchDate: '', isOfficial: false, officialCategoryOptions: knowledgeCategories.OPTIONS, officialCategoryIndex: 0, officialCategoryLabel: '全部分类' },
  onLoad(options) {
    const kind = options.kind || 'my-library';
    const section = model.sections[kind];
    this._hidden = false;
    this.setData(Object.assign({}, official.fields, { kind, title: section ? section.title : '内容暂不可用', isLearningCollection: model.learningCollection(kind) }));
    if (kind === 'official') official.reset(this, options);
    wx.setNavigationBarTitle({ title: this.data.title });
    return this.load();
  },
  onShow() { const hidden = this._hidden; this._hidden = false; if (this.data.kind === 'tasks') { if (this._taskIdentity && this._taskIdentity !== model.scope(this)) this.clearTasks(); if (hidden || !this._taskSnapshot) return this.loadTasks(); return; } if (this.isOfficialKnowledge()) { if (hidden || this._loadedIdentity !== model.scope(this) && !(this.data.loading && this._officialReadIdentity === model.scope(this))) return this.load(); return; } if (this._request && (!this.data.isLearningCollection || hidden || this._loadedIdentity !== model.scope(this))) return this.load(); },
  onHide() { official.discard(this); if (this.data.kind === 'tasks') { this._hidden = true; this.clearTasks(); } if (this.data.isLearningCollection || this.isOfficialKnowledge()) model.hideLearning(this); },
  onUnload() { official.discard(this); if (this.data.kind === 'tasks') { this._hidden = true; this.clearTasks(); } if (this.data.isLearningCollection || this.isOfficialKnowledge()) model.hideLearning(this); this._gone = true; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    if (this.data.kind === 'tasks') return this.loadTasks();
    if (this.isOfficialKnowledge()) return official.load(this, model);
    if (this.isOfficialKnowledge() && (this._gone || this._hidden)) return Promise.resolve();
    this.syncOfficialCategory();
    if (this.isOfficialKnowledge()) this._officialReadIdentity = model.scope(this);
    const section = model.sections[this.data.kind];
    const params = Object.assign({}, this.params(), { page: 0 });
    this._cursor = null;
    this._nextPage = null;
    return model.remote(this, () => {
      if (!section) throw new Error('该原生内容类型未开放');
      return this.api.action(section.action, params);
    }, (data) => {
      if (this.data.kind === 'check-ins') return this.showCheckin(data);
      if (this.data.isLearningCollection) {
        model.showLearning(this, data, 0, false);
        this.setData({ categories: [], freshness: model.freshness(data) });
        return;
      }
      this.setData({ items: model.items(data), categories: model.categories(data), freshness: model.freshness(data), hasMore: model.pagination(this, data, 0) });
    }, { items: [], allItems: [], learningGroups: [], loadedSummary: '', pagingNote: '', hasMore: false, loadingMore: false, freshness: '', checkin: null, checkinNotice: '' });
  },
  params() { return model.listParams(this.data.kind, this.data.query.trim(), this.data.category); },
  onSearchInput(event) { if (!this._gone && !this._hidden) this.setData({ query: event.detail.value }); },
  onSearch() { return this.data.isLearningCollection ? model.filterLearning(this) : this.load(); },
  onMastery(event) {
    const mastery = event.currentTarget.dataset.mastery;
    if (['all', 'pending', 'mastered'].indexOf(mastery) < 0) return;
    this.setData({ mastery }); model.filterLearning(this);
  },
  isOfficialKnowledge() { return this.data.kind === 'official'; },
  syncOfficialCategory() {
    official.sync(this);
  },
  officialCategoryReady() { return official.ready(this, model); },
  beginOfficialCategory() { official.begin(this, model, 'category'); },
  onOfficialCategory(event) { return official.choose(this, model, 'category', event); },
  beginOfficialIP() { official.begin(this, model, 'ip'); },
  onOfficialIP(event) { return official.choose(this, model, 'ip', event); },
  onOfficialSort(event) { return official.sort(this, model, event); },
  onOfficialClear(event) { return official.clear(this, model, event); },
  onCategory(event) { if (this.data.kind === 'knowledge' || this.isOfficialKnowledge()) return; this.setData({ category: event.currentTarget.dataset.id }); return this.load(); },
  loadMore() {
    if (this.data.kind === 'tasks') return Promise.resolve();
    if (this.isOfficialKnowledge()) return official.more(this, model);
    if (this.isOfficialKnowledge() && (this._gone || this._hidden || this.data.loading || this._loadedIdentity !== model.scope(this))) return;
    this._officialPicker = null;
    return model.loadMore(this, model.sections[this.data.kind].action, this.params());
  },
  taskContext() { return { epoch: this._taskEpoch, identity: model.scope(this) }; },
  tasksActive(c) { return !this._gone && !this._hidden && this.data.kind === 'tasks' && !!c.identity && c.identity === model.scope(this) && c.epoch === this._taskEpoch; },
  clearTasks() {
    this._taskEpoch = (this._taskEpoch || 0) + 1; this._taskVersion = (this._taskVersion || 0) + 1;
    this._taskSnapshot = null; this._taskIdentity = ''; this._taskRead = null; this._rewardModalToken = null; this._rewardExcluded = new Set(); this._rewardDateMismatch = false;
    this.setData({ items: [], allItems: [], categories: [], freshness: '', error: '', loading: false, rewardSummary: null, rewardOutcomes: [], rewardCounts: {}, rewardTotal: 0, rewardTotalText: '0', rewardProgress: '', rewardNotice: '', rewardRefreshError: '', rewardBusy: false, rewardModal: false, rewardCanClaim: false, rewardNeedsRefresh: false, rewardBatchDate: '' });
  },
  rewardQueue() { return this._taskSnapshot ? this._taskSnapshot.queue.filter(item => !this._rewardExcluded.has(item.key)) : []; },
  showRewardSummary() {
    const snapshot = this._taskSnapshot, queue = this.rewardQueue();
    const pendingCount = queue.filter(item => item.kind === 'pending').length;
    const sameDate = !!snapshot && snapshot.date === rewards.day(Date.now());
    if (!sameDate) this.setData({ rewardNotice: '服务器日期与当前上海日期不同，请先刷新核对，暂不提交领取。' });
    else if (this._rewardDateMismatch) this.setData({ rewardNotice: '' });
    this._rewardDateMismatch = !sameDate;
    this.setData({ rewardSummary: snapshot ? { date: snapshot.date, pendingCount, dailyCount: queue.length - pendingCount, eligibleCount: queue.length, loadedPendingCount: snapshot.pendingCount } : null, rewardCanClaim: sameDate && queue.length > 0 });
  },
  async loadTasks(options = {}) {
    if (this._gone || this._hidden) return;
    if (this._rewardFlight && !options.afterBatch) {
      if (!this.tasksActive(this._rewardFlight)) { this._taskResumeRead = this.taskContext(); this.setData({ loading: true }); }
      return;
    }
    if (this._taskRead && this.tasksActive(this._taskRead)) return;
    this._taskEpoch = this._taskEpoch || 1;
    this._rewardExcluded = this._rewardExcluded || new Set();
    const c = this.taskContext(); this._taskRead = c; this._taskVersion = (this._taskVersion || 0) + 1;
    this._rewardModalToken = null; this._taskSnapshot = null;
    this.setData({ loading: true, rewardModal: false, rewardCanClaim: false, error: '', rewardRefreshError: '' });
    await this.run(async () => {
      try {
        if (!c.identity) throw new Error('请先登录员工账号');
        const data = await this.api.action('tasks', {});
        if (!this.tasksActive(c)) return;
        const snapshot = rewards.parse(data);
        this._taskSnapshot = snapshot; this._taskIdentity = c.identity;
        this.setData({ items: model.items(model.taskItems(data)), categories: [], hasMore: false, freshness: model.freshness(data), rewardNeedsRefresh: false });
        this.showRewardSummary();
      } catch (error) {
        if (!this.tasksActive(c)) return;
        this.setData({ rewardNeedsRefresh: true, rewardCanClaim: false });
        if (error.status === 401 || error.status === 403) {
          this.clearTasks();
          const safe = new Error('员工授权已变化，请重新核对登录与权限'); safe.status = error.status; safe.code = error.code; safe.requestRevision = error.requestRevision; throw safe;
        }
        if (this.data.rewardOutcomes.length) this.setData({ rewardRefreshError: '云端列表刷新失败，本次逐项结果保留；列表消失不能证明领取成功。' });
        else { this.setData({ items: [], rewardSummary: null }); throw new Error(error.code === 'task_items_missing' ? '任务统计不能替代实际任务条目，请重新读取云端任务' : '任务日期或条目未确认，请重新读取云端任务'); }
      } finally {
        if (this._taskRead === c) this._taskRead = null;
        if (this.tasksActive(c)) this.setData({ loading: false });
      }
    }, { silent: true });
  },
  confirmRewards() {
    if (!this.tasksActive(this.taskContext()) || this.preview || this.data.preview || this._rewardFlight || this._rewardModalToken || this.data.loading || this.data.rewardNeedsRefresh || !this._taskSnapshot || this._taskIdentity !== model.scope(this)) return;
    if (this._taskSnapshot.date !== rewards.day(Date.now())) { this.setData({ rewardCanClaim: false, rewardNeedsRefresh: true, rewardNotice: '日期已变化，请先只读刷新云端任务再确认。' }); return; }
    const queue = this.rewardQueue().map(item => Object.assign({}, item, { params: Object.assign({}, item.params) }));
    if (!queue.length) return;
    const token = { context: this.taskContext(), version: this._taskVersion, date: this._taskSnapshot.date, queue };
    this._rewardModalToken = token; this.setData({ rewardModal: true });
    const pending = queue.filter(item => item.kind === 'pending').length;
    wx.showModal({ title: '领取当前已加载奖励', content: '服务器日期 ' + token.date + '：待领事件 ' + pending + ' 项，每日达标任务 ' + (queue.length - pending) + ' 项。将逐项领取，非原子批次；金额与资格以服务器实际回包为准。', confirmText: '确认领取', confirmColor: '#EB0029',
      success: result => {
        if (this._rewardModalToken !== token) return;
        this._rewardModalToken = null;
        if (!this.tasksActive(token.context)) return;
        this.setData({ rewardModal: false });
        if (!result.confirm || token.version !== this._taskVersion || this.preview || this.data.preview) return;
        if (token.date !== rewards.day(Date.now())) { this.setData({ rewardCanClaim: false, rewardNeedsRefresh: true, rewardNotice: '日期已变化，请先刷新云端任务；未提交领取。' }); return; }
        return this.claimRewardQueue(token);
      }, fail: () => { if (this._rewardModalToken === token) { this._rewardModalToken = null; if (this.tasksActive(token.context)) this.setData({ rewardModal: false }); } }
    });
  },
  async claimRewardQueue(token) {
    const c = token.context;
    if (this._rewardFlight || !this.tasksActive(c) || this.preview || this.data.preview || token.version !== this._taskVersion || token.date !== rewards.day(Date.now())) return;
    this._rewardFlight = c;
    const outcomes = token.queue.map(item => ({ key: item.key, title: item.title, status: 'untouched', dateUnverified: false }));
    this.setData(Object.assign({ rewardBusy: true, rewardNotice: '', rewardRefreshError: '', rewardBatchDate: token.date }, rewards.outcomes(outcomes)));
    try {
      for (let index = 0; index < token.queue.length; index++) {
        if (!this.tasksActive(c)) return;
        if (token.date !== rewards.day(Date.now())) { this.setData({ rewardNotice: '日期已变化，后续项目未提交；客户端检查不能锁定服务端领取日期。' }); break; }
        const item = token.queue[index], outcome = outcomes[index];
        outcome.status = 'claiming'; this._rewardExcluded.add(item.key);
        this.setData(rewards.outcomes(outcomes));
        let stop = false;
        try {
          const response = await this.api.action('task-claim', item.params);
          if (!this.tasksActive(c)) return;
          const receipt = rewards.receipt(response);
          outcome.status = 'confirmed'; outcome.amount = receipt.amount;
        } catch (error) {
          if (!this.tasksActive(c)) return;
          if (error.status === 401 || error.status === 403) {
            this.clearTasks(); this.setData({ rewardNotice: '员工授权已变化，本次停止；未核对的请求不能算作领取成功。' });
            const safe = new Error('员工授权已变化，请重新核对登录与权限'); safe.status = error.status; safe.code = error.code; safe.requestRevision = error.requestRevision;
            await this.run(async () => { throw safe; }, { silent: true }); return;
          }
          if (error.status === 409 && error.code === 'claim_rejected') outcome.status = 'rejected';
          else { outcome.status = 'unknown'; stop = true; this.setData({ rewardNotice: '有一项领取结果未确认，后续未提交；不会自动重发，也不会把列表消失当作成功。' }); }
        }
        if (token.date !== rewards.day(Date.now())) {
          outcome.dateUnverified = true; stop = true;
          this.setData({ rewardNotice: '本次发生跨日，已确认变动仍展示，但服务端领取日期未核验；后续项目未提交。' });
        }
        this.setData(rewards.outcomes(outcomes));
        if (stop) break;
      }
      if (this.tasksActive(c)) await this.loadTasks({ afterBatch: true });
    } finally {
      if (this._rewardFlight === c) this._rewardFlight = null;
      if (this.tasksActive(c)) this.setData({ rewardBusy: false });
      const resume = this._taskResumeRead; this._taskResumeRead = null;
      if (resume && this.tasksActive(resume)) await this.loadTasks();
    }
  },
  showCheckin(data) {
    if (typeof data.checked_today !== 'boolean') throw new Error('成长签到状态未确认，请重试');
    const history = model.checkinHistory(data);
    const stats = data.stats || {};
    this.setData({ checkin: { date: data.date, checkedToday: data.checked_today, currentStreak: model.value(stats.current_streak, false), longestStreak: model.value(stats.longest_streak, false), total: model.value(stats.total_check_ins, false) }, items: model.items(history), hasMore: model.pagination(this, history, 0), freshness: model.freshness(data) });
  },
  async submitCheckin() {
    if (this._checkingIn || !this.data.checkin || this.data.checkin.checkedToday) return;
    this._checkingIn = true;
    const identity = model.scope(this);
    this.setData({ checkingIn: true, checkinNotice: '' });
    try {
      await this.run(async () => {
        const result = await this.api.action('checkin-submit', {});
        if (this._gone || identity !== model.scope(this)) return;
        if (!result || result.checked_today !== true || !result.record || !result.record.id) throw new Error('服务器未确认成长签到，请刷新核对');
        const status = await this.api.action('checkin-status', { page: 0, page_size: 20 });
        if (this._gone || identity !== model.scope(this)) return;
        if (!status || status.checked_today !== true || !status.today || status.today.id !== result.record.id) throw new Error('成长签到回读不一致，请重新核对云端状态');
        this.showCheckin(status);
        this.setData({ checkinNotice: result.already ? '服务器确认今日已完成成长签到。' : '服务器已确认成长签到，记录与经验已重新读取。' });
      });
    } finally { this._checkingIn = false; if (!this._gone) this.setData({ checkingIn: false }); }
  },
  openItem(event) {
    if (this.data.kind === 'tasks' && (this._rewardFlight || this._rewardModalToken || this.data.loading || !this._taskSnapshot || this._taskIdentity !== model.scope(this) || this._hidden || this._gone || !this.data.items.some(item => item.id === event.currentTarget.dataset.id))) return;
    if (this.data.kind === 'check-ins') return;
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find((entry) => entry.id === id);
    if (this.isOfficialKnowledge() && (!official.ready(this, model) || !item)) return;
    if (this.data.isLearningCollection) return model.openLearning(this, item);
    const kind = this.data.kind === 'my-library' ? model.libraryKind(item) : (this.data.kind === 'conversations' ? 'conversation' : this.data.kind);
    return this.navigate(model.detailUrl(kind, id));
  },
  retry() { return this.load(); }
}));
