function createApi({ wx, config, session, invoke: transport }) {
  const saveRequests = [];
  const shopActions = new Set(['learning', 'objectives', 'objective-update', 'marketing-assets', 'marketing-detail']);
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
    if (shopActions.has(name) && !selected) throw new Error('请先选择当前授权工作门店');
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
  return { action, invoke, recognize, assistant, saveMedia, copy, sales, leaderboard };
}
module.exports = { createApi };
