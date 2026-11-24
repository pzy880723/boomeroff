const { day } = require('../../shared/operations');
const labels = { pending: '待完成', in_progress: '进行中', completed: '已完成' };

Page({
  data: { shops: [], shop: null, items: [], total: 0, completed: 0, date: '', today: '',
    canCreate: false, writes: false, loading: true, ready: false, error: '' },
  onShow() {
    const scope = getApp().operations.current();
    if (!scope) return this.leave();
    const today = day();
    const date = !this.data.date || this.data.date === this.data.today ? today : this.data.date;
    this.setData({ shops: scope.shops, today, date, shop: scope.shops.find(shop => shop.id === this.data.shop?.id) || scope.shops[0],
      canCreate: scope.writes && scope.canManage, writes: scope.writes });
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
  chooseDate(event) {
    this.setData({ date: event.detail.value });
    return this.refresh();
  },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()); },
  async refresh() {
    const ops = getApp().operations;
    const shop = this.data.shop;
    if (!shop) return;
    const date = this.data.date, load = {};
    this._load = load;
    this.setData({ loading: true, ready: false, error: '', items: [], total: 0, completed: 0 });
    try {
      const data = await ops.tasks(shop.id, date);
      if (this._load !== load) return;
      const items = data.items.map(item => ({ ...item, label: labels[item.status] || '待确认',
        photoCount: Array.isArray(item.photos) ? item.photos.length : 0 }));
      const scope = ops.current();
      this.setData({ items, total: data.total, completed: data.completed, ready: true,
        percent: data.total ? Math.round(data.completed * 100 / data.total) : 0,
        canCreate: scope.writes && scope.canManage, writes: scope.writes });
    } catch (error) {
      if (this._load !== load) return;
      if (!ops.current()) return this.leave();
      this.setData({ error: error.message });
    } finally { if (this._load === load) this.setData({ loading: false }); }
  },
  task(event) { this.openTask(event.currentTarget.dataset.id); },
  create() { if (this.data.canCreate) this.openTask(''); },
  openTask(id) {
    const { shop, date } = this.data;
    if (!shop) return;
    wx.navigateTo({ url: '/pages/tasks/index?shop=' + encodeURIComponent(shop.id) + '&date=' + date + (id ? '&id=' + id : '') });
  },
  browse(event) {
    const page = event.currentTarget.dataset.page;
    if (['learning', 'competition', 'messages', 'me'].includes(page)) wx.switchTab({ url: '/pages/' + page + '/index' });
  },
  onShareAppMessage({ from, target } = {}) {
    const { date, shop, ready, total, completed } = this.data;
    const summary = from === 'button' && target?.dataset?.report && ready && shop;
    return {
      title: summary ? shop.name + ' · ' + date + ' 店务｜已完成 ' + completed + '/' + total + ' 项' : 'BOOMER GO 门店工作台',
      path: '/pages/workbench/index'
    };
  }
});
