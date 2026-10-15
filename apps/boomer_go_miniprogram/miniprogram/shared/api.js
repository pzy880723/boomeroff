const { createPublicationUploads } = require('./publication-upload');

function createApi({ wx, config, session, invoke: transport }) {
  const saveRequests = [];
  const shopActions = new Set(['learning', 'objectives', 'objective-update', 'marketing-assets', 'marketing-detail', 'activities', 'activity-detail', 'vouchers', 'voucher-detail', 'voucher-capabilities', 'voucher-lookup', 'voucher-redeem', 'voucher-redeem-status', 'schedule', 'activity-capabilities', 'activity-applications', 'application-detail', 'publication-confirm', 'publication-confirm-status', 'publication-upload-intent', 'publication-upload-commit', 'publication-upload-status', 'kb-capabilities', 'kb-list', 'kb-detail', 'kb-write', 'kb-write-status']);
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
    await ensureFresh(before);
    const selected = session.get().shop;
    const storeKbDetail = name === 'knowledge-detail' && ['sop', 'qa', 'training'].includes(params.kind || params.source);
    if ((shopActions.has(name) || storeKbDetail) && !selected) throw new Error('请先选择当前授权工作门店');
    let payload = Object.assign({}, params, selected ? { shop_id: selected.id } : {});
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
      // This code is returned only by the BFF gate before a handler can read or mutate data.
      if (error.status !== 403 || error.code !== 'erp_scope_not_ready' || !session.restore) throw error;
      await session.restore();
      assertState(before);
      response = await settled(before, transport('go-mini-api', { action: name, params: payload }));
    }
    const data = response && response.data !== undefined ? response.data : response;
    if (name === 'dashboard' && data) {
      const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const row = data.date === date && (data.shifts || []).find(s => s.work_date === date);
      const shift = row && (data.shift_definitions || []).find(s => s.code === row.shift_code);
      return Object.assign({}, data, { shift: row ? { title: shift && shift.name || row.shift_code, start_time: shift && shift.start_time || '', end_time: shift && shift.end_time || '', shop_name: selected && selected.name || '' } : null });
    }
    if (['knowledge-detail','marketing-detail','activity-detail','voucher-detail'].includes(name) && data && !data.item) return { item: data };
    return Array.isArray(data) ? { items: data } : data;
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
    const id = await location(before);
    const raw = await erp('leaderboard', { period: params.period || 'today', location_id: id }, before);
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
  return Object.assign({ action, invoke, recognize, assistant, saveMedia, copy, sales, leaderboard, uploadChatAttachment, openChatAttachment }, createPublicationUploads({ wx, config, session, transport, snapshot, settled, ensureFresh }));
}
module.exports = { createApi };
