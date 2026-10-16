const { restRequest: manualCopyRequest } = require('./manual-copy-api');
const MESSAGES = {
  otp_invalid: '验证码不正确，请重新输入', otp_expired: '验证码已过期，请重新获取', otp_already_used: '验证码已使用，请重新获取',
  phone_not_registered: '手机号尚未关联员工，请联系总部', sms_send_failed: '短信发送失败，请稍后重试',
  phone_lookup_unavailable: '员工登录服务繁忙，请稍后重试', otp_store_unavailable: '验证码服务繁忙，请稍后重试',
  scope_sync_required: '员工权限待同步，请返回登录页重试连接', feature_unavailable: '该功能后台尚未接通，请稍后再试',
  ai_budget_exhausted: 'AI 额度不足，请联系管理员；原稿未改动', ai_rate_limited: 'AI 起草请求过于频繁，请稍后再试；原稿未改动',
  ai_unavailable: 'AI 起草服务暂不可用；原稿未改动', ai_invalid_response: 'AI 未返回完整草稿，请重试；原稿未改动',
  reference_unavailable: '门店知识参考暂时无法读取；原稿未改动', ai_timeout: 'AI 起草超时；原稿未改动，请确认后再次生成',
  draft_scope_changed: '生成过程中门店或权限已变化，候选已停止接收；原稿未改动'
};
const KNOWLEDGE_CHAT_MESSAGES = {
  ai_budget_exhausted: 'AI 额度不足，请联系管理员；问题已保留', ai_rate_limited: '提问过于频繁，请稍后再试；问题已保留',
  ai_unavailable: 'AI 问答服务暂不可用；问题已保留', ai_invalid_response: '未收到完整回答；问题已保留，不会自动重发',
  ai_timeout: '本次回答超时；问题已保留，不会自动重发', knowledge_chat_scope_changed: '回答期间权限或词条已变化，请刷新词条后再提问',
  not_found: '词条不存在或当前不可读取，请返回列表核对', db_unavailable: '词条资料暂时无法读取，请稍后再试',
  scope_unavailable: '员工权限暂时无法确认，请稍后再试', erp_scope_not_ready: '员工权限需要重新同步，请刷新后再提问',
  account_suspended: '员工账号已停用，请联系管理员'
};
function createTransport(wx, config, token) {
  return function request(name, body, options = {}) {
    if (!/^(?:[a-z][a-z0-9-]*|rpc:[a-z][a-z0-9_]*|auth:(?:refresh|password|user)|rest:publish-history|rest:manual-copy-(?:read|create|update|delete))$/.test(name)) return Promise.reject(new Error('无效的服务入口'));
    if (!config.publicKey) return Promise.reject(new Error('员工服务尚未配置，请运行项目配置命令'));
    const manual = name.startsWith('rest:manual-copy-'), manualToken = manual ? token() : '';
    let manualRequest;
    if (manual) {
      if (typeof manualToken !== 'string' || !manualToken || /\s/.test(manualToken)) return Promise.reject(new Error('手工文案操作需要员工登录凭证'));
      try { manualRequest = manualCopyRequest(name, body); } catch (error) { return Promise.reject(error); }
    }
    const refresh = name === 'auth:refresh';
    const history = name === 'rest:publish-history';
    const historyToken = history ? token() : '';
    if (history && (!body || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'shop_id') || typeof body.shop_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.shop_id)
      || typeof historyToken !== 'string' || !historyToken.trim() || /\s/.test(historyToken))) return Promise.reject(new Error('发布记录需要已验证的员工与门店'));
    const authUser = name === 'auth:user';
    const authPassword = name === 'auth:password' || name === 'phone-password-login';
    if (authUser && (typeof options.accessToken !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(options.accessToken))) return Promise.reject(new Error('缺少待核验的登录凭证'));
    const rpc = name.startsWith('rpc:');
    const scoped = name === 'erp-scope-sync';
    const knowledgeChat = name === 'go-mini-api' && body && body.action === 'official-knowledge-chat';
    const longRequest = knowledgeChat || name === 'recognize-product' || name === 'spirit-chat' || (name === 'go-mini-api' && body && ['conversation-send', 'quiz-start', 'recognition-save', 'profile-update', 'kb-draft'].includes(body.action));
    let url = config.supabaseUrl + (authUser ? '/auth/v1/user' : name === 'auth:password' ? '/auth/v1/token?grant_type=password' : refresh ? '/auth/v1/token?grant_type=refresh_token' : rpc ? '/rest/v1/rpc/' + name.slice(4) : '/functions/v1/' + name);
    if (history) url = config.supabaseUrl + '/rest/v1/social_publish_jobs?select=' + encodeURIComponent('id,shop_id,title,kind,status,created_at,schedule_at,social_publish_targets(platform)') + '&shop_id=eq.' + body.shop_id + '&order=created_at.desc&limit=50';
    if (manual) url = config.supabaseUrl + manualRequest.path;
    if (scoped) url += '?forceFunctionRegion=' + encodeURIComponent(config.scopeRegion);
    const bearer = manual ? manualToken : history ? historyToken : authUser ? options.accessToken : options.public || refresh || authPassword ? config.publicKey : token() || config.publicKey;
    return new Promise((resolve, reject) => {
      wx.request({url, method: manual ? manualRequest.method : authUser || history ? 'GET' : 'POST', data: manual ? manualRequest.data : authUser || history ? undefined : body, timeout: longRequest ? 65000 : 20000,
        header: { apikey: config.publicKey, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', ...(scoped ? { 'x-region': config.scopeRegion } : {}), ...(manual ? manualRequest.headers : {}) },
        success(response) {
          let data = response.data;
          if (typeof data === 'string' && !options.raw) { try { data = JSON.parse(data); } catch (_) { return reject(new Error('服务返回格式异常，请重试')); } }
          if (response.statusCode < 200 || response.statusCode >= 300 || (data && (data.ok === false || data.error))) {
            const code = authPassword ? response.statusCode === 429 ? 'auth_rate_limited' : response.statusCode >= 500 ? 'auth_unavailable' : 'invalid_credentials' : data && (data.code || data.error_code);
            const authMessage = response.statusCode === 429 ? '登录过于频繁，请稍后重试' : response.statusCode >= 500 ? '员工登录服务暂不可用，请稍后重试' : '账号或密码错误，请检查输入';
            const error = new Error(authPassword ? authMessage : (knowledgeChat ? KNOWLEDGE_CHAT_MESSAGES[code] : MESSAGES[code]) || (response.statusCode === 401 ? '登录已过期，请重新登录' : response.statusCode === 403 ? '当前员工没有此操作权限' : '服务暂不可用，请稍后重试'));
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
