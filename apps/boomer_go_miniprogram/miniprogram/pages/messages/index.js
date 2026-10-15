const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: { items: [], visibleItems: [], filter: 'all', unread: 0, marking: false, freshness: '' },
  onLoad() { return this.load(); },
  onShow() { if (this._request) return this.load(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    return model.remote(this, () => this.api.action('notifications', {}), (data) => {
      this.setData({ items: model.items(data).map((item) => Object.assign({}, item, { category: model.notificationCategory(item.category) })), freshness: model.freshness(data) });
      this.applyFilter();
    }, { items: [], visibleItems: [], unread: 0, freshness: '' });
  },
  applyFilter() {
    const entries = this.data.items;
    this.setData({ unread: entries.filter((item) => !item.read).length, visibleItems: this.data.filter === 'unread' ? entries.filter((item) => !item.read) : entries.slice() });
  },
  onFilter(event) { this.setData({ filter: event.currentTarget.dataset.kind }); this.applyFilter(); },
  markRead(event) { return this.writeRead([String(event.currentTarget.dataset.id)], false); },
  markAll() { return this.writeRead(this.data.items.filter((item) => !item.read).map((item) => item.id), true); },
  async writeRead(ids, all) {
    if (this._marking || !ids.length) return false;
    this._marking = true;
    this.setData({ marking: true, error: '' });
    const identity = model.scope(this);
    try {
      return await this.run(async () => {
        if (!identity) throw new Error('员工登录已失效，请重新登录');
        const data = await this.api.action('notification-read', all ? { all: true } : { id: ids[0] });
        if (!data || !Number.isInteger(data.marked) || data.marked < ids.length) throw new Error('服务器尚未确认已读状态，请重试');
        if (identity !== model.scope(this) || this._gone) return false;
        this.setData({ items: this.data.items.map((item) => ids.indexOf(item.id) >= 0 ? Object.assign({}, item, { read: true }) : item) });
        this.applyFilter();
        return true;
      }, { silent: true });
    } finally { this._marking = false; if (!this._gone) this.setData({ marking: false }); }
  },
  async openItem(event) {
    const id = String(event.currentTarget.dataset.id);
    const item = this.data.items.find((entry) => entry.id === id);
    if (!item) return;
    if (!item.read && !(await this.writeRead([id], false))) return;
    return this.navigate(model.detailUrl(item.kind === 'conversation' ? 'conversation' : 'notifications', id));
  },
  retry() { return this.load(); }
}));
