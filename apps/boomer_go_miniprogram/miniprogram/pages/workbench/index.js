const { definePage } = require('../../shared/page');
const model = require('../list/model');

function agendaItems(data) {
  return model.items(model.taskItems(data)).map((item) => Object.assign(item, { url: model.detailUrl('tasks', item.id) }));
}

Page(definePage({
  data: {
    name: '', shopName: '', shops: [], shopIndex: 0, isHeadquarters: false, date: '', shift: null, agenda: [], salesValue: '暂无数据', salesLabel: '付款毛额（未扣退款）', salesFreshness: '', salesError: '', salesLoading: false, salesNotice: '', freshness: '',
    agendaLoading: false, agendaError: '', agendaFreshness: '',
    tools: [
      { label: '门店 SOP', icon: 'S', url: '/pages/store-kb/index?type=sop' },
      { label: '门店问答', icon: 'Q', url: '/pages/store-kb/index?type=qa' },
      { label: '每日任务', icon: '待', url: '/pages/list/index?kind=tasks' },
      { label: '门店 OKR', icon: 'O', url: '/pages/list/index?kind=objectives' },
      { label: 'BOOMER 圈', icon: '圈', url: '/pages/list/index?kind=community' },
      { label: '营销工作台', icon: 'M', url: '/pages/marketing/index' },
      { label: 'AI 助手', icon: 'AI', url: '/pages/assistant/index' },
      { label: '我的活动', icon: '约', url: '/pages/list/index?kind=activities' }
    ]
  },
  onLoad() { this._initialShow = true; return this.load(); },
  onShow() {
    if (this._initialShow) { this._initialShow = false; return; }
    if (this._request) return this.load();
  },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const session = this.session.get();
    const identity = model.scope(this);
    const sameScope = this._agendaScope === identity;
    this._agendaScope = identity;
    const shops = session && session.isHeadquarters === true ? (session.shops || []).map((shop) => ({ id: shop.id, name: shop.name })) : [];
    this.setData({ name: session ? session.profile.display_name : '', shopName: session && session.shop ? session.shop.name : '暂无已验证工作门店', shops, shopIndex: Math.max(0, shops.findIndex((shop) => session.shop && shop.id === session.shop.id)), isHeadquarters: !!(session && session.isHeadquarters === true), date: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) });
    const pending = model.remote(this, () => this.api.action('dashboard', {}), (response) => {
      const dashboard = response || {};
      const shift = dashboard.shift;
      this.setData({
        shift: shift ? { title: shift.title || shift.name || '今日排班', start: shift.start_time || '', end: shift.end_time || '', shop: shift.shop_name || '', note: shift.note || '' } : null,
        freshness: model.freshness(dashboard)
      });
      if (Array.isArray(dashboard.tasks)) this.setData({ agenda: agendaItems({ items: dashboard.tasks, pending_items: dashboard.pending_items }) });
    }, { shift: null, agenda: sameScope ? this.data.agenda : [], agendaFreshness: sameScope ? this.data.agendaFreshness : '', agendaError: '', agendaLoading: false, salesValue: '暂无数据', salesLabel: '付款毛额（未扣退款）', salesLoading: false, salesFreshness: '', salesError: '', salesNotice: '', freshness: '' });
    const request = this._request;
    return pending.then(() => {
      if (!this._gone && identity === model.scope(this) && request === this._request) return Promise.all([this.loadSales(), this.loadAgenda()]);
    });
  },
  onShopChange(event) {
    return this.run(async () => {
      const session = this.session.get();
      const shop = this.data.shops[Number(event.detail.value)];
      if (!session || session.isHeadquarters !== true || !shop || !(session.shops || []).some((entry) => entry.id === shop.id)) throw new Error('当前账号不可切换至该授权门店');
      this.session.selectShop(shop.id);
      await this.load();
    });
  },
  async loadSales() {
    const identity = model.scope(this);
    if (!identity || this._gone) return;
    const request = this._request;
    this.setData({ salesLoading: true, salesError: '' });
    try {
      const sales = await this.api.sales({ period: 'today' });
      if (this._gone || identity !== model.scope(this) || request !== this._request) return;
      this.setData({ salesValue: model.value(sales && sales.revenue, true), salesLabel: sales.source_label || '付款毛额（未扣退款）', salesFreshness: model.freshness(sales), salesNotice: sales.complete === false ? sales.message || 'ERP 数据尚未完整同步' : '' });
    } catch (error) {
      if (!this._gone && identity === model.scope(this) && request === this._request) this.setData({ salesError: error.message || '营业数据暂不可用' });
    } finally {
      if (!this._gone && request === this._request) this.setData({ salesLoading: false });
    }
  },
  async loadAgenda() {
    const identity = model.scope(this);
    if (!identity || this._gone) return;
    const request = this._request;
    const serial = (this._agendaRequest || 0) + 1;
    this._agendaRequest = serial;
    const active = () => !this._gone && identity === model.scope(this) && request === this._request && serial === this._agendaRequest;
    this.setData({ agendaLoading: true, agendaError: '' });
    try {
      const data = await this.api.action('tasks', {});
      if (!active()) return;
      this.setData({ agenda: agendaItems(data), agendaFreshness: data.date ? '任务日期 ' + data.date : '任务已同步' });
    } catch (error) {
      if (active()) {
        if (error.status === 401) await this.run(async () => { throw error; }, { silent: true });
        else this.setData({ agendaError: error.message || '任务暂不可用，请重试' });
      }
    } finally {
      if (active()) this.setData({ agendaLoading: false });
    }
  },
  retry() { return this.load(); }
}));
