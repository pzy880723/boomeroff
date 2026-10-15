const config = require('./config');
const { createSession } = require('./shared/session');
const { createTransport } = require('./shared/transport');
const { createApi } = require('./shared/api');
App({
  preview: false,
  onLaunch(options) {
    this.config = Object.assign({}, config);
    this.configure();
    if ((options && options.query && options.query.preview === '1') || wx.getStorageSync('go-mini.preview-opt-in') === true) this.enablePreview();
  },
  configure() {
    const invoke = createTransport(wx, this.config, () => this.session && this.session.token());
    this.session = createSession({ wx, request: invoke, onClear: () => { this._restore = null; } });
    this.session.require = async () => { if (await this.ensureSession()) return this.session.get(); throw new Error('请先登录员工账号'); };
    this.api = createApi({ wx, config: this.config, session: this.session, invoke });
  },
  enablePreview() {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    if (!info || !info.miniProgram || info.miniProgram.envVersion !== 'develop') return false;
    const { createPreview } = require('./shared/preview');
    const adapter = createPreview(wx);
    this.preview = true; this.api = adapter.api; this.session = adapter.session;
    wx.setStorageSync('go-mini.preview-opt-in', true);
    return true;
  },
  leavePreview() { wx.removeStorageSync('go-mini.preview-opt-in'); this.preview = false; this.configure(); },
  async ensureSession() {
    if (this.preview || this.session.get()) return true;
    const revision = this.session.revision ? this.session.revision() : null;
    if (!this._restore) {
      const pending = this.session.restore().finally(() => { if (this._restore === pending) this._restore = null; });
      this._restore = pending;
    }
    try { if (await this._restore) return true; } catch (_) {}
    if (this.session.get()) return true;
    if (this.session.revision && this.session.revision() !== revision) return false;
    if (!this._openingLogin) {
      this._openingLogin = true;
      wx.reLaunch({ url: '/pages/login/index', complete: () => { this._openingLogin = false; } });
    }
    return false;
  }
});
