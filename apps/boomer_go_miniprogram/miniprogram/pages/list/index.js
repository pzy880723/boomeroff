const { definePage } = require('../../shared/page');
const model = require('./model');

Page(definePage({
  data: { kind: '', title: '', query: '', category: '', categories: [], items: [], allItems: [], mastery: 'all', loadedSummary: '', pagingNote: '', isLearningCollection: false, freshness: '', hasMore: false, loadingMore: false, checkin: null, checkingIn: false, checkinNotice: '' },
  onLoad(options) {
    const kind = options.kind || 'my-library';
    const section = model.sections[kind];
    this._hidden = false;
    this.setData({ kind, title: section ? section.title : '内容暂不可用', isLearningCollection: model.learningCollection(kind) });
    wx.setNavigationBarTitle({ title: this.data.title });
    return this.load();
  },
  onShow() { const hidden = this._hidden; this._hidden = false; if (this._request && (!this.data.isLearningCollection || hidden || this._loadedIdentity !== model.scope(this))) return this.load(); },
  onHide() { if (this.data.isLearningCollection) model.hideLearning(this); },
  onUnload() { if (this.data.isLearningCollection) model.hideLearning(this); this._gone = true; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const section = model.sections[this.data.kind];
    const params = Object.assign({}, this.params(), { page: 0 });
    this._cursor = null;
    this._nextPage = null;
    return model.remote(this, () => {
      if (!section) throw new Error('该原生内容类型未开放');
      return this.api.action(section.action, params);
    }, (data) => {
      if (this.data.kind === 'check-ins') return this.showCheckin(data);
      if (this.data.kind === 'tasks') data = model.taskItems(data);
      if (this.data.isLearningCollection) {
        model.showLearning(this, data, 0, false);
        this.setData({ categories: [], freshness: model.freshness(data) });
        return;
      }
      this.setData({ items: model.items(data), categories: model.categories(data), freshness: model.freshness(data), hasMore: model.pagination(this, data, 0) });
    }, { items: [], allItems: [], loadedSummary: '', pagingNote: '', hasMore: false, loadingMore: false, freshness: '', checkin: null, checkinNotice: '' });
  },
  params() { return model.listParams(this.data.kind, this.data.query.trim(), this.data.category); },
  onSearchInput(event) { this.setData({ query: event.detail.value }); },
  onSearch() { return this.data.isLearningCollection ? model.filterLearning(this) : this.load(); },
  onMastery(event) {
    const mastery = event.currentTarget.dataset.mastery;
    if (['all', 'pending', 'mastered'].indexOf(mastery) < 0) return;
    this.setData({ mastery }); model.filterLearning(this);
  },
  onCategory(event) { this.setData({ category: event.currentTarget.dataset.id }); return this.load(); },
  loadMore() {
    return model.loadMore(this, model.sections[this.data.kind].action, this.params());
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
    if (this.data.kind === 'check-ins') return;
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find((entry) => entry.id === id);
    if (this.data.isLearningCollection) return model.openLearning(this, item);
    const kind = this.data.kind === 'my-library' ? model.libraryKind(item) : (this.data.kind === 'conversations' ? 'conversation' : this.data.kind);
    return this.navigate(model.detailUrl(kind, id));
  },
  retry() { return this.load(); }
}));
