const { definePage } = require('../../shared/page');
function revision(session) { return session && session.revision ? session.revision() : null; }
Page(definePage({
  skipAuth: true,
  data: { mode: 'otp', phone: '', code: '', account: '', password: '', sending: false, submitting: false, seconds: 0, message: '', retryRestore: false, canPreview: false },
  onLoad() {
    this._visible = true; this._epoch = 0; this._session = this.session; this._revision = revision(this.session);
    const info = wx.getAccountInfoSync(); this.setData({ canPreview: info.miniProgram.envVersion === 'develop', retryRestore: this.hasCredentials() });
  },
  onShow() {
    if (this._gone) return;
    this._visible = true; this.syncIdentity();
    this.setData({ retryRestore: this.hasCredentials(), sending: !!(this._flight && this._flight.kind === 'send'), submitting: !!(this._flight && this._flight.kind !== 'send') }); this.countdown();
  },
  onHide() { this._visible = false; this._epoch++; clearInterval(this._timer); this.clearSecrets(); this.setData({ error: '', message: '' }); },
  onUnload() { this._visible = false; this._epoch++; clearInterval(this._timer); this.clearSecrets(); },
  hasCredentials() { return !!(this.session.hasCredentials && this.session.hasCredentials()); },
  clearSecrets() { if (this._gone) { this.data.password = ''; this.data.code = ''; } else this.setData({ password: '', code: '' }); },
  syncIdentity() {
    if (this._session === this.session && this._revision === revision(this.session)) return false;
    this._session = this.session; this._revision = revision(this.session); this._epoch++; this._until = 0;
    this.clearSecrets(); if (!this._gone) this.setData({ error: '', message: '', seconds: 0 }); return true;
  },
  available() { return !this._gone && this._visible && !this.syncIdentity() && !this._flight; },
  authenticatingAllowed() { return this.available() && !this.preview && !this.data.preview && !getApp().preview; },
  active(context) { return !this._gone && this._visible && this._flight === context && context.epoch === this._epoch && context.session === this.session && context.revision === revision(this.session); },
  begin(kind) {
    const context = { kind, epoch: this._epoch, session: this.session, revision: revision(this.session) };
    this._flight = context; this.setData({ sending: kind === 'send', submitting: kind !== 'send', error: '', message: '' }); return context;
  },
  finish(context) {
    if (this._flight !== context) return;
    this._flight = null; if (context.kind !== 'send') this.clearSecrets();
    if (!this._gone && this._visible) { this.syncIdentity(); this.setData({ sending: false, submitting: false, retryRestore: this.hasCredentials() }); this.countdown(); }
  },
  switchMode(event) {
    if (!this.available()) return;
    const mode = event.currentTarget.dataset.mode;
    if (!['otp', 'password'].includes(mode) || mode === this.data.mode) return;
    this._epoch++; this.clearSecrets(); this.setData({ mode, error: '', message: '' }); this.countdown();
  },
  phoneInput(e) { if (this.available() && this.data.mode === 'otp') this.setData({ phone: e.detail.value.replace(/\D/g, '').slice(0, 11) }); },
  codeInput(e) { if (this.available() && this.data.mode === 'otp') this.setData({ code: e.detail.value.replace(/\D/g, '').slice(0, 6) }); },
  accountInput(e) { if (this.available() && this.data.mode === 'password') this.setData({ account: e.detail.value }); },
  passwordInput(e) { if (this.available() && this.data.mode === 'password') this.setData({ password: e.detail.value }); },
  countdown() {
    clearInterval(this._timer); if (this._gone || !this._visible) return;
    const update = () => { const seconds = Math.max(0, Math.ceil(((this._until || 0) - Date.now()) / 1000)); this.setData({ seconds }); if (!seconds) clearInterval(this._timer); return seconds; };
    if (update() && this.data.mode === 'otp') this._timer = setInterval(update, 1000);
  },
  async send() {
    if (!this.authenticatingAllowed() || this.data.mode !== 'otp' || this.data.seconds > 0) return;
    if (!/^1[3-9]\d{9}$/.test(this.data.phone)) { this.setData({ error: '请输入正确的 11 位手机号' }); return; }
    const context = this.begin('send');
    try {
      const seconds = await this.session.sendCode(this.data.phone);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('短信发送尚未确认，请稍后重试');
      if (!this._gone && context.session === this.session && context.revision === revision(this.session)) this._until = Date.now() + seconds * 1000;
      if (this.active(context)) this.setData({ message: '验证码已发送，请留意手机短信' });
    } catch (error) { if (this.active(context)) this.setData({ error: error.message || '短信发送失败，请稍后重试' }); }
    finally { this.finish(context); }
  },
  async submit() {
    if (!this.authenticatingAllowed()) return;
    const passwordMode = this.data.mode === 'password';
    if (passwordMode) {
      const account = this.data.account.trim();
      if (account.length > 255 || !/^(?:[a-zA-Z0-9_]{3,32}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(account)) { this.setData({ error: '请输入有效的手机号、用户名或邮箱' }); return; }
      if (this.data.password.length < 6 || this.data.password.length > 72) { this.setData({ error: '密码需为 6 至 72 位，请勿删改原有空格或大小写' }); return; }
    } else if (!/^1[3-9]\d{9}$/.test(this.data.phone) || !/^\d{6}$/.test(this.data.code)) { this.setData({ error: '请输入正确的手机号和 6 位验证码' }); return; }
    const context = this.begin('login');
    try {
      const work = passwordMode ? this.session.signInWithPassword(this.data.account, this.data.password) : this.session.signInWithCode(this.data.phone, this.data.code);
      context.revision = this._revision = revision(this.session);
      const result = await work;
      if (!this.active(context)) return;
      if (!result || !result.userId) throw new Error('员工权限尚未确认，请重试连接或重新登录');
      wx.reLaunch({ url: '/pages/workbench/index' });
    } catch (error) { if (this.active(context)) this.setData({ error: error.message || '登录未完成，请稍后重试', retryRestore: !!error.retryRestore || this.hasCredentials() }); }
    finally { this.finish(context); }
  },
  async restore() {
    if (!this.authenticatingAllowed()) return;
    const context = this.begin('restore');
    try {
      const work = this.session.restore(); context.revision = this._revision = revision(this.session);
      const result = await work;
      if (!this.active(context)) return;
      if (!result || !result.userId) throw new Error('当前没有已验证的员工工作会话，请重试连接或重新登录');
      wx.reLaunch({ url: '/pages/workbench/index' });
    } catch (error) { if (this.active(context)) this.setData({ error: error.message || '连接未完成，请稍后重试' }); }
    finally { this.finish(context); }
  },
  forgotPassword() { if (this.available() && this.data.mode === 'password') wx.showModal({ title: '忘记密码', content: '请联系门店管理员为你重置密码。此入口不发送短信或邮件，也不会修改账号或门店权限。', showCancel: false, confirmText: '知道了', confirmColor: '#EB0029' }); },
  enterPreview() {
    if (!this.available() || !this.data.canPreview) return;
    if (getApp().enablePreview()) { this._epoch++; this.clearSecrets(); clearInterval(this._timer); wx.reLaunch({ url: '/pages/workbench/index' }); }
  }
}));
