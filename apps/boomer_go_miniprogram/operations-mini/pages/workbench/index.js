const { day } = require('../../shared/operations');
const labels = { pending: '待完成', in_progress: '进行中', completed: '已完成' };

Page({
  data: { shops: [], shop: null, items: [], total: 0, completed: 0, date: '', loading: false, error: '' },
  onShow() {
    const scope = getApp().operations.current();
    if (!scope) return this.leave();
    this.setData({ shops: scope.shops, shop: scope.shops.find(shop => shop.id === this.data.shop?.id) || scope.shops[0] });
    return this.refresh();
  },
  onHide() { this._load = null; },
  onUnload() { this._load = null; },
  leave() {
    this._load = null;
    getApp().operations.signOut();
    wx.reLaunch({ url: '/pages/login/index' });
  },
  choose(event) {
    const shop = this.data.shops[Number(event.detail.value)];
    if (shop) { this.setData({ shop }); return this.refresh(); }
  },
  async refresh() {
    const ops = getApp().operations;
    const shop = this.data.shop;
    if (!shop) return;
    const date = day(), load = {};
    this._load = load;
    this.setData({ date, loading: true, error: '', openId: '', items: [], total: 0, completed: 0 });
    try {
      const data = await ops.tasks(shop.id, date);
      if (this._load !== load) return;
      const items = data.items.map(item => ({ ...item, label: labels[item.status] || '待确认',
        photoCount: Array.isArray(item.photos) ? item.photos.length : 0 }));
      this.setData({ items, total: data.total, completed: data.completed });
    } catch (error) {
      if (this._load !== load) return;
      if (!ops.current()) return this.leave();
      this.setData({ error: error.message });
    } finally { if (this._load === load) this.setData({ loading: false }); }
  },
  toggle(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ openId: this.data.openId === id ? '' : id });
  }
});
