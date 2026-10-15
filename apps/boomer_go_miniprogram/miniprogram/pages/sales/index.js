const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: { kind: 'summary', period: 'today', metrics: [], items: [], freshness: '', leaderboardFreshness: '', salesError: '', leaderboardError: '', salesNotice: '', leaderboardNotice: '', shopName: '', periods: [{ id: 'today', label: '今日' }, { id: 'month', label: '本月' }] },
  onLoad(options) { this.setData({ kind: options.kind === 'leaderboard' ? 'leaderboard' : 'summary' }); return this.load(); },
  onShow() { if (this._request && this._identity !== model.scope(this)) return this.load(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const session = this.session.get();
    const params = { period: this.data.period };
    this._identity = model.scope(this);
    this.setData({ shopName: session && session.shop ? session.shop.name : '当前授权范围' });
    return model.remote(this, async () => {
      let sales = null;
      let leaderboard = null;
      let salesError = '';
      let leaderboardError = '';
      try { sales = await this.api.sales(params); } catch (error) { salesError = error.message || '营业数据暂不可用'; }
      try { leaderboard = await this.api.leaderboard(params); } catch (error) { leaderboardError = error.message || '榜单暂不可用'; }
      return { sales, leaderboard, salesError, leaderboardError };
    }, (response) => {
      const data = response.sales || {};
      const leaderboard = response.leaderboard || {};
      const entries = Array.isArray(leaderboard.items) ? leaderboard.items : [];
      this.setData({
        metrics: [
          { label: data.source_label || '付款毛额（未扣退款）', value: model.value(data.revenue, true) },
          { label: '成交订单', value: model.value(data.order_count, false) },
          { label: '退款金额', value: model.value(data.refund_amount, true) },
          { label: '客单价', value: model.value(data.average_order_value, true) }
        ],
        items: entries.map((item) => ({ id: String(item.id || item.employee_id || item.shop_id || item.name), name: item.name || item.employee_name || item.shop_name || '未提供姓名', rank: Number.isInteger(item.rank) ? String(item.rank) : '—', value: model.value(item.revenue, true) })),
        freshness: model.freshness(data), leaderboardFreshness: model.freshness(leaderboard), salesError: response.salesError, leaderboardError: response.leaderboardError,
        salesNotice: data.complete === false ? data.message || '当前数据不完整，请以 ERP 完整记录为准。' : '',
        leaderboardNotice: leaderboard.complete === false ? leaderboard.message || '榜单归属数据尚未齐备，暂不生成排名。' : ''
      });
    }, { metrics: [], items: [], freshness: '', leaderboardFreshness: '', salesError: '', leaderboardError: '', salesNotice: '', leaderboardNotice: '' });
  },
  onPeriod(event) { this.setData({ period: event.currentTarget.dataset.period }); return this.load(); },
  onKind(event) { this.setData({ kind: event.currentTarget.dataset.kind }); },
  retry() { return this.load(); }
}));
