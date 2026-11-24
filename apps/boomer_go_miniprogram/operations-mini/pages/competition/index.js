const { stores, money, dailyRows, matchups, reportStatuses, reportFields } = require('../../shared/competition');
const app = () => getApp().operations;
const tabs = [{ id:'board', name:'战况' }, { id:'history', name:'逐日战报' }, { id:'report', name:'本店填报' }];
const modes = [{ id:'natural_month', name:'自然月赛期' }, { id:'custom_dates', name:'自定义日期' }];
const cycleLabels = { not_started:'即将开始', ended:'本期已结束', waiting_for_reports:'待三店报齐', active:'赛期进行中' };
const showDate = value => value ? value.slice(5).replace('-', '.') : '';
const confirm = options => new Promise(resolve => wx.showModal({ ...options,
  success: result => resolve(result.confirm), fail: () => resolve(false) }));

Page({
  data: { tabs, modes, stores, tab:'board', loading:true, safeTop:30, amount:'', orders:'', reason:'',
    editingStore:0, date:'', rules:[], showRules:false, showCycle:false, submitting:false },
  onLoad() {
    const capsule = wx.getMenuButtonBoundingClientRect?.();
    const fallback = wx.getWindowInfo?.()?.statusBarHeight || 30;
    this.setData({ safeTop:capsule?.top > 0 ? Math.max(fallback, capsule.top - 6) : fallback });
  },
  onShow() {
    if (!app().current()) return wx.reLaunch({ url:'/pages/login/index' });
    this.getTabBar?.()?.sync?.();
    return this.refresh();
  },
  onHide() { this._flight = null; },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()); },
  async refresh() {
    const flight = {};
    this._flight = flight;
    this.setData({ loading:true, error:'', blocked:false });
    try {
      const state = await app().competition.state(this.data.date);
      if (this._flight !== flight) return;
      const admin = state.session.role === 'admin';
      const progress = reportStatuses(state.submission.stores);
      const selected = state.selected;
      const date = this.data.date || state.today;
      const cycle = state.cycle;
      this.setData({ state, admin, date, progress, reported:progress.filter(row => row.reported).length,
        tabs:tabs.map(tab => tab.id === 'report' && admin ? { ...tab, name:'管理填报' } : tab),
        shopName:stores.find(row => row.id === state.session.store)?.name || '',
        home:state.own ? { amount:money(state.own.salesCents), orders:state.own.orders } : null,
        board:matchups(state.latest), historicBoard:matchups(selected), daily:dailyRows(selected),
        period:showDate(cycle.startDate) + ' – ' + showDate(cycle.endDate),
        periodMode:cycle.mode === 'custom_dates' ? '自定义赛期' : '自然月赛期',
        periodStatus:cycleLabels[cycle.reportState] || '',
      });
      this.fillAdmin();
    } catch (error) {
      if (this._flight !== flight) return;
      if (!app().current()) return wx.reLaunch({ url:'/pages/login/index' });
      this.setData({ error:error.message, blocked:error.code === 'competition_outside_scope', state:null });
    } finally { if (this._flight === flight) this.setData({ loading:false }); }
  },
  switchSection(event) {
    this.setData({ tab:event.currentTarget.dataset.tab, receipt:'', actionError:'' });
  },
  openReport() { this.setData({ tab:'report', actionError:'' }); },
  setDate(event) {
    this.setData({ date:event.detail.value, receipt:'', actionError:'' });
    return this.refresh();
  },
  setStore(event) {
    this.setData({ editingStore:Number(event.detail.value), receipt:'', actionError:'' });
    this.fillAdmin();
  },
  fillAdmin() {
    if (!this.data.admin) return;
    const store = stores[this.data.editingStore].id;
    const record = this.data.state?.adminSelected?.stores?.[store] || null;
    this.setData({ record, amount:record ? (record.salesCents / 100).toFixed(2) : '',
      orders:record ? String(record.orders) : '', reason:'' });
  },
  setInput(event) {
    const key = event.currentTarget.dataset.key;
    if (['amount', 'orders', 'reason'].includes(key)) this.setData({ [key]:event.detail.value });
  },
  async submit() {
    const d = this.data;
    if (!d.state || d.loading || d.submitting || (!d.admin && d.home)) return;
    this.setData({ submitting:true, actionError:'', receipt:'' });
    try {
      const report = reportFields(d.admin ? d.date : d.state.today, d.amount, d.orders);
      const name = d.admin ? stores[d.editingStore].name : d.shopName;
      const reason = d.reason.trim();
      if (d.admin && reason.length < 2) throw new Error('请填写至少两个字的补报或更正原因');
      const title = d.admin && d.record ? '确认更正赛账' : '确认提交赛账';
      const ok = await confirm({ title, content:report.date + ' ' + name + '\n实收 ' +
        money(report.salesCents) + ' · ' + report.orders + ' 单' + (d.admin ? '\n原因：' + reason : '\n提交后不可自行修改') });
      if (!ok) return;
      const result = d.admin ? await app().competition.correct({ ...report, store:stores[d.editingStore].id,
        reason, expectedVersion:d.record?.version || null, confirmCorrection:!!d.record })
        : await app().competition.report(report);
      if (result.ok !== true) throw new Error('未收到填报回执，请刷新核对');
      this.setData({ receipt:report.date + ' · ' + name + ' 已提交 · ' + money(report.salesCents) + ' · ' + report.orders + ' 单',
        amount:'', orders:'', reason:'' });
      await this.refresh();
    } catch (error) { this.setData({ actionError:error.message }); }
    finally { this.setData({ submitting:false }); }
  },
  async openRules() {
    try {
      const result = await app().competition.rules();
      this.setData({ rules:result.rules, showRules:true });
    } catch (error) { wx.showToast({ title:error.message, icon:'none' }); }
  },
  closeRules() { this.setData({ showRules:false }); },
  async openCycle() {
    try {
      const result = await app().competition.cycle();
      this.setData({ showCycle:true, cycleError:'', cycleVersion:result.cycle.version,
        cycleMode:result.settings.mode === 'custom_dates' ? 1 : 0,
        startDate:result.settings.startDate || result.cycle.startDate, endDate:result.settings.endDate || result.cycle.endDate,
        recent:result.recentChanges.slice().reverse().map(row => ({ ...row,
          label:row.next.mode === 'custom_dates' ? row.next.startDate + ' 至 ' + row.next.endDate : '自然月赛期' })) });
    } catch (error) { wx.showToast({ title:error.message, icon:'none' }); }
  },
  closeCycle() { if (!this.data.submitting) this.setData({ showCycle:false }); },
  setMode(event) { this.setData({ cycleMode:Number(event.detail.value) }); },
  setCycleDate(event) {
    const key = event.currentTarget.dataset.key;
    if (key === 'startDate' || key === 'endDate') this.setData({ [key]:event.detail.value });
  },
  async saveCycle() {
    const d = this.data;
    if (d.submitting || !d.admin || !d.showCycle) return;
    if (d.cycleMode && d.startDate > d.endDate) return this.setData({ cycleError:'结束日期不能早于开始日期' });
    this.setData({ submitting:true, cycleError:'' });
    try {
      const ok = await confirm({ title:'确认切换赛期', content:(d.cycleMode ? d.startDate + ' 至 ' + d.endDate : '自然月赛期')
        + '\n仅重新计算累计战况，不修改历史实收或单量。' });
      if (!ok) return;
      await app().competition.setCycle({ mode:modes[d.cycleMode].id, startDate:d.cycleMode ? d.startDate : null,
        endDate:d.cycleMode ? d.endDate : null, expectedVersion:d.cycleVersion, confirmed:true });
      this.setData({ showCycle:false });
      await this.refresh();
    } catch (error) { this.setData({ cycleError:error.message }); }
    finally { this.setData({ submitting:false }); }
  }
});
