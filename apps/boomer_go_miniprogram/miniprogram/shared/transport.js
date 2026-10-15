const MESSAGES = {
  otp_invalid: '验证码不正确，请重新输入', otp_expired: '验证码已过期，请重新获取', otp_already_used: '验证码已使用，请重新获取',
  phone_not_registered: '手机号尚未关联员工，请联系总部', sms_send_failed: '短信发送失败，请稍后重试',
  phone_lookup_unavailable: '员工登录服务繁忙，请稍后重试', otp_store_unavailable: '验证码服务繁忙，请稍后重试',
  scope_sync_required: '员工权限待同步，请返回登录页重试连接', feature_unavailable: '该功能后台尚未接通，请稍后再试'
};
function createTransport(wx, config, token) {
  return function request(name, body, options = {}) {
    if (!/^(?:[a-z][a-z0-9-]*|rpc:[a-z][a-z0-9_]*|auth:refresh)$/.test(name)) return Promise.reject(new Error('无效的服务入口'));
    if (!config.publicKey) return Promise.reject(new Error('员工服务尚未配置，请运行项目配置命令'));
    const refresh = name === 'auth:refresh';
    const rpc = name.startsWith('rpc:');
    const scoped = name === 'erp-scope-sync';
    const longRequest = name === 'recognize-product' || name === 'spirit-chat' || (name === 'go-mini-api' && body && ['conversation-send', 'quiz-start', 'recognition-save', 'profile-update'].includes(body.action));
    let url = config.supabaseUrl + (refresh ? '/auth/v1/token?grant_type=refresh_token' : rpc ? '/rest/v1/rpc/' + name.slice(4) : '/functions/v1/' + name);
    if (scoped) url += '?forceFunctionRegion=' + encodeURIComponent(config.scopeRegion);
    const bearer = options.public || refresh ? config.publicKey : token() || config.publicKey;
    return new Promise((resolve, reject) => {
      wx.request({url, method: 'POST', data: body, timeout: longRequest ? 65000 : 20000,
        header: { apikey: config.publicKey, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', ...(scoped ? { 'x-region': config.scopeRegion } : {}) },
        success(response) {
          let data = response.data;
          if (typeof data === 'string' && !options.raw) { try { data = JSON.parse(data); } catch (_) { return reject(new Error('服务返回格式异常，请重试')); } }
          if (response.statusCode < 200 || response.statusCode >= 300 || (data && (data.ok === false || data.error))) {
            const code = data && (data.code || data.error_code);
            const error = new Error(MESSAGES[code] || (response.statusCode === 401 ? '登录已过期，请重新登录' : response.statusCode === 403 ? '当前员工没有此操作权限' : '服务暂不可用，请稍后重试'));
            error.code = code; error.status = response.statusCode; error.retryAfter = Number(data && data.retry_after_seconds || 0);
            return reject(error);
          }
          resolve(data);
        },
        fail() { const error = new Error(name === 'phone-login-verify-otp' ? '验证响应超时，验证码可能已使用；先重试连接，必要时重新获取' : '网络连接中断，请重试'); error.code = 'network_error'; reject(error); }
      });
    });
  };
}
module.exports = { createTransport };
