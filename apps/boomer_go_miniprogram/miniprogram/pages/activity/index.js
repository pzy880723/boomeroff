const { definePage } = require('../../shared/page');
const { scope } = require('../list/model');
const model = require('./model');

Page(definePage({
  data: { id: '', filter: 'all', ...model.empty() },
  onLoad(options) {
    this._visible = true; this._epoch = 0; this._requests = {}; this._loadedIds = new Set(); this._firstShow = true;
    this.setData({ id: typeof options.id === 'string' ? options.id : '' });
    this._initialLoad = this.refresh();
    return this._initialLoad;
  },
  onShow() {
    this._visible = true;
    const first = this._firstShow; this._firstShow = false;
    if (first && this._identity === scope(this) && this._activityId === this.data.id) return this._initialLoad;
    return this.refresh();
  },
  onHide() {
    this._visible = false; this._firstShow = false; this._epoch++; this._requests = {};
    this._manageIdentity = ''; this._basicReady = false; this._loadedIds = new Set(); this._listStarted = '';
    this.setData({ ...model.emptyApplications(), ...model.emptyCapabilities(), basicLoading: false });
  },
  onUnload() { this._visible = false; this._epoch++; this._requests = {}; this._loadedIds = new Set(); this._manageIdentity = ''; this._basicReady = false; },
  ensureScope() {
    if (this._gone || !this._visible) return false;
    const identity = scope(this);
    if (this._identity !== identity || this._activityId !== this.data.id) {
      this._identity = identity; this._activityId = this.data.id; this._epoch++; this._requests = {};
      this._manageIdentity = ''; this._basicReady = false; this._loadedIds = new Set(); this._listStarted = '';
      this.setData({ ...model.empty(), filter: 'all', error: '' });
    }
    const value = this.session.get();
    if (!value || !value.userId || !value.shop || !value.shop.id || !model.uuid(this.data.id)) {
      this.setData({ basicError: !model.uuid(this.data.id) ? '缺少有效活动标识，请从活动列表重新进入。' : '请先登录并选择当前授权工作门店。' });
      return false;
    }
    return true;
  },
  begin(channel) {
    if (!this.ensureScope()) return null;
    const context = { channel, identity: scope(this), epoch: this._epoch, id: this.data.id, shopId: this.session.get().shop.id, filter: this.data.filter };
    this._requests[channel] = context;
    return context;
  },
  current(context) {
    return !!context && !this._gone && this._visible && this._epoch === context.epoch && scope(this) === context.identity && this.data.id === context.id
      && this._requests[context.channel] === context && (context.channel !== 'applications' || this.data.filter === context.filter);
  },
  clearApplications() {
    this._requests.applications = null; this._loadedIds = new Set();
    this.setData(model.emptyApplications());
  },
  reject(error, context, field) {
    if (!this.current(context) || error.code === 'stale_operation') return;
    if (error.status === 401) {
      this._epoch++; this._requests = {}; this._manageIdentity = ''; this._basicReady = false; this._loadedIds = new Set();
      this.setData(model.empty());
      throw error;
    }
    if ((error.status === 403 || error.status === 404) && context.channel !== 'capabilities') {
      this.clearApplications(); this._manageIdentity = '';
      this.setData({ ...model.emptyCapabilities(), capabilitiesError: '当前活动或申请不可访问，请重新核对权限。' });
      if (context.channel === 'basic') { this._basicReady = false; this.setData({ activity: null }); }
    }
    this.setData({ [field]: error.message || '读取失败，请重试。' });
  },
  refresh() {
    if (!this.ensureScope()) return Promise.resolve();
    this._epoch++; this._requests = {}; this._manageIdentity = ''; this._basicReady = false; this._loadedIds = new Set(); this._listStarted = '';
    this.setData({ ...model.empty(), error: '' });
    return Promise.all([this.loadBasic(), this.loadCapabilities()]);
  },
  retry() { return this.refresh(); },
  onPullDownRefresh() { return Promise.resolve(this.refresh()).finally(() => wx.stopPullDownRefresh()); },
  retryBasic() { return this.loadBasic(); },
  loadBasic() {
    const context = this.begin('basic');
    if (!context) return Promise.resolve();
    this._basicReady = false; this._listStarted = ''; this.clearApplications();
    this.setData({ activity: null, basicLoading: true, basicError: '' });
    return this.run(async () => {
      try {
        const response = await this.api.action('activity-detail', { id: context.id, shop_id: context.shopId });
        if (!this.current(context)) return;
        const activity = model.basic(response, context);
        this._basicReady = true; this.setData({ activity, basicLoading: false });
        await this.maybeLoadApplications();
      } catch (error) { this.reject(error, context, 'basicError'); }
      finally { if (this.current(context)) this.setData({ basicLoading: false }); }
    }, { silent: true });
  },
  retryCapabilities() { return this.loadCapabilities(); },
  loadCapabilities() {
    const context = this.begin('capabilities');
    if (!context) return Promise.resolve();
    this._manageIdentity = ''; this._listStarted = ''; this.clearApplications();
    this.setData({ ...model.emptyCapabilities(), capabilitiesLoading: true });
    return this.run(async () => {
      try {
        const response = await this.api.action('activity-capabilities', { shop_id: context.shopId });
        if (!this.current(context)) return;
        const capabilities = model.capabilities(response, context.shopId);
        this._manageIdentity = capabilities.canManage ? context.identity : '';
        this.setData({ ...capabilities, capabilitiesLoaded: true, capabilitiesLoading: false });
        await this.maybeLoadApplications();
      } catch (error) { this.reject(error, context, 'capabilitiesError'); }
      finally { if (this.current(context)) this.setData({ capabilitiesLoading: false }); }
    }, { silent: true });
  },
  maybeLoadApplications() {
    if (!this._basicReady || this._manageIdentity !== scope(this)) return;
    const key = this._epoch + ':' + this.data.filter;
    if (this._listStarted === key) return;
    this._listStarted = key;
    return this.loadApplications(false);
  },
  retryApplications() { return this.loadApplications(this.data.applicationsLoaded && this.data.hasMore); },
  loadMoreApplications() { if (!this.data.hasMore) return Promise.resolve(); return this.loadApplications(true); },
  loadApplications(append) {
    if (!this.ensureScope() || !this._basicReady || this._manageIdentity !== scope(this) || this.data.applicationsLoading || (append && !this.data.hasMore)) return Promise.resolve();
    const cursor = append ? this.data.nextCursor : null;
    if (!append) this.clearApplications();
    const context = this.begin('applications');
    this.setData({ applicationsLoading: true, applicationsError: '' });
    return this.run(async () => {
      try {
        const params = { shop_id: context.shopId, activity_id: context.id, limit: 20 };
        const confirmed = model.filterValue(context.filter);
        if (confirmed !== null) params.publish_confirmed = confirmed;
        if (cursor) params.cursor = cursor;
        const response = await this.api.action('activity-applications', params);
        if (!this.current(context)) return;
        const page = model.page(response, context, cursor);
        const applications = model.merge(append ? this.data.applications : [], page.items);
        this._loadedIds = new Set(applications.map(row => row.id));
        this.setData({ applications, applicationsLoaded: true, nextCursor: page.nextCursor, hasMore: page.hasMore });
      } catch (error) { this.reject(error, context, 'applicationsError'); }
      finally { if (this.current(context)) this.setData({ applicationsLoading: false }); }
    }, { silent: true });
  },
  onFilterChange(event) {
    if (!this.ensureScope() || !this._basicReady || this._manageIdentity !== scope(this)) return Promise.resolve();
    const filter = event.currentTarget.dataset.filter;
    if (!['all', 'unconfirmed', 'confirmed'].includes(filter) || filter === this.data.filter) return Promise.resolve();
    this.clearApplications(); this._listStarted = '';
    this.setData({ filter });
    return this.maybeLoadApplications();
  },
  openApplication(event) {
    if (!this.ensureScope() || !this._basicReady || this._manageIdentity !== scope(this)) return;
    const id = event.currentTarget.dataset.id;
    if (!model.uuid(id) || !this._loadedIds.has(id)) return;
    this.navigate('/pages/application/index?id=' + encodeURIComponent(id) + '&activityId=' + encodeURIComponent(this.data.id));
  }
}));
