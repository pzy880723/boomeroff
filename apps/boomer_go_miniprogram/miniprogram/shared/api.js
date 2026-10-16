const { createPublicationUploads } = require('./publication-upload');
const { readPersonalSchedule } = require('./personal-schedule');
const publishingRead = require('./publishing-read');

function dashboardShift(data, user) {
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const unavailable = notice => ({ shift: null, shift_status: 'unavailable', shift_notice: notice });
  const context = data.shop_context || {};
  if (data.date !== date || (context.date !== undefined && context.date !== date)) return unavailable('排班日期已过期或不一致，请重新同步今日安排。');
  if (!Array.isArray(data.shifts) || data.shifts.some(row => !row || typeof row.work_date !== 'string')) return unavailable('排班记录不完整，暂不能确认今日安排，请重新同步。');
  const rows = data.shifts.filter(row => row.work_date === date);
  if (rows.length > 1 || rows.length && context.status === 'rest') return { shift: null, shift_status: 'conflict', shift_notice: '今日排班存在多条或与休息状态冲突，请核对门店安排。' };
  if (!rows.length && context.status === 'scheduled') return unavailable('今日排班记录与服务器状态不一致，记录不完整，请重新同步。');
  if (!rows.length) return context.date === date && context.status === 'rest'
    ? { shift: null, shift_status: 'rest', shift_notice: '' }
    : { shift: null, shift_status: 'unscheduled', shift_notice: '' };
  const row = rows[0], own = Object.prototype.hasOwnProperty;
  if (!user || own.call(row, 'user_id') && row.user_id !== user.userId || own.call(row, 'is_self') && row.is_self !== true) return unavailable('排班人员身份未能核对，请重新同步本人安排。');
  const shops = (Array.isArray(user.shops) ? user.shops : []).filter(shop => shop && shop.id === row.shop_id && typeof shop.name === 'string' && shop.name.trim());
  if (!row.shop_id || shops.length !== 1) return unavailable('排班门店未能通过当前授权范围核对，请重新同步。');
  if (typeof row.shift_code !== 'string' || !row.shift_code.trim()) return unavailable('排班缺少班次代号，请核对门店安排。');
  const definitions = (Array.isArray(data.shift_definitions) ? data.shift_definitions : []).filter(def => def && def.code === row.shift_code);
  // The fixed bootstrap omits shop_id on legacy definitions; never choose its first duplicate.
  const tiers = [definitions.filter(def => def.shop_id === row.shop_id), definitions.filter(def => def.shop_id === null), definitions.filter(def => !own.call(def, 'shop_id'))];
  const matches = tiers.find(tier => tier.length) || [], definition = matches.length === 1 ? matches[0] : null;
  const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value);
  const complete = definition && time(definition.start_time) && time(definition.end_time);
  const title = definition && typeof definition.name === 'string' && definition.name.trim() || row.shift_code;
  return { shift: { title, start_time: complete ? definition.start_time : '', end_time: complete ? definition.end_time : '', shop_id: row.shop_id, shop_name: shops[0].name, note: typeof row.note === 'string' ? row.note : '' },
    shift_status: 'scheduled', shift_notice: matches.length > 1 ? '班次配置不唯一，时间暂不展示，请核对门店班次。' : !complete ? '班次配置缺失或时间不完整，暂不展示时间，请核对门店班次。' : '' };
}

function createApi({ wx, config, session, invoke: transport }) {
  const saveRequests = [];
  const shopActions = new Set(['learning', 'objectives', 'objective-update', 'marketing-assets', 'marketing-detail', 'activities', 'activity-detail', 'vouchers', 'voucher-detail', 'voucher-capabilities', 'voucher-lookup', 'voucher-redeem', 'voucher-redeem-status', 'schedule', 'activity-capabilities', 'activity-applications', 'application-detail', 'publication-confirm', 'publication-confirm-status', 'publication-upload-intent', 'publication-upload-commit', 'publication-upload-status', 'kb-capabilities', 'kb-list', 'kb-detail', 'kb-write', 'kb-write-status', 'kb-draft', 'kb-category-list', 'kb-category-detail', 'kb-category-write', 'kb-category-write-status', 'schedule-manage-capabilities', 'schedule-manage-week', 'schedule-manage-candidates', 'schedule-manage-cell', 'schedule-manage-write', 'schedule-manage-write-status']);
  for (const name of ['activity-manage-capabilities', 'activity-manage-list', 'activity-manage-voucher-candidates', 'activity-manage-detail', 'activity-manage-write', 'activity-manage-write-status']) shopActions.add(name);
  function snapshot() {
    const value = typeof session.get === 'function' ? session.get() : null;
    return { revision: session.revision ? session.revision() : null, identity: value ? JSON.stringify([value.userId, value.shop && value.shop.id, value.scopeVersion]) : '' };
  }
  function assertState(before) {
    const after = snapshot();
    if (before.revision !== after.revision || (before.identity && before.identity !== after.identity)) {
      const error = new Error('账号或门店已变化，旧操作已停止，请重新操作');
      error.code = 'stale_operation';
      throw error;
    }
  }
  async function settled(before, promise) {
    try { const result = await promise; assertState(before); return result; }
    catch (error) { assertState(before); error.requestRevision = before.revision; throw error; }
  }
  async function ensureFresh(before = snapshot()) {
    if (session.ensureFresh) await session.ensureFresh();
    assertState(before);
    if (!session.get()) throw new Error('请先登录员工账号');
  }
  async function invoke(name, body, options) {
    const before = snapshot();
    await ensureFresh(before);
    return settled(before, transport(name, body, options));
  }
  async function action(name, params = {}) {
    const before = snapshot();
    if (['kb-draft', 'official-knowledge-chat'].includes(name) && session.restore) {
      // Reserve a fresh ERP lease before a paid generation, not halfway through one.
      await session.restore();
      assertState(before);
      if (!session.get()) throw new Error('请先登录员工账号');
    } else await ensureFresh(before);
    const selected = session.get().shop;
    if (name === 'schedule' && !selected && (params.view === undefined || params.view === 'mine')) {
      return settled(before, readPersonalSchedule(params, {
        userId: session.get().userId, token: session.token && session.token(),
        request(name, body, options) { assertState(before); return settled(before, transport(name, body, options)); }
      }));
    }
    const storeKbDetail = name === 'knowledge-detail' && ['sop', 'qa', 'training'].includes(params.kind || params.source);
    if ((shopActions.has(name) || storeKbDetail) && !selected) throw new Error('请先选择当前授权工作门店');
    let payload = Object.assign({}, params, selected && !['official-library', 'official-knowledge-chat'].includes(name) ? { shop_id: selected.id } : {});
    if (name === 'profile-update') {
      const userId = session.get().userId;
      payload = Object.assign({}, params);
      if (params.avatar_path) {
        payload.avatar_data_url = (await loadImages([params.avatar_path], 1400000))[0];
        delete payload.avatar_path;
      }
      await ensureFresh(before);
      if (!session.get() || session.get().userId !== userId) throw new Error('员工登录已变化，已停止修改资料');
    }
    if (name === 'recognition-save') {
      const userId = session.get().userId;
      const fingerprint = JSON.stringify([before.revision, before.identity, params.result, params.photos]);
      let saveRequest = saveRequests.find(record => record.fingerprint === fingerprint);
      if (!saveRequest) {
        saveRequest = { fingerprint, id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }) };
        saveRequests.push(saveRequest);
        if (saveRequests.length > 16) saveRequests.shift();
      }
      const requestId = saveRequest.id;
      payload = { result: params.result, image_data_urls: await loadImages(params.photos), request_id: requestId };
      await ensureFresh(before);
      if (!session.get() || session.get().userId !== userId) throw new Error('员工登录已变化，已停止保存照片');
    }
    let response;
    try { response = await settled(before, transport('go-mini-api', { action: name, params: payload })); }
    catch (error) {
      // Activity writes can also lose scope after waiting for a database lock; never resend them here.
      if (name === 'official-knowledge-chat' || name === 'activity-manage-write' || name === 'knowledge-save' || error.status !== 403 || error.code !== 'erp_scope_not_ready' || !session.restore) throw error;
      await session.restore();
      assertState(before);
      response = await settled(before, transport('go-mini-api', { action: name, params: payload }));
    }
    const data = response && response.data !== undefined ? response.data : response;
    if (name === 'dashboard' && data) {
      return Object.assign({}, data, dashboardShift(data, session.get()));
    }
    if (['knowledge-detail','marketing-detail','activity-detail','voucher-detail'].includes(name) && data && !data.item) return { item: data };
    return Array.isArray(data) ? { items: data } : data;
  }
  async function readPublishing(id) {
    const before = snapshot();
    await ensureFresh(before);
    const shop = session.get().shop;
    if (!shop || !publishingRead.uuid.test(shop.id)) throw new Error('请先选择当前授权工作门店');
    if (id !== undefined && (typeof id !== 'string' || !publishingRead.uuid.test(id))) throw new Error('发布任务编号不合法');
    const data = await settled(before, transport(id === undefined ? 'rest:publish-history' : 'dispatch-job-status', id === undefined ? { shop_id: shop.id } : { job_id: id }));
    await ensureFresh(before);
    return id === undefined ? publishingRead.history(data, shop.id) : publishingRead.detail(data, shop.id, id);
  }
  function publishHistory() { return readPublishing(); }
  function publishStatus(id) {
    if (id === undefined) return Promise.reject(new Error('缺少发布任务编号'));
    return readPublishing(id);
  }
  async function erp(path, params = {}, before = snapshot()) {
    await ensureFresh(before);
    const query = Object.assign({}, params);
    const suffix = Object.keys(query).filter(k => query[k] !== undefined && query[k] !== null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(query[k]))).join('&');
    return settled(before, new Promise((resolve, reject) => wx.request({
      url: config.erpUrl + '/api/public/go/' + path + (suffix ? '?' + suffix : ''), method: 'GET', timeout: 15000,
      header: { Authorization: 'Bearer ' + session.token() },
      success(response) {
        const body = response.data;
        if (response.statusCode !== 200 || !body || body.ok !== true) {
          const error = new Error(response.statusCode === 401 ? '登录已过期，请重新登录' : response.statusCode === 403 ? '当前门店没有查看权限' : 'ERP 数据暂不可用，请稍后刷新');
          error.status = response.statusCode; error.code = body && body.code;
          return reject(error);
        }
        resolve(body.data);
      }, fail: () => reject(new Error('ERP 连接超时，暂时不能确认最新业绩'))
    })));
  }
  async function location(before) {
    await ensureFresh(before);
    const user = session.get();
    if (!user || !user.shop) throw new Error('暂无当天已验证工作门店，请检查 ERP 排班');
    const context = await erp('session', {}, before);
    if (!session.get() || session.get().userId !== user.userId || session.get().shop.id !== user.shop.id) throw new Error('员工或工作门店已变化，请刷新');
    const mapping = (context.shops || []).find(s => s.go_shop_id === user.shop.id);
    const id = mapping && mapping.erp_location_id;
    if (!id || !(context.visible_locations || []).some(s => s.id === id)) throw new Error('工作门店尚未完成 ERP 业绩关联');
    return id;
  }
  async function sales(params = {}) {
    const before = snapshot();
    if (params.period === 'month') throw new Error('本月汇总接口尚未接通，目前可查看今日实时数据');
    const id = await location(before);
    const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const raw = await erp('daily-summary', { date, location_id: id }, before);
    if (!raw || raw.date !== date || date !== new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)) throw new Error('业绩返回日期不一致，已停止展示，请刷新');
    if (!raw.scope || !Array.isArray(raw.scope.location_ids) || raw.scope.location_ids.length !== 1 || raw.scope.location_ids[0] !== id || !Array.isArray(raw.stores) || raw.stores.length !== 1 || raw.stores[0].location_id !== id) throw new Error('业绩返回门店不一致，已停止展示');
    const totals = raw.totals || {}, state = raw.completeness || {};
    const store = raw.stores[0], source = store.completeness || {};
    const net = state.kind === 'net' && source.kind === 'net';
    return { date: raw.date, revenue: Number.isSafeInteger(totals.actual_fen) && store.status === 'ok' ? totals.actual_fen / 100 : null,
      order_count: Number.isInteger(totals.order_count) ? totals.order_count : null, refund_amount: null, average_order_value: null,
      complete: state.complete === true && source.complete === true && store.status === 'ok', source_label: net ? '销售净额' : '付款毛额（未扣退款）',
      as_of: source.youzan_synced_through || null, stale: source.source_fresh !== true, sales_assessment: false };
  }
  async function leaderboard(params = {}) {
    const before = snapshot();
    const period = params.period || 'today';
    const id = await location(before);
    const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, period === 'month' ? 7 : 10);
    const raw = await erp('leaderboard', { period, location_id: id }, before);
    if (!raw || raw.period !== period || raw.date !== date || date !== new Date(Date.now() + 8 * 3600000).toISOString().slice(0, period === 'month' ? 7 : 10)) throw new Error('榜单返回日期或周期不一致，已停止展示，请刷新');
    if (!raw.shop || raw.shop.id !== id || raw.sales_assessment !== false) throw new Error('榜单返回范围不一致，已停止展示');
    return Object.assign({}, raw, { items: raw.complete === true && Array.isArray(raw.rows) ? raw.rows.map(row => ({ rank: row.rank, name: row.display_name, revenue: Number.isSafeInteger(row.achieved_cents) ? row.achieved_cents / 100 : null })) : [] });
  }
  async function loadImages(paths, maxSize = 2800000) {
    if (!Array.isArray(paths) || !paths.length || paths.length > 5) throw new Error('请拍摄或选择 1 至 5 张照片');
    const images = [];
    for (const photo of paths) {
      const original = typeof photo === 'string' ? photo : photo.path || photo.tempFilePath || photo.src;
      const file = await new Promise(resolve => wx.compressImage({ src: original, quality: 65, success: r => resolve(r.tempFilePath), fail: () => resolve(original) }));
      const encoded = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: file, encoding: 'base64', success: r => resolve(r.data), fail: () => reject(new Error('照片读取失败，请重新选择')) }));
      if (encoded.length > maxSize) throw new Error('照片过大，请重新选择或拍摄');
      const mime = encoded.startsWith('/9j/') ? 'jpeg' : encoded.startsWith('iVBORw0KGgo') ? 'png' : encoded.startsWith('UklGR') ? 'webp' : null;
      if (!mime) throw new Error('照片格式不支持，请重新拍摄或选择 JPG、PNG 照片');
      images.push('data:image/' + mime + ';base64,' + encoded);
    }
    return images;
  }
  async function recognize(paths, hint) {
    const before = snapshot();
    await ensureFresh(before);
    const userId = session.get().userId;
    const images = await loadImages(paths);
    await ensureFresh(before);
    if (!session.get() || session.get().userId !== userId) throw new Error('员工登录已变化，已停止识别');
    return settled(before, transport('recognize-product', { imageBase64: images[0], images, userHint: String(hint || '').trim(), forceRefresh: true }));
  }
  async function assistant(messages, conversationId, onDelta) {
    const before = snapshot();
    await ensureFresh(before);
    const raw = await settled(before, transport('spirit-chat', { conversationId, messages }, { raw: true }));
    let text = '', id = conversationId;
    if (typeof raw !== 'string') throw new Error('助手响应格式异常，请重试');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const content = line.slice(5).trim();
      if (!content || content === '[DONE]') continue;
      let event; try { event = JSON.parse(content); } catch (_) { continue; }
      if (event.error) throw new Error('助手服务暂不可用，请重试');
      if (event.__meta && event.__meta.conversationId) id = event.__meta.conversationId;
      const chunk = event.choices && event.choices[0] && event.choices[0].delta && event.choices[0].delta.content;
      if (typeof chunk === 'string') { text += chunk; if (onDelta) onDelta(chunk); }
    }
    if (!text.trim()) throw new Error('助手本次没有返回内容，请重试');
    return { text, conversationId: id };
  }
  async function copy(text) {
    const before = snapshot();
    if (!session.get()) throw new Error('请先登录员工账号');
    return settled(before, new Promise((resolve, reject) => wx.setClipboardData({ data: String(text || ''), success: resolve, fail: () => reject(new Error('文案复制未完成，请重试')) })));
  }
  async function saveMedia(url, kind) {
    const before = snapshot();
    if (!session.get()) throw new Error('请先登录员工账号');
    if (!/^https:\/\/[a-z0-9.-]+(?::443)?\//i.test(String(url))) throw new Error('素材链接不可用，请刷新素材');
    const tempFilePath = await settled(before, new Promise((resolve, reject) => wx.downloadFile({ url, timeout: 120000, success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('素材下载失败，请刷新链接')), fail: () => reject(new Error('下载中断，请重试')) })));
    await settled(before, new Promise((resolve, reject) => {
      const method = kind === 'video' ? 'saveVideoToPhotosAlbum' : 'saveImageToPhotosAlbum';
      wx[method]({ filePath: tempFilePath, success: resolve, fail: () => reject(new Error('未能保存到相册，请检查相册权限后重试')) });
    }));
    return { saved: true };
  }
  async function uploadChatAttachment(file) {
    const before = snapshot();
    await ensureFresh(before);
    if (!file || !['image', 'video', 'file'].includes(file.kind) || typeof file.path !== 'string' || !/^(?:wxfile:\/\/|file:\/\/|https?:\/\/tmp\/|\/)/.test(file.path)) throw new Error('请选择本地聊天附件');
    const name = String(file.name || file.path.split('/').pop() || '附件').replace(/[\x00-\x1f]/g, '').slice(-200);
    const suffix = /\.([a-z0-9]{1,10})$/i.exec(name);
    const ext = suffix ? suffix[1].toLowerCase() : 'bin';
    const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    const mime = types[ext] || 'application/octet-stream';
    if ((file.kind === 'image' && !mime.startsWith('image/')) || (file.kind === 'video' && !mime.startsWith('video/'))) throw new Error('附件文件格式与类型不一致，请重新选择');
    const stats = await settled(before, new Promise((resolve, reject) => wx.getFileSystemManager().stat({ path: file.path, success: r => resolve(r.stats), fail: () => reject(new Error('本地附件读取失败，请重新选择')) })));
    if (!stats || !Number.isSafeInteger(stats.size) || stats.size < 1 || stats.size > 40 * 1024 * 1024) throw new Error('聊天附件大小需在 40MB 以内');
    await ensureFresh(before);
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); });
    const path = session.get().userId + '/' + id + '.' + ext;
    const key = 'chat-attachments/' + path;
    await settled(before, new Promise((resolve, reject) => wx.uploadFile({
      url: config.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/' + key,
      filePath: file.path, name: 'file', timeout: 120000,
      header: { Authorization: 'Bearer ' + session.token(), apikey: config.publicKey, 'x-upsert': 'false' },
      formData: { cacheControl: '3600' },
      success(r) {
        if (r.statusCode < 200 || r.statusCode >= 300) { const error = new Error('附件上传失败，请重新选择或重试'); error.status = r.statusCode; return reject(error); }
        let data; try { data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch (_) {}
        if (!data || data.Key !== key) return reject(new Error('服务器未确认附件存储位置，未加入消息'));
        resolve();
      }, fail: () => reject(new Error('附件上传未确认，请检查网络后重试'))
    })));
    return { kind: file.kind, storage_path: path, size: stats.size, mime, name };
  }
  async function openChatAttachment(message) {
    const before = snapshot();
    await ensureFresh(before);
    const me = session.get().userId, att = message && message.attachment;
    if (!message || !message.id || (message.sender_id !== me && message.receiver_id !== me) || !att || att.error || !['image', 'video', 'file'].includes(att.kind)) throw new Error('聊天附件不可用，请重新加载会话');
    const origin = config.supabaseUrl.replace(/\/$/, '');
    const prefix = origin + '/storage/v1/object/sign/chat-attachments/' + encodeURIComponent(message.sender_id) + '/';
    const url = att.url;
    if (typeof url !== 'string' || !url.startsWith(prefix) || /[\s\\#]/.test(url)) throw new Error('聊天附件来源未通过检查');
    let path;
    try { path = decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch (_) { throw new Error('聊天附件路径无效'); }
    if (!path || /[%\\]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || !/^\?token=[A-Za-z0-9_.~-]+$/.test(url.slice(url.indexOf('?')))) throw new Error('聊天附件路径或签名无效');
    if (att.kind === 'image') return settled(before, new Promise((resolve, reject) => wx.previewImage({ urls: [url], current: url, success: resolve, fail: () => reject(new Error('图片附件打开失败')) })));
    if (att.kind === 'video') {
      if (!wx.previewMedia) throw new Error('当前微信版本暂不支持视频附件预览，请升级微信');
      return settled(before, new Promise((resolve, reject) => wx.previewMedia({ sources: [{ url, type: 'video' }], current: 0, success: resolve, fail: () => reject(new Error('视频附件打开失败')) })));
    }
    const temp = await settled(before, new Promise((resolve, reject) => wx.downloadFile({ url, timeout: 120000, success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('文件附件下载失败，请刷新会话')), fail: () => reject(new Error('文件附件下载中断，请重试')) })));
    const match = /\.(docx?|xlsx?|pptx?|pdf)$/i.exec(String(att.name || ''));
    if (match) return settled(before, new Promise((resolve, reject) => wx.openDocument({ filePath: temp, fileType: match[1].toLowerCase(), showMenu: true, success: resolve, fail: () => reject(new Error('文件预览失败，请检查文件格式')) })));
    if (!wx.shareFileMessage) throw new Error('此文件类型暂不能原生预览，当前微信也不支持文件分享');
    return settled(before, new Promise((resolve, reject) => wx.shareFileMessage({ filePath: temp, fileName: String(att.name || '附件'), success: resolve, fail: () => reject(new Error('文件分享未完成，原文件未修改')) })));
  }
  return Object.assign({ action, invoke, publishHistory, publishStatus, recognize, assistant, saveMedia, copy, sales, leaderboard, uploadChatAttachment, openChatAttachment }, createPublicationUploads({ wx, config, session, transport, snapshot, settled, ensureFresh }));
}
module.exports = { createApi };
