const { isRequestDomainBlocked } = require('./erp-auth');
const { makeLearningClient } = require('./learning');
const OPS_HOST = 'go.boomeroff.com';
const OPS = 'https://' + OPS_HOST + '/go-operations/v1';
const REFRESH = 'https://erp.boomeroff.com/api/public/handheld/auth/refresh';
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+$/.test(value);
const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const day = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const MAX_PHOTO = 6 * 1024 * 1024;
const faults = {
  ambiguous_shop_scope: '无法确定员工所属门店，请联系管理员核对 ERP 权限',
  release_read_only: '当前版本暂未开放任务提交',
  invalid_body: '内容不符合要求，请检查后重试',
  invalid_photo: '照片无法读取，请重拍或选择清晰的 JPG、PNG、WebP 图片',
  photo_limit: '每项任务最多上传 9 张不同照片',
  photos_required: '请先上传要求的照片',
  photo_unavailable: '凭证暂时无法读取，请重新上传原图或联系店长',
  photo_storage_full: '照片存储空间暂时不足，请联系管理员',
  photo_busy: '相片服务正忙，请稍后重试',
  task_completed: '该任务已完成，请刷新后查看',
  version_conflict: '任务已有更新，请刷新后再提交',
  request_conflict: '这次提交未能确认，请返回工作台核对任务列表',
  not_found: '这条记录已不存在',
  erp_unavailable: 'ERP 暂时无法确认登录，请稍后重试',
  generation_busy: '还有一张卡片正在生成，请稍后再试',
  generation_unavailable: '暂未开启卡片生成',
  generation_limit: '已达到生成或重试上限',
  draft_not_ready: '草稿还没有生成完成',
  quiz_unavailable: '这条内容暂无可用试题'
};

function photoType(content) {
  if (!(content instanceof ArrayBuffer) || content.byteLength > MAX_PHOTO) return '';
  const head = new Uint8Array(content, 0, Math.min(content.byteLength, 12));
  if (head.length < 12) return '';
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => head[index] === value)) return 'image/png';
  const ascii = String.fromCharCode(...head);
  return ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP' ? 'image/webp' : '';
}

function createOperations({ wx, auth }) {
  let credentials, scope, pending, refreshing;
  let generation = 0;

  function signOut() {
    generation++;
    credentials = scope = pending = refreshing = null;
  }

  function request(url, session, body, mime = 'application/json', binary = false) {
    return new Promise((resolve, reject) => wx.request({
      url, method: body ? 'POST' : 'GET', data: body, timeout: 17000,
      responseType: binary ? 'arraybuffer' : 'text',
      header: { Authorization: 'Bearer ' + session.access_token, 'X-Device-Token': session.device_token,
        'Content-Type': mime },
      success({ statusCode, data }) {
        if (binary && statusCode === 200 && photoType(data)) return resolve(data);
        if (!binary && [200, 201, 202].includes(statusCode) && data && data.ok === true && data.data) {
          return resolve(data.data);
        }
        const code = data && Object.prototype.hasOwnProperty.call(faults, data.code) ? data.code : '';
        const error = new Error(faults[code] || (statusCode === 401 || statusCode === 403 ?
          'ERP 登录已失效或门店权限已变更，请重新登录' : '服务未能确认结果，请稍后重试'));
        error.status = statusCode;
        error.code = code;
        reject(error);
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
    return { shops, hq, canManage: data.can_manage_tasks === true, writes: data.task_writes_enabled === true,
      canUpdate: data.task_writes_enabled === true && data.can_update_tasks === true,
      canGenerateCards: data.can_generate_cards === true };
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

  async function scoped(shopId, call) {
    if (!scope) throw new Error('请先登录 ERP 员工账号');
    if (shopId !== null && !scope.shops.some(shop => shop.id === shopId)) throw new Error('该门店不在授权范围内');
    const attempt = generation;
    try {
      await fresh(attempt);
      ensureCurrent(attempt);
      if (shopId !== null && !scope.shops.some(shop => shop.id === shopId)) throw new Error('该门店权限已变更');
      const result = await call();
      ensureCurrent(attempt);
      return result;
    } catch (error) {
      if (attempt === generation && (error.status === 401 || (error.status === 403 && shopId !== null))) signOut();
      throw error;
    }
  }

  function taskUrl(id) {
    if (!validId(id)) throw new Error('任务编号无效');
    return OPS + '/tasks/' + id;
  }

  function verifiedTask(data, id, shopId, date) {
    if (data.id !== id || data.shop_id !== shopId || data.date !== date ||
      !Number.isInteger(data.version) || !Array.isArray(data.photos)) throw new Error('门店任务数据未能确认');
    return data;
  }

  function requireWrite() {
    if (!scope.writes) throw new Error(faults.release_read_only);
  }

  return {
    learning: makeLearningClient((path, body, mime, binary) => scoped(null, () => request(OPS + path, credentials, body, mime, binary))),
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
      return scoped(shopId, async () => {
        const data = await request(OPS + '/tasks?shop_id=' + encodeURIComponent(shopId) +
          '&date=' + encodeURIComponent(date), credentials);
        if (!Array.isArray(data.items) || !Number.isInteger(data.total) || !Number.isInteger(data.completed) ||
          data.total !== data.items.length || data.completed !== data.items.filter(item => item && item.status === 'completed').length ||
          data.items.some(item => !item || item.shop_id !== shopId || item.date !== date)) {
          throw new Error('门店任务数据未能确认');
        }
        return data;
      });
    },
    async task(shopId, date, id) {
      return scoped(shopId, async () => verifiedTask(await request(taskUrl(id), credentials), id, shopId, date));
    },
    async createTask(form) {
      return scoped(form.shop_id, async () => {
        requireWrite();
        if (!scope.canManage) throw new Error('此账号不能布置任务');
        if (!validId(form.request_id)) throw new Error('提交编号无效');
        const result = await request(OPS + '/tasks', credentials, form);
        return verifiedTask(result, form.request_id, form.shop_id, form.date);
      });
    },
    async uploadPhoto(task, content) {
      return scoped(task.shop_id, async () => {
        requireWrite();
        if (!scope.canUpdate) throw new Error('此账号不能提交店务凭证');
        const mime = photoType(content);
        if (!mime) throw new Error('请选择 6 MB 内的 JPG、PNG 或 WebP 照片');
        const result = await request(taskUrl(task.id) + '/photos', credentials, content, mime);
        if (!validId(result.id)) throw new Error('未能确认照片上传结果，请刷新任务');
        return result;
      });
    },
    async photo(task, photoId) {
      return scoped(task.shop_id, async () => {
        if (!validId(photoId) || !task.photos.some(photo => photo.id === photoId)) throw new Error('照片编号无效');
        return request(OPS + '/photos/' + photoId, credentials, undefined, undefined, true);
      });
    },
    async completeTask(task, note) {
      return scoped(task.shop_id, async () => {
        requireWrite();
        if (!scope.canUpdate) throw new Error('此账号不能勾选任务完成');
        if (task.photos.length < task.required_photos) throw new Error(faults.photos_required);
        const result = await request(taskUrl(task.id) + '/complete', credentials, { expected_version: task.version, note });
        if (result.status !== 'completed') throw new Error('未能确认任务完成，请刷新任务');
        return verifiedTask(result, task.id, task.shop_id, task.date);
      });
    }
  };
}

module.exports = { createOperations, day, validId, photoType, MAX_PHOTO };
