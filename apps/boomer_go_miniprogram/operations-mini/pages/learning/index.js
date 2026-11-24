const { tabs } = require('../../shared/learning');
const categories = [
  ['全部','grid'], ['日瓷','tea'], ['欧瓷','tea'], ['线香','flame'], ['古美术','layers'],
  ['本地特色','pin'], ['动漫玩具','bag'], ['二次元周边','star'], ['奢侈品','gem'], ['中古首饰','gem'],
  ['游戏机','game'], ['黑胶唱片','layers'], ['文具','bag'], ['漆器','layers'], ['其他','grid']
].map(([name, icon]) => ({ name, icon }));
const sorts = [{ id:'latest', label:'最新更新' }, { id:'hot',label:'最热' }, { id:'importance',label:'重要程度' }];
const recordFilters=[{id:'all',label:'全部'},{id:'training',label:'培训'},{id:'quiz',label:'测试'}];
const app = () => getApp().operations;
const shortDate = value => new Date((Number(value) + 8 * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ');

Page({
  data: { tabs, sorts, recordFilters, recordKind:'all', tab:'knowledge', title:'知识', categories:categories.slice(0,11), category:'全部',
    query:'', sort:'latest', grid:true, items:[], page:1, hasMore:false, loading:true, error:'', libraryReady:false,
    canGenerateCards:false, expanded:false, plannedNotice:'', safeTop:30 },
  onLoad() {
    const capsule=wx.getMenuButtonBoundingClientRect?.();
    const fallback=wx.getWindowInfo?.()?.statusBarHeight||30;
    this.setData({safeTop:capsule?.top>0?Math.max(fallback,capsule.top-6):fallback});
  },
  onShow() {
    const scope = app().current();
    if (!scope) return wx.reLaunch({ url:'/pages/login/index' });
    this.getTabBar?.()?.sync?.();
    this.setData({ canGenerateCards:scope.canGenerateCards === true });
    return this.refresh();
  },
  onHide() { this._load = null; },
  onUnload() { this._load = null; },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()); },
  async load(page) {
    const ticket = {};
    this._load = ticket;
    const d = this.data;
    this.setData({ loading:true,error:'' });
    try {
      const data = await app().learning.list(d.tab, { page, q:d.tab==='knowledge'?d.query.trim():'',
        category:d.tab==='knowledge'&&d.category!=='全部'?d.category:'', sort:d.sort,recordKind:d.tab==='records'?d.recordKind:'all' });
      if (this._load !== ticket) return;
      if (!Array.isArray(data.items)) throw new Error('学习列表暂不可读');
      const rows = data.items.map(row => ({ ...row, meta:d.tab==='records'
        ? ((row.record_kind==='training'?'已完成培训':row.score+' / '+row.total) + ' · ' + (Number.isFinite(row.submitted)?shortDate(row.submitted):''))
        : row.brand || row.origin || '' }));
      const libraryReady=data.library_ready===true||data.legacy_ready===true;
      this.setData({ items:page===1?rows:d.items.concat(rows), page, hasMore:data.has_more === true, libraryReady,
        plannedNotice:!libraryReady && rows.length ? '仅显示已接入的内容。' : '' });
    } catch (e) {
      if (this._load !== ticket) return;
      if (!app().current()) return wx.reLaunch({ url:'/pages/login/index' });
      this.setData({ error:e.message });
    } finally { if (this._load===ticket) this.setData({ loading:false }); }
  },
  refresh() { return this.load(1); },
  reset() { this.setData({ items:[], hasMore:false, page:1, plannedNotice:'' }); return this.refresh(); },
  more() { if (!this.data.loading && this.data.hasMore) return this.load(this.data.page + 1); },
  onReachBottom() { return this.more(); },
  chooseTab(event) {
    const item = tabs.find(row => row.id===event.currentTarget.dataset.value);
    if (!item || item.id===this.data.tab) return;
    this.setData({ tab:item.id,title:item.label });
    return this.reset();
  },
  input(event) { this.setData({ query:event.detail.value }); },
  search() { return this.reset(); },
  chooseCategory(event) { this.setData({ category:event.currentTarget.dataset.value }); return this.reset(); },
  toggleCategories() {
    this.setData({ expanded:!this.data.expanded, categories:this.data.expanded?categories.slice(0,11):categories });
  },
  chooseSort(event) { this.setData({ sort:event.currentTarget.dataset.value }); return this.reset(); },
  chooseRecord(event) {
    const value=event.currentTarget.dataset.value;
    if(recordFilters.some(f=>f.id===value)) { this.setData({recordKind:value}); return this.reset(); }
  },
  chooseView(event) { this.setData({ grid:String(event.currentTarget.dataset.grid)==='1' }); },
  open(event) {
    const { id,entry } = event.currentTarget.dataset;
    wx.navigateTo({ url:'/pages/learning-detail/index?id='+encodeURIComponent(entry||id) });
  },
  newCard() {
    if (app().current()?.canGenerateCards) wx.navigateTo({ url:'/pages/learning-card/index' });
  },
  async favorite(event) {
    if (this._favorite) return;
    const item = this.data.items.find(row => row.id===event.currentTarget.dataset.id);
    if (!item) return;
    this._favorite=true;
    try { await app().learning.favorite(item.id,!item.favorite); await this.refresh(); }
    catch (error) { wx.showToast({ title:error.message,icon:'none' }); }
    finally { this._favorite=false; }
  }
});
