const { loginIdentity } = require('./login-identity');
const KEY = 'boomer-go-mini.session.v1';
function jwtPayload(token, wx) {
  const encoded = String(token).split('.')[1];
  if (!encoded) throw new Error('登录会话不完整，请重新登录');
  try {
    if (typeof Buffer !== 'undefined') return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const value = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = new Uint8Array(wx.base64ToArrayBuffer(value + '='.repeat((4 - value.length % 4) % 4)));
    return JSON.parse(decodeURIComponent(Array.from(bytes).map(b => '%' + ('0' + b.toString(16)).slice(-2)).join('')));
  } catch (_) { throw new Error('登录会话不完整，请重新登录'); }
}
function businessDate() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function createSession({ wx, request, onClear = () => {} }) {
  let credentials = wx.getStorageSync(KEY) || null;
  let current = null;
  let pending = null;
  let signingIn = null;
  let sending = null;
  let sendingPhone = '';
  let generation = 0;
  let revision = 0;
  let verifiedDate = '';
  let verifiedAt = 0;
  function persist(value) { credentials = value; wx.setStorageSync(KEY, value); }
  function validToken(value) {
    const payload = jwtPayload(value.access_token, wx);
    if (!payload.exp || payload.exp * 1000 <= Date.now() || payload.sub !== value.user.id) throw new Error('登录会话已失效，请重新登录');
  }
  async function synchronize() {
    if (!credentials) return null;
    const attempt = generation;
    validToken(credentials);
    const body = await request('erp-scope-sync', {});
    if (attempt !== generation) return null;
    const identity = body.data || {};
    const sync = body.sync || {};
    if (!body.ok || identity.authenticated !== true || identity.user_id !== credentials.user.id) throw new Error('员工身份验证失败，请重新登录');
    if (!['synced', 'ack_pending'].includes(sync.status) || sync.lease_renewed !== true || !Number.isInteger(sync.scope_version)) {
      current = null;
      const error = new Error(sync.status === 'unlinked' ? '员工账号尚未关联 ERP，请联系总部' : '身份已验证，权限暂未同步；点击重试连接即可');
      error.retryRestore = sync.status !== 'unlinked';
      throw error;
    }
    const bootstrap = body.bootstrap || await request('rpc:app_bootstrap_v1', {});
    if (attempt !== generation) return null;
    if (bootstrap.user_role && bootstrap.user_role.suspended) throw new Error('员工账号已停用，请联系总部');
    const context = bootstrap.shop_context || {};
    const fresh = context.date === businessDate();
    const shops = fresh && Array.isArray(context.authorized_shops) ? context.authorized_shops.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string') : [];
    let shop = context.effective_shop || null;
    if (current && current.isHeadquarters && fresh && context.scope === 'hq') shop = shops.find(s => current.shop && s.id === current.shop.id) || shop;
    if (!fresh || !shop || !shops.some(s => s.id === shop.id)) shop = null;
    const profile = bootstrap.profile || {};
    if (current && (current.scopeVersion !== sync.scope_version || (current.shop && current.shop.id) !== (shop && shop.id))) revision++;
    current = { userId: credentials.user.id, profile: { display_name: (bootstrap.staff_profile || {}).real_name || profile.display_name || '员工', avatar_url: profile.avatar_url || '' }, shop,
      shops, isHeadquarters: fresh && context.scope === 'hq', permissions: bootstrap.permissions || [], bootstrap, scopeFresh: fresh, scopeVersion: sync.scope_version };
    verifiedDate = businessDate();
    verifiedAt = Date.now();
    return current;
  }
  function once(fn) {
    if (pending && pending.generation === generation) return pending.promise;
    const record = { generation };
    record.promise = Promise.resolve().then(fn).finally(() => { if (pending === record) pending = null; });
    pending = record;
    return record.promise;
  }
  return {
    get: () => {
      if (current && verifiedDate !== businessDate()) { current = null; revision++; }
      return current;
    },
    revision: () => revision,
    token: () => credentials && credentials.access_token,
    hasCredentials: () => !!credentials,
    ensureFresh() {
      if (this.get() && Date.now() - verifiedAt < 30000 && jwtPayload(credentials.access_token, wx).exp * 1000 > Date.now() + 30000) return Promise.resolve(current);
      return this.restore();
    },
    restore() { if (signingIn) return Promise.reject(new Error('登录正在进行，请稍候')); return once(async () => {
      if (!credentials) return null;
      const attempt = generation;
      const payload = jwtPayload(credentials.access_token, wx);
      if (!payload.exp || payload.exp * 1000 <= Date.now() + 30000) {
        const response = await request('auth:refresh', { refresh_token: credentials.refresh_token });
        if (attempt !== generation) throw new Error('登录已退出');
        if (!response.access_token || !response.refresh_token || !response.user) throw new Error('登录已过期，请重新登录');
        validToken(response); persist(response);
      }
      try { return await synchronize(); } catch (error) { if (attempt === generation) current = null; throw error; }
    }); },
    signInWithCode(phone, code) {
      if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return Promise.reject(new Error('请输入正确的手机号和 6 位验证码'));
      if (signingIn) return Promise.reject(new Error('登录正在进行，请稍候'));
      const attempt = ++generation;
      revision++; current = null; credentials = null; wx.removeStorageSync(KEY); onClear();
      const login = Promise.resolve().then(async () => {
      if (attempt !== generation) throw new Error('登录已退出');
      const response = await request('phone-login-verify-otp', { phone, code });
      if (attempt !== generation) throw new Error('登录已退出');
      const issued = response.session;
      if (!response.ok || !issued || !issued.user || issued.access_token !== response.access_token || issued.refresh_token !== response.refresh_token) throw new Error('登录会话不完整，请重新获取验证码');
      validToken(issued); persist(issued);
      return synchronize();
      }).finally(() => { if (signingIn === login) signingIn = null; });
      signingIn = login;
      return login;
    },
    signInWithPassword(account, password) {
      let identity;
      try {
        identity = loginIdentity(account);
        if (typeof password !== 'string' || password.length < 6 || password.length > 72) throw new Error('密码需为 6–72 位，请检查输入');
      } catch (error) { return Promise.reject(error); }
      if (signingIn) return Promise.reject(new Error('登录正在进行，请稍候'));
      const attempt = ++generation;
      revision++; current = null; credentials = null; wx.removeStorageSync(KEY); onClear();
      const login = Promise.resolve().then(async () => {
        if (attempt !== generation) throw new Error('登录已退出');
        const response = await request(identity.phone ? 'phone-password-login' : 'auth:password', Object.assign({}, identity, { password }), { public: true });
        if (attempt !== generation) throw new Error('登录已退出');
        if (!response || (identity.phone && response.ok !== true) || typeof response.access_token !== 'string' || !response.access_token || typeof response.refresh_token !== 'string' || !response.refresh_token.trim()) throw new Error('登录会话不完整，请重新登录');
        const candidate = { access_token: response.access_token, refresh_token: response.refresh_token };
        const payload = jwtPayload(candidate.access_token, wx);
        if (typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub) || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new Error('登录会话已失效，请重新登录');
        const user = await request('auth:user', undefined, { accessToken: candidate.access_token });
        if (attempt !== generation) throw new Error('登录已退出');
        if (!user || typeof user.id !== 'string' || user.id !== payload.sub) throw new Error('登录身份核验失败，请重新登录');
        const accepted = Object.assign(candidate, { user: { id: user.id } });
        validToken(accepted); persist(accepted);
        const result = await synchronize();
        if (attempt !== generation || !result) throw new Error('登录已退出');
        return result;
      }).finally(() => { if (signingIn === login) signingIn = null; });
      signingIn = login;
      return login;
    },
    sendCode(phone) {
      if (sending) return phone === sendingPhone ? sending : Promise.reject(new Error('另一条短信正在发送，请稍候'));
      if (!/^1[3-9]\d{9}$/.test(phone)) return Promise.reject(new Error('请输入正确的 11 位手机号'));
      sendingPhone = phone;
      sending = request('phone-login-send-otp', { phone }).then(result => {
        if (!result.ok) throw new Error('短信发送尚未确认，请稍后重试');
        return Math.max(1, Number(result.cooldown_seconds || result.retry_after_seconds || 60));
      }).finally(() => { sending = null; sendingPhone = ''; });
      return sending;
    },
    selectShop(id) {
      if (!current || !current.isHeadquarters) throw new Error('员工只能访问 ERP 授权的工作门店');
      const shop = current.shops.find(s => s.id === id);
      if (!shop) throw new Error('该门店不在授权范围内');
      if (!current.shop || current.shop.id !== id) revision++;
      current = Object.assign({}, current, { shop }); onClear(); return current;
    },
    signOut() { generation++; revision++; signingIn = null; current = null; credentials = null; wx.removeStorageSync(KEY); onClear(); }
  };
}
module.exports = { createSession, businessDate, jwtPayload };
