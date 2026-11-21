const ORIGIN = 'https://erp.boomeroff.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function failure(message, code, uncertain = false, status) {
  const error = new Error(message);
  error.code = code; error.uncertain = uncertain;
  if (status !== undefined) error.status = status;
  return error;
}
function phoneValid(phone) { return typeof phone === 'string' && phone.length === 11 && /^1[3-9]\d{9}$/.test(phone); }
function credential(value) { return typeof value === 'string' && value.length > 0 && !/\s/.test(value); }
function uuid(value) { return typeof value === 'string' && value.length === 36 && UUID.test(value); }
function userId(user) {
  if (!user || (user.id && user.user_id && user.id !== user.user_id)) return null;
  const id = user.id || user.user_id;
  return uuid(id) ? id : null;
}
function invalidResponse() { return failure('ERP 登录结果未能确认，请勿重复提交验证码', 'erp_auth_unconfirmed', true); }
function isRequestDomainBlocked(error) {
  return !!error && typeof error.errMsg === 'string' &&
    /(?:url not in domain list|不在.*合法域名|合法域名校验)/i.test(error.errMsg);
}
function createErpAuth({ wx, installId }) {
  if (typeof installId !== 'string' || !/^[a-z0-9_-]{8,64}$/i.test(installId)) throw new Error('缺少有效的安装标识');
  let sending = null, sendingPhone = '', signingIn = null;
  function request(path, data, headers) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: ORIGIN + '/api/public/' + path, method: headers ? 'GET' : 'POST', data,
        timeout: 15000, header: Object.assign({ 'Content-Type': 'application/json' }, headers),
        success(response) {
          let body = response.data;
          if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { return reject(invalidResponse()); } }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const status = response.statusCode;
            const code = body && typeof body.code === 'string' ? body.code : 'erp_auth_failed';
            const message = status === 429 ? '请求过于频繁，请稍后重试' : status >= 500
              ? 'ERP 登录服务暂不可用，本次结果未确认' : code === 'otp_invalid'
                ? '验证码不正确，请检查输入' : code === 'otp_expired'
                  ? '验证码已过期，请重新获取' : 'ERP 登录未通过，请检查账号或验证码';
            return reject(failure(message, code, status >= 500, status));
          }
          if (!body || body.ok !== true || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return reject(invalidResponse());
          resolve(body.data);
        },
        fail(error) {
          if (isRequestDomainBlocked(error)) {
            return reject(failure('小程序未配置 erp.boomeroff.com 为请求域名，请联系管理员', 'erp_request_domain_blocked'));
          }
          reject(failure('网络响应中断，短信或登录结果未确认，请勿自动重复提交', 'erp_auth_network_unknown', true));
        }
      });
    });
  }
  function login(path, body) {
    if (signingIn) return Promise.reject(failure('登录正在进行，请稍候', 'erp_auth_busy'));
    const pending = request(path, Object.assign({}, body, { install_id: installId })).then(async data => {
      const id = userId(data.user);
      if (!id || !credential(data.access_token) || !credential(data.refresh_token) || !credential(data.device_token)
        || (data.session_token !== undefined && data.session_token !== data.access_token)
        || !Number.isFinite(data.expires_at) || data.expires_at * 1000 <= Date.now()
        || !data.device || !uuid(data.device.id) || !Array.isArray(data.locations)) throw invalidResponse();
      // Both login methods must resolve to the same server-verified ERP actor.
      try {
        const me = await request('handheld/auth/me', undefined, { Authorization: 'Bearer ' + data.access_token, 'X-Device-Token': data.device_token });
        if (userId(me.user) !== id || !me.device || me.device.id !== data.device.id) throw invalidResponse();
      } catch (error) { error.uncertain = true; throw error; }
      return Object.assign({}, data, { user: Object.assign({}, data.user, { id }) });
    }).finally(() => { if (signingIn === pending) signingIn = null; });
    signingIn = pending;
    return pending;
  }
  return {
    sendCode(phone) {
      if (!phoneValid(phone)) return Promise.reject(failure('请输入正确的 11 位手机号', 'invalid_phone'));
      if (sending) return phone === sendingPhone ? sending : Promise.reject(failure('另一条短信正在发送，请稍候', 'erp_auth_busy'));
      sendingPhone = phone;
      const pending = request('auth/otp/send', { phone, purpose: 'login' }).then(data => {
        if (!Number.isFinite(data.ttl) || data.ttl <= 0) throw invalidResponse();
        return { ttlSeconds: data.ttl, cooldownSeconds: 60 };
      }).finally(() => { if (sending === pending) { sending = null; sendingPhone = ''; } });
      sending = pending;
      return pending;
    },
    signInWithCode(phone, code) {
      if (!phoneValid(phone) || typeof code !== 'string' || code.length !== 6 || !/^\d{6}$/.test(code)) return Promise.reject(failure('请输入正确的手机号和 6 位验证码', 'invalid_code'));
      return login('auth/otp/verify', { phone, code });
    },
    signInWithPassword(account, password) {
      if (typeof account !== 'string' || typeof password !== 'string' || !password.length) return Promise.reject(failure('请输入 ERP 账号和密码', 'invalid_credentials'));
      const value = account.trim();
      const identity = phoneValid(value) ? { phone: value }
        : value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value } : null;
      if (!identity) return Promise.reject(failure('请输入 ERP 手机号或邮箱，不使用 GO 用户名', 'invalid_identity'));
      return login('handheld/auth/bootstrap', Object.assign(identity, { password }));
    }
  };
}
module.exports = { createErpAuth, isRequestDomainBlocked };
