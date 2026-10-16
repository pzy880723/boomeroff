const { definePage } = require('../../shared/page');
const model = require('../list/model');
const { createVisibleRead } = require('../../shared/visible-financial-read');

function emptyFinancial() { return { metrics: [], items: [], freshness: '', leaderboardFreshness: '', salesError: '', leaderboardError: '', salesNotice: '', leaderboardNotice: '', salesLoading: false, leaderboardLoading: false, loading: false }; }

Page(definePage({
  data: Object.assign({ kind: 'summary', period: 'today', shopName: '', periods: [{ id: 'today', label: '今日' }, { id: 'month', label: '本月' }] }, emptyFinancial()),
  onLoad(options) { this._hidden = false; this._initialShow = true; this.setData({ kind: options.kind === 'leaderboard' ? 'leaderboard' : 'summary' }); this._initialRead = this.load(); return this._initialRead; },
  onShow() { const first = this._initialShow; this._initialShow = false; this._hidden = false; if (first && this._identity === model.scope(this)) return this._initialRead; return this.load(); },
  onHide() { this._hidden = true; if (this._readers) Object.values(this._readers).forEach(reader => reader.stop()); },
  onUnload() { this._gone = true; this.onHide(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  financialEnabled() { const s = this.session.get(); return !this._gone && !this._hidden && !this.preview && !this.data.preview && !!(s && s.userId && s.shop && s.shop.id); },
  reader(kind) {
    if (!this._readers) this._readers = {};
    if (!this._readers[kind]) this._readers[kind] = createVisibleRead({ enabled: () => this.financialEnabled(), key: () => model.scope(this) + ':' + this.data.period,
      read: active => this.readFinancial(kind, active), setTimeout, clearTimeout });
    return this._readers[kind];
  },
  load() {
    if (this._hidden || this._gone) return Promise.resolve();
    const session = this.session.get(), identity = model.scope(this);
    if (identity !== this._identity) { if (this._readers) Object.values(this._readers).forEach(reader => reader.stop()); this.setData(emptyFinancial()); }
    this._identity = identity;
    this.setData({ shopName: session && session.shop ? session.shop.name : '暂无已验证工作门店', error: '' });
    if (!this.financialEnabled()) {
      if (this._readers) Object.values(this._readers).forEach(reader => reader.stop());
      const notice = this.preview || this.data.preview ? '开发预览不读取真实 ERP 业绩或排名。' : '暂无已验证工作门店，不读取营业额或榜单。';
      this.setData(Object.assign(emptyFinancial(), { salesNotice: notice, leaderboardNotice: notice })); return Promise.resolve();
    }
    return Promise.all([this.loadSales(), this.loadLeaderboard()]);
  },
  loadSales() { return this.reader('sales').refresh(); },
  loadLeaderboard() { return this.reader('leaderboard').refresh(); },
  async readFinancial(kind, active) {
    if (!active()) return;
    const sales = kind === 'sales', params = { period: this.data.period };
    this.setData(sales ? { salesLoading: true, salesError: '' } : { leaderboardLoading: true, leaderboardError: '' });
    try {
      const data = await (sales ? this.api.sales(params) : this.api.leaderboard(params));
      if (!active()) return;
      if (sales) this.setData({ metrics: [
        { label: data.source_label || '付款毛额（未扣退款）', value: model.value(data.revenue, true) },
        { label: '成交订单', value: model.value(data.order_count, false) },
        { label: '退款金额', value: model.value(data.refund_amount, true) },
        { label: '客单价', value: model.value(data.average_order_value, true) }
      ], freshness: model.freshness(data), salesNotice: data.complete === false ? data.message || '当前数据不完整，请以 ERP 完整记录为准。' : '' });
      else this.setData({ items: (Array.isArray(data.items) ? data.items : []).map(item => ({ id: String(item.id || item.employee_id || item.shop_id || item.name), name: item.name || item.employee_name || item.shop_name || '未提供姓名', rank: Number.isInteger(item.rank) ? String(item.rank) : '—', value: model.value(item.revenue, true) })),
        leaderboardFreshness: model.freshness(data), leaderboardNotice: data.complete === false ? data.message || '榜单归属数据尚未齐备，暂不生成排名。' : '' });
    } catch (error) {
      if (!active()) return;
      if (error.status === 401) {
        Object.values(this._readers).forEach(reader => reader.stop()); this.setData(emptyFinancial());
        const safe = new Error('员工登录已失效，请重新登录'); safe.status = 401; safe.code = error.code; safe.requestRevision = error.requestRevision;
        await this.run(async () => { throw safe; }, { silent: true });
      } else this.setData(sales ? { metrics: [], freshness: '', salesNotice: '', salesError: error.message || '营业数据暂不可用' } : { items: [], leaderboardFreshness: '', leaderboardNotice: '', leaderboardError: error.message || '榜单暂不可用' });
    } finally { if (active()) this.setData(sales ? { salesLoading: false } : { leaderboardLoading: false }); }
  },
  onPeriod(event) {
    const period = event.currentTarget.dataset.period;
    if (this._hidden || this._gone || ['today', 'month'].indexOf(period) < 0 || period === this.data.period) return;
    if (this._readers) Object.values(this._readers).forEach(reader => reader.stop());
    this.setData(Object.assign(emptyFinancial(), { period })); return this.load();
  },
  onKind(event) { const kind = event.currentTarget.dataset.kind; if (!this._hidden && !this._gone && ['summary', 'leaderboard'].indexOf(kind) >= 0) this.setData({ kind }); },
  retry() { return this.load(); }
}));
