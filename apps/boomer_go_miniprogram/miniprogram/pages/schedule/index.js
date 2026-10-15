const { definePage } = require('../../shared/page');
const model = require('../list/model');
const schedule = require('./newmodel');
const pad = (number) => String(number).padStart(2, '0');

Page(definePage({
  data: { month: '', view: 'mine', canViewShop: false, days: [], items: [], visibleItems: [], groups: [], conflicts: [], visibleConflicts: [], selectedDate: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'], freshness: '', notice: '' },
  onLoad(options) {
    this._hidden = false;
    this._view = 'mine';
    const month = schedule.monthValid(options.month || '') ? options.month : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
    this.setData({ month });
    return this.load();
  },
  onShow() {
    const hidden = this._hidden;
    this._hidden = false;
    if (this._request && (hidden || this._identity !== model.scope(this))) return this.load();
  },
  onHide() {
    this._hidden = true;
    this._request = (this._request || 0) + 1;
    this._loadingRun = (this._loadingRun || 0) + 1;
    this._shopPermission = '';
    this.setData({ loading: false, error: '', items: [], visibleItems: [], groups: [], conflicts: [], visibleConflicts: [], canViewShop: false, freshness: '', notice: '' });
    this.buildDays([]);
  },
  onUnload() { this._hidden = true; this._request = (this._request || 0) + 1; this._shopPermission = ''; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    if (this._gone || this._hidden) return Promise.resolve();
    const month = this.data.month;
    if (this._identity && this._identity !== model.scope(this)) this._view = 'mine';
    this._identity = model.scope(this);
    this._shopPermission = '';
    const view = this._view || 'mine';
    const session = this.session.get();
    const context = { month, view, userId: session && session.userId, shopId: session && session.shop && session.shop.id };
    this.buildDays([]);
    return model.remote(this, async () => {
      if (!context.shopId) throw new Error('请先选择当前授权工作门店，再同步排班');
      const serial = this._request;
      const identity = this._identity;
      try { return await this.api.action('schedule', { month, view }); }
      finally {
        // Shared run already serializes loading; also invalidate a revision with no newer read yet.
        if (this._request === serial && model.scope(this) !== identity) this._loadingRun = (this._loadingRun || 0) + 1;
      }
    }, (data) => {
      const result = schedule.decode(data, context);
      if (result.revoked) this._view = 'mine';
      this._shopPermission = result.canViewShop ? this._identity : '';
      this.setData({ view: this._view || 'mine', canViewShop: result.canViewShop, items: result.items, conflicts: result.conflicts,
        freshness: model.freshness(data), notice: result.revoked ? '本店同事查看权限已撤销，请重新同步我的排班。' : '' });
      this.showEntries();
    }, { view, items: [], visibleItems: [], groups: [], conflicts: [], visibleConflicts: [], canViewShop: false, freshness: '', notice: '' });
  },
  buildDays(entries) {
    this.setData({ days: schedule.calendar(this.data.month, this.data.selectedDate, entries) });
  },
  showEntries() {
    const date = this.data.selectedDate;
    const items = this.data.items.filter((entry) => !date || entry.date === date);
    this.setData({ visibleItems: items, groups: schedule.groups(items), visibleConflicts: this.data.conflicts.filter((entry) => !date || entry.date === date) });
    this.buildDays(this.data.items);
  },
  onViewChange(event) {
    if (this._gone || this._hidden) return Promise.resolve();
    if (this._identity !== model.scope(this)) return this.load();
    const view = event.currentTarget.dataset.view;
    if (view !== 'mine' && view !== 'shop') return Promise.resolve();
    if (view === 'shop' && this._shopPermission !== model.scope(this)) {
      this.setData({ notice: '当前尚未确认本店同事查看权限，请先同步我的排班。' });
      return Promise.resolve();
    }
    if (view === this._view) return Promise.resolve();
    this._view = view;
    this.setData({ selectedDate: '' });
    return this.load();
  },
  onMonthChange(event) {
    if (this._gone || this._hidden) return Promise.resolve();
    const month = String(event.detail.value).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    this.setData({ month, selectedDate: '' });
    return this.load();
  },
  previousMonth() { return this.changeMonth(-1); },
  nextMonth() { return this.changeMonth(1); },
  changeMonth(delta) {
    const parts = this.data.month.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1 + delta, 1);
    return this.onMonthChange({ detail: { value: date.getFullYear() + '-' + pad(date.getMonth() + 1) } });
  },
  selectDay(event) {
    if (this._gone || this._hidden) return;
    if (this._identity !== model.scope(this)) return this.load();
    const date = event.currentTarget.dataset.date;
    if (!schedule.dateValid(date, this.data.month)) return;
    this.setData({ selectedDate: date });
    this.showEntries();
  },
  showMonth() {
    if (this._gone || this._hidden) return;
    if (this._identity !== model.scope(this)) return this.load();
    this.setData({ selectedDate: '' });
    this.showEntries();
  },
  retry() { return this.load(); }
}));
