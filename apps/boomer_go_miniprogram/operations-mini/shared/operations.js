const { isRequestDomainBlocked } = require('./erp-auth');
const OPS_HOST = 'go.boomeroff.com';
const OPS = 'https://' + OPS_HOST + '/go-operations/v1';
const REFRESH = 'https://erp.boomeroff.com/api/public/handheld/auth/refresh';
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+$/.test(value);
const day = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function createOperations({ wx, auth }) {
  let credentials, scope, pending, refreshing;
  let generation = 0;

  function signOut() {
    generation++;
    credentials = scope = pending = refreshing = null;
  }

  function request(url, session, body) {
    return new Promise((resolve, reject) => wx.request({
      url, method: body ? 'POST' : 'GET', data: body, timeout: 17000,
      header: { Authorization: 'Bearer ' + session.access_token, 'X-Device-Token': session.device_token,
        'Content-Type': 'application/json' },
      success({ statusCode, data }) {
        if (statusCode === 401 || statusCode === 403) {
          const error = new Error('ERP 登录已失效或门店权限已变更，请重新登录');
          error.status = statusCode;
          return reject(error);
        }
        if (statusCode !== 200 || !data || data.ok !== true || !data.data) return reject(new Error('服务未能确认结果，请稍后重试'));
        resolve(data.data);
      },
      fail(error) {
        if (isRequestDomainBlocked(error)) {
          const host = url === REFRESH ? 'erp.boomeroff.com' : OPS_HOST;
          return reject(new Error('小程序未配置 ' + host + ' 为请求域名，请联系管理员'));
        }
        reject(new Error('网络连接失败，请重试'));
      }
    }));
  }

  function ensureCurrent(attempt) {
    if (attempt !== generation) throw new Error('登录已退出');
  }

  async function confirm(candidate) {
    const data = await request(OPS + '/session', candidate);
    if (data.user_id !== candidate.user.id || !Array.isArray(data.roles) || !Array.isArray(data.shops)) {
      throw new Error('ERP 员工身份无法确认');
    }
    const hq = data.roles.some(role => role === 'super_admin' || role === 'hq_operator');
    const shops = data.shops.filter(shop => shop && typeof shop.id === 'string' && shop.id && typeof shop.name === 'string');
    if (!shops.length || (!hq && shops.length !== 1)) throw new Error('无法确定员工所属门店，请联系管理员核对 ERP 权限');
    return { shops, hq };
  }

  async function fresh(attempt) {
    if (credentials.expires_at * 1000 > Date.now() + 30000) return;
    if (!refreshing) {
      const before = credentials;
      const flight = request(REFRESH, before, { refresh_token: before.refresh_token }).then(async response => {
        ensureCurrent(attempt);
        if (!validToken(response.access_token) || !validToken(response.refresh_token) ||
          !Number.isFinite(response.expires_at) || response.expires_at * 1000 <= Date.now()) {
          throw new Error('ERP 未确认会话续期，请重新登录');
        }
        const next = { ...before, access_token: response.access_token, refresh_token: response.refresh_token,
          expires_at: response.expires_at };
        const nextScope = await confirm(next);
        ensureCurrent(attempt);
        credentials = next;
        scope = nextScope;
      }).catch(error => {
        if (attempt === generation) signOut();
        throw error;
      }).finally(() => { if (refreshing === flight) refreshing = null; });
      refreshing = flight;
    }
    return refreshing;
  }

  return {
    sendCode: phone => auth.sendCode(phone),
    current: () => scope || null,
    signOut,
    signIn(mode, account, proof) {
      if (pending) return Promise.reject(new Error('登录正在进行'));
      signOut();
      const attempt = generation;
      const call = mode === 'otp' ? auth.signInWithCode : auth.signInWithPassword;
      const flight = call(account, proof).then(async candidate => {
        ensureCurrent(attempt);
        const verified = await confirm(candidate);
        ensureCurrent(attempt);
        credentials = candidate;
        scope = verified;
        return verified;
      }).finally(() => { if (pending === flight) pending = null; });
      pending = flight;
      return pending;
    },
    async tasks(shopId, date = day()) {
      if (!scope) throw new Error('请先登录 ERP 员工账号');
      if (!scope.shops.some(shop => shop.id === shopId)) throw new Error('该门店不在授权范围内');
      const attempt = generation;
      try {
        await fresh(attempt);
        ensureCurrent(attempt);
        if (!scope.shops.some(shop => shop.id === shopId)) throw new Error('该门店权限已变更');
        const data = await request(OPS + '/tasks?shop_id=' + encodeURIComponent(shopId) +
          '&date=' + encodeURIComponent(date), credentials);
        ensureCurrent(attempt);
        if (!Array.isArray(data.items) || !Number.isInteger(data.total) || !Number.isInteger(data.completed) ||
          data.total !== data.items.length || data.completed !== data.items.filter(item => item && item.status === 'completed').length ||
          data.items.some(item => !item || item.shop_id !== shopId || item.date !== date)) {
          throw new Error('门店任务数据未能确认');
        }
        return data;
      } catch (error) {
        if (attempt === generation && (error.status === 401 || error.status === 403)) signOut();
        throw error;
      }
    }
  };
}

module.exports = { createOperations, day };
