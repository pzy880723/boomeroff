const { definePage } = require('../../shared/page');
Page(definePage({
  skipAuth: true,
  data: { phone: '', code: '', sending: false, submitting: false, seconds: 0, message: '', retryRestore: false, canPreview: false },
  onLoad() { const info = wx.getAccountInfoSync(); this.setData({ canPreview: info.miniProgram.envVersion === 'develop', retryRestore: this.session.hasCredentials && this.session.hasCredentials() }); },
  onShow() {},
  phoneInput(e) { this.setData({ phone: e.detail.value.replace(/\D/g, '').slice(0, 11) }); },
  codeInput(e) { this.setData({ code: e.detail.value.replace(/\D/g, '').slice(0, 6) }); },
  async send() {
    if (this.data.sending || this.data.submitting || this.data.seconds > 0) return;
    this.setData({ sending: true, error: '', message: '' });
    try {
      const seconds = await this.session.sendCode(this.data.phone);
      if (this._gone) return;
      this.setData({ seconds, message: '验证码已发送，请留意手机短信' });
      clearInterval(this._timer);
      const until = Date.now() + seconds * 1000;
      this._timer = setInterval(() => { if (!this._gone) this.setData({ seconds: Math.max(0, Math.ceil((until - Date.now()) / 1000)) }); if (Date.now() >= until) clearInterval(this._timer); }, 1000);
    } catch (error) { if (!this._gone) this.setData({ error: error.message }); }
    finally { if (!this._gone) this.setData({ sending: false }); }
  },
  async submit() {
    if (this.data.submitting || this.data.sending) return;
    this.setData({ submitting: true, error: '' });
    try { await this.session.signInWithCode(this.data.phone, this.data.code); if (!this._gone) wx.reLaunch({ url: '/pages/workbench/index' }); }
    catch (error) { if (!this._gone) this.setData({ error: error.message, retryRestore: !!error.retryRestore || this.session.hasCredentials() }); }
    finally { if (!this._gone) this.setData({ submitting: false }); }
  },
  async restore() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: '' });
    try { const result = await this.session.restore(); if (!result) throw new Error('当前没有可恢复的员工登录，请获取验证码'); if (!this._gone) wx.reLaunch({ url: '/pages/workbench/index' }); }
    catch (error) { if (!this._gone) this.setData({ error: error.message }); }
    finally { if (!this._gone) this.setData({ submitting: false }); }
  },
  enterPreview() { if (getApp().enablePreview()) wx.reLaunch({ url: '/pages/workbench/index' }); },
  onUnload() { clearInterval(this._timer); }
}));
