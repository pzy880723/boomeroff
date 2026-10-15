const TABS = ['workbench', 'learn', 'recognize', 'messages', 'mine'].map(x => '/pages/' + x + '/index');
function navigate(url) {
  if (typeof url !== 'string' || !/^\/pages\/[a-z-]+\/index(?:\?|$)/.test(url)) return;
  if (TABS.includes(url.split('?')[0])) wx.switchTab({ url: url.split('?')[0] }); else wx.navigateTo({ url });
}
function definePage(spec) {
  const load = spec.onLoad, show = spec.onShow, unload = spec.onUnload;
  return Object.assign({ data: {}, retry() { if (this.refresh) return this.refresh(); if (this.load) return this.load(); }, navigate,
    go(event) { navigate(event.currentTarget.dataset.url); },
    copy(event) { return this.api.copy(event.currentTarget.dataset.text || ''); },
    async run(task, options = {}) {
      if (this._gone) return;
      const revision = this.session && this.session.revision ? this.session.revision() : null;
      const current = () => !this._gone && (!this.session || !this.session.revision || this.session.revision() === revision);
      const loadingRun = options.silent ? null : (this._loadingRun || 0) + 1;
      if (!options.silent) this._loadingRun = loadingRun;
      if (!options.silent) this.setData({ loading: true, error: '' });
      try { return await task(); } catch (error) {
        if (!current() || error.code === 'stale_operation') return null;
        if (error.status === 401 && this.session && (error.requestRevision == null || error.requestRevision === revision)) { this.session.signOut(); wx.reLaunch({ url: '/pages/login/index' }); }
        if (current()) this.setData({ error: error.message || '加载失败，请重试' }); return null;
      }
      finally { if (!this._gone && !options.silent && this._loadingRun === loadingRun) this.setData({ loading: false }); }
    }
  }, spec, {
    data: Object.assign({ loading: false, error: '', preview: false }, spec.data || {}),
    onLoad(query) {
      const app = getApp();
      if (query && query.preview === '1') app.enablePreview();
      this._gone = false; this.api = app.api; this.session = app.session; this.preview = app.preview;
      this.setData({ preview: app.preview });
      if (load) return load.call(this, query || {});
    },
    onShow() {
      const app = getApp();
      this.api = app.api; this.session = app.session; this.preview = app.preview;
      this.setData({ preview: app.preview });
      if (this.getTabBar) { const bar = this.getTabBar(); if (bar) bar.sync(); }
      if (!spec.skipAuth && !app.preview && !app.session.get()) {
        app.ensureSession().then(ok => { if (ok && !this._gone && show) show.call(this); }).catch(() => {});
        return;
      }
      if (show) return show.call(this);
    },
    onUnload() { this._gone = true; if (unload) unload.call(this); }
  });
}
module.exports = { definePage, navigate, TABS };
