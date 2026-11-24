Page({
  data: { buildVersion: '0.2.0', mode: 'password', passwordVisible: false, account: '', proof: '',
    busy: '', error: '', status: '', seconds: 0 },
  onShow() {
    const ops = getApp().operations;
    if (ops.current()) wx.reLaunch({ url: '/pages/workbench/index' });
    this._visible = true;
    this.tick();
  },
  onHide() { this.clear(); },
  onUnload() { this.clear(); },
  clear() {
    this._visible = false;
    clearTimeout(this._timer);
    this.setData({ proof: '', passwordVisible: false });
  },
  tick() {
    clearTimeout(this._timer);
    if (!this._visible) return;
    const seconds = Math.max(0, Math.ceil(((this._until || 0) - Date.now()) / 1000));
    this.setData({ seconds });
    if (seconds) this._timer = setTimeout(() => this.tick(), 1000);
  },
  changeMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (this.data.busy || mode === this.data.mode || !['password', 'otp'].includes(mode)) return;
    const current = this.data.account.trim();
    this.setData({ mode, account: mode === 'password' || /^1[3-9]\d{9}$/.test(current) ? current : '',
      proof: '', passwordVisible: false, error: '', status: '' });
  },
  togglePassword() {
    if (this.data.mode === 'password' && !this.data.busy) {
      this.setData({ passwordVisible: !this.data.passwordVisible });
    }
  },
  account(event) { this.setData({ account: event.detail.value }); },
  proof(event) { this.setData({ proof: event.detail.value }); },
  async send() {
    if (this.data.busy || this.data.seconds || this.data.mode !== 'otp') return;
    this.setData({ busy: 'send', error: '', status: '' });
    try {
      const result = await getApp().operations.sendCode(this.data.account.trim());
      this._until = Date.now() + result.cooldownSeconds * 1000;
      this.tick();
      if (this._visible) this.setData({ status: '验证码已发送，请查看短信' });
    } catch (error) {
      if (error.uncertain) { this._until = Date.now() + 60000; this.tick(); }
      if (this._visible) this.setData({ error: error.message });
    } finally { this.setData({ busy: '' }); }
  },
  async submit() {
    if (this.data.busy) return;
    const { mode, account, proof } = this.data;
    this.setData({ busy: 'login', error: '', status: '', proof: '', passwordVisible: false });
    try {
      await getApp().operations.signIn(mode, account.trim(), proof);
      if (this._visible) wx.reLaunch({ url: '/pages/workbench/index' });
    } catch (error) {
      if (this._visible) this.setData({ error: error.message });
    } finally { this.setData({ busy: '' }); }
  }
});
