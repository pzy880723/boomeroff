const { definePage } = require('../../shared/page');
const { scopeKey } = require('../marketing/model');
const { formatTime } = require('../list/model');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const platformNames = { douyin: '抖音', xhs: '小红书', xiaohongshu: '小红书', wechat_video: '视频号', kuaishou: '快手', bilibili: '哔哩哔哩', tiktok: 'TikTok', dianping: '大众点评' };
const text = value => typeof value === 'string' ? value : '';
const platformName = value => Object.prototype.hasOwnProperty.call(platformNames, value) ? platformNames[value] : text(value) || '平台未提供';
const empty = () => ({ items: [], listLoaded: false, listLoading: false, listError: '', selectedId: '', job: null, targets: [], detailLoading: false, detailError: '', error: '' });
function jobView(row) {
  if (!row || typeof row.id !== 'string' || !UUID.test(row.id)) throw new Error('invalid_response');
  return { id: row.id, title: text(row.title) || '无标题任务', kind: text(row.kind),
    kindLabel: row.kind === 'video' ? '视频' : row.kind === 'image_text' ? '图文' : '未知类型',
    status: text(row.status), statusLabel: text(row.statusLabel) || '未知状态（' + (text(row.status) || '未提供') + '）',
    platforms: Array.isArray(row.platforms) ? row.platforms.map(platformName) : [],
    createdAt: formatTime(row.createdAt) || '时间未提供', scheduleAt: formatTime(row.scheduleAt) || '' };
}

Page(definePage({
  data: Object.assign({ shopName: '' }, empty()),
  onLoad() {
    this._visible = true; this._epoch = 0; this._scope = scopeKey(this.session); this._rows = [];
    return this.refresh();
  },
  onShow() {
    const scope = scopeKey(this.session), changed = scope !== this._scope;
    if (this._visible && !changed) return this._listFlight && this._listFlight.promise;
    if (changed) { this._epoch++; this._resumeId = ''; this.clearPrivate(); }
    this._visible = true; this._scope = scope;
    const id = this._resumeId; this._resumeId = '';
    const list = this.refresh();
    if (!id) return list;
    this._selectedId = id; this.setData({ selectedId: id });
    return Promise.all([list, this.refreshDetail()]);
  },
  onHide() {
    if (this._visible) this._resumeId = this._selectedId || '';
    this._visible = false; this._epoch++; this.clearPrivate();
  },
  onUnload() { this.onHide(); this._resumeId = ''; },
  onPullDownRefresh() { return Promise.resolve(this.refresh()).finally(() => wx.stopPullDownRefresh()); },
  clearPrivate() {
    this._rows = []; this._loadedScope = ''; this._selectedId = ''; this._listFlight = null; this._detailFlight = null;
    const value = Object.assign({ shopName: '' }, empty());
    if (this._gone) Object.assign(this.data, value); else this.setData(value);
  },
  context() {
    const user = this.session.get();
    if (!user || !user.userId || !user.shop || !user.shop.id) return null;
    return { scope: scopeKey(this.session), shopId: user.shop.id, epoch: this._epoch };
  },
  current(context) {
    return !!context && !this._gone && this._visible && context.epoch === this._epoch && context.scope === scopeKey(this.session);
  },
  async readFailure(error, field) {
    if (error.status === 401) {
      this.onHide(); this._resumeId = '';
      return this.run(async () => { throw error; }, { silent: true });
    }
    this.setData({ [field]: error.status === 403 ? '当前账号无权读取该门店发布记录，请重新核对授权。'
      : error.status === 404 ? '任务不存在或当前不可读取，请刷新列表核对。' : '发布记录暂未读取成功，请手动重试。' });
  },
  refresh() {
    if (this._gone || !this._visible) return;
    const context = this.context();
    if (!context) { this.clearPrivate(); this.setData({ listError: '请先登录并选择当前授权门店。' }); return; }
    if (context.scope !== this._scope) { this._epoch++; this._resumeId = ''; this.clearPrivate(); this._scope = context.scope; return this.refresh(); }
    if (this._listFlight) return this._listFlight.promise;
    const token = this._listFlight = {};
    const current = () => this.current(context) && this._listFlight === token;
    this.setData({ listLoading: true, listError: '', shopName: this.session.get().shop.name || '当前授权门店' });
    token.promise = (async () => {
      try {
        const data = await this.api.publishHistory();
        if (!current()) return;
        if (!data || data.shopId !== context.shopId || data.limit !== 50 || !Array.isArray(data.items) || data.items.length > 50) throw new Error('invalid_response');
        const items = data.items.map(jobView);
        if (new Set(items.map(row => row.id)).size !== items.length) throw new Error('invalid_response');
        this._rows = items; this._loadedScope = context.scope;
        this.setData({ items, listLoaded: true });
      } catch (error) {
        if (current()) await this.readFailure(error, 'listError');
      } finally {
        if (current()) { this._listFlight = null; this.setData({ listLoading: false }); }
      }
    })();
    return token.promise;
  },
  selectJob(event) {
    const id = event.currentTarget.dataset.id, context = this.context();
    if (!this.current(context) || this._loadedScope !== context.scope || !this._rows.some(row => row.id === id)) return;
    if (this._selectedId === id && this._detailFlight) return this._detailFlight.promise;
    this._selectedId = id; this.setData({ selectedId: id });
    if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    return this.refreshDetail();
  },
  refreshDetail() {
    const context = this.context(), id = this._selectedId;
    if (!this.current(context) || context.scope !== this._scope || !id || !UUID.test(id)) return;
    if (this._detailFlight && this._detailFlight.id === id) return this._detailFlight.promise;
    const token = this._detailFlight = { id };
    const current = () => this.current(context) && this._detailFlight === token && this._selectedId === id;
    this.setData({ detailLoading: true, detailError: '', job: null, targets: [] });
    token.promise = (async () => {
      try {
        const data = await this.api.publishStatus(id);
        if (!current()) return;
        if (!data || data.shopId !== context.shopId || !data.job || data.job.id !== id || !Array.isArray(data.targets)) throw new Error('invalid_response');
        const job = jobView(data.job);
        const targets = data.targets.map(target => ({ id: target.id, status: text(target.status), statusLabel: text(target.statusLabel) || '未知状态（' + (text(target.status) || '未提供') + '）',
          progress: typeof target.progress === 'number' && Number.isFinite(target.progress) ? target.progress : null,
          error: text(target.error), platform: platformName(target.platform), name: text(target.name) || '账号名称未提供', postUrl: text(target.postUrl) }));
        this.setData({ job, targets });
      } catch (error) {
        if (current()) await this.readFailure(error, 'detailError');
      } finally {
        if (current()) { this._detailFlight = null; this.setData({ detailLoading: false }); }
      }
    })();
    return token.promise;
  },
  closeDetail() {
    if (this._gone || !this._visible) return;
    this._selectedId = ''; this._resumeId = ''; this._detailFlight = null;
    this.setData({ selectedId: '', job: null, targets: [], detailLoading: false, detailError: '' });
  },
}));
