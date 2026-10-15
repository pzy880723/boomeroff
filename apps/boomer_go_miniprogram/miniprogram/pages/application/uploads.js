const model = require('./model');
const upload = require('./upload-model');
function ram() { const app = getApp(); if (!app._applicationUploads) app._applicationUploads = Object.create(null); return app._applicationUploads; }
function index(event) { return Number(event.currentTarget.dataset.index); }
function removable(r) { return !r.sent || r.state === 'ready' || (r.state === 'blocked' && r.terminal === true); }
module.exports = {
  uploadKey() { const u = this.session.get(); return u && u.shop ? JSON.stringify([u.userId, u.shop.id, this._ids.activityId, this._ids.id]) : ''; },
  clearUploads() { this._picker = null; this._uploadFlight = null; this._uploads = []; this._uploadsKey = null; this._canUpload = false; },
  pauseUploads() {
    for (const r of this._uploads || []) {
      if (!r.sent) r.state = 'selected';
      else if (r.included && !r.terminal) { r.state = 'unknown'; r.canRetry = false; r.everUnknown = true; this.rememberUpload(r); }
    }
    this._uploadFlight = null;
  },
  restoreUploads() {
    const key = this.uploadKey();
    if (this._uploadsKey === key || this.isPreview()) return;
    const restored = [];
    const entries = ram()[key] || {};
    for (const saved of Object.values(entries)) {
      if (saved.key !== key || saved.id !== saved.requestId || typeof saved.requestId !== 'string' || !model.UUID.test(saved.requestId) || !saved.binding || saved.binding.shop_id !== this.session.get().shop.id || saved.binding.activity_id !== this._ids.activityId || saved.binding.application_id !== this._ids.id || saved.actorId !== this.session.get().userId) throw new Error('原图未决请求与当前申请不匹配');
      const r = Object.assign({}, saved, { state: 'unknown', canRetry: false, error: '请显式核对原上传状态', everUnknown: true });
      r.file = upload.file(saved.file, saved.file.file_path);
      if (saved.intent) r.intent = upload.intent(saved.intent, r);
      restored.push(r);
    }
    this._uploads = restored; this._uploadsKey = key;
    for (const r of restored) if (r.included && r.hadReady && r.intent && !this._draft.paths.includes(r.intent.path)) this._draft.paths.push(r.intent.path);
  },
  rememberUpload(r) {
    if (!r.sent) return;
    const key = r.key, entries = ram()[key] || (ram()[key] = Object.create(null));
    entries[r.id] = { id: r.id, key, binding: r.binding, actorId: r.actorId, requestId: r.requestId, file: r.file, intent: r.intent || null, included: r.included, hadReady: !!r.hadReady, sent: true, everUnknown: true, blocked: !!r.blocked };
  },
  uploadBusy() { return !!(this._picker || this._uploadFlight); },
  uploadsBlock() { return (this._uploads || []).some(r => r.included && r.state !== 'ready'); },
  uploadWritable() { return !this._gone && this._visible && !this.syncScope() && !this.isPreview() && this._authorized && this.data.verified && this._canUpload && !this._readFlight && !this._pending && !this._confirmed && !this._modalFlight && !this._writeFlight && !this.data.conflict; },
  uploadView() {
    const labels = { selected: '待上传 · 尚未保存', validating: '正在检查原图', creating: '正在建立上传意图', uploading: '正在上传原图', verifying: '正在核对服务端验证回执', ready: '原图已上传 · 发布记录待保存', unknown: '上传结果待核对', checking: '只读核对中', blocked: '此原图不能关联' };
    return {
      uploads: (this._uploads || []).map((r, i) => ({ index: i, name: r.file.name, state: r.state, label: r.included ? labels[r.state] : '已从本次草稿移除 · 原图不删除', progress: r.progress == null ? null : r.progress, error: r.error || '', included: r.included, canRetry: !!r.canRetry && !r.blocked && this._canUpload, canRemove: removable(r) })),
      uploadBusy: this.uploadBusy(), canChoose: !!(this._canUpload && !this.isPreview() && !this._pending && !this._confirmed && !this.data.conflict && !this.uploadBusy() && !this.uploadsBlock() && (this._uploads || []).filter(r => !r.terminal).length < 9), uploadError: ''
    };
  },
  pickerCurrent(picker) { return !this._gone && this._picker === picker && picker.scope === model.scope(this) && picker.activityId === this._ids.activityId && picker.applicationId === this._ids.id && picker.edit === this._edit; },
  async chooseOriginal() {
    if (!this.uploadWritable() || this.uploadBusy() || this.uploadsBlock() || (this._uploads || []).filter(r => !r.terminal).length >= 9) return;
    const picker = { scope: this._scope, activityId: this._ids.activityId, applicationId: this._ids.id, edit: this._edit };
    this._picker = picker; this.render();
    try { picker.result = await new Promise((resolve, reject) => wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'], success: resolve, fail: reject })); }
    catch (error) { picker.error = error; }
    picker.settled = true;
    return this.resumeUploadPicker();
  },
  resumeUploadPicker() {
    const picker = this._picker;
    if (!picker || !this._visible || this._gone) return;
    if (!this.pickerCurrent(picker)) { this._picker = null; this.render(); return; }
    if (!picker.settled || this._readFlight || !this._authorized || !this.data.verified) return;
    this._picker = null;
    if (!this._canUpload || this.isPreview() || this.data.conflict) { this.render(); return; }
    if (picker.error) { this.render(); if (!/cancel/i.test(picker.error.errMsg || '')) this.setData({ uploadError: '微信原图选择失败，请重试。' }); return; }
    const f = picker.result && picker.result.tempFiles && picker.result.tempFiles[0], path = f && f.tempFilePath;
    if (typeof path !== 'string' || !path) { this.render(); this.setData({ uploadError: '微信未返回本地原图' }); return; }
    this._uploads.push({ id: model.requestId(), file: { file_path: path, name: f.name || path.split('/').pop() }, state: 'selected', included: true });
    this._edit++; this.render();
  },
  uploadOriginal(event) {
    const r = (this._uploads || [])[index(event)];
    if (!r || r.sent || !this.uploadWritable() || this.uploadBusy()) return;
    return this.performUpload(r, 'new');
  },
  async performUpload(r, mode) {
    const context = this.capture(true), flight = { r, context }; this._uploadFlight = flight;
    const active = () => this.current(context) && this._authorized && !this.isPreview() && this._uploadFlight === flight && (this._uploads || []).includes(r);
    const options = { isActive: active };
    r.state = 'validating'; r.error = ''; r.canRetry = false; r.progress = null; this.render();
    try {
      const inspected = upload.file(await this.api.inspectPublicationFile(r.file.file_path, options), r.file.file_path);
      const file = Object.freeze(Object.assign({}, inspected, { name: typeof r.file.name === 'string' && r.file.name ? r.file.name : inspected.name }));
      if (!active()) return;
      if (r.sent && !upload.sameFile(file, r.file)) throw new Error('本地原图已变化，禁止按原请求替换文件；请只读核对');
      if (!r.sent) {
        r.file = file; r.binding = Object.freeze({ shop_id: this.session.get().shop.id, activity_id: this._ids.activityId, application_id: this._ids.id });
        r.actorId = this.session.get().userId; r.requestId = r.id; r.key = this.uploadKey(); r.sent = true;
        this.rememberUpload(r);
      }
      if (mode === 'new' || mode === 'not_found') {
        r.state = 'creating'; this.render();
        const row = await this.api.createPublicationUpload(r.binding, upload.fingerprint(r.file), r.requestId, options);
        if (!active()) return;
        r.intent = upload.intent(row, r); this.rememberUpload(r);
      }
      if (!r.intent) throw new Error('缺少已核验的原上传意图，请只读核对');
      if (mode !== 'uploaded_unverified') {
        r.state = 'uploading'; this.render();
        const transfer = await this.api.transferPublicationFile(r.intent, r.file, progress => {
          if (active() && progress && Number.isFinite(progress.progress) && progress.progress >= 0 && progress.progress <= 100) { r.progress = progress.progress; this.render(); }
        }, options);
        if (!active()) return;
        if (!transfer || transfer.transferred !== true || transfer.intent_id !== r.intent.intent_id || transfer.path !== r.intent.path) throw new Error('传输回执不匹配，尚未验证原图');
      }
      r.state = 'verifying'; this.render();
      const row = await this.api.commitPublicationUpload(r.intent, options);
      if (!active()) return;
      const result = upload.verified(row, r);
      if (result.state !== 'verified') throw new Error('此上传已被使用，请核对当前发布记录，不能视为本次成功');
      this.acceptUpload(r, result);
    } catch (error) {
      if (!active()) return;
      r.state = r.sent ? 'unknown' : 'selected'; r.error = error.message || '原图上传未确认，请重试或核对';
      if (r.sent) { r.everUnknown = true; if (error.code === 'request_id_conflict') r.blocked = true; this.rememberUpload(r); }
      if (error.status === 401 || error.status === 403) await this.failure(error, context);
    } finally { if (this._uploadFlight === flight) { this._uploadFlight = null; if (this.current(context)) this.render(); } }
  },
  acceptUpload(r, result) {
    r.state = 'ready'; r.hadReady = true; r.error = ''; r.canRetry = false; r.image = result.image;
    if (r.included && !this._draft.paths.includes(r.intent.path)) this._draft.paths.push(r.intent.path);
    this.rememberUpload(r);
  },
  async checkUpload(event) {
    const r = (this._uploads || [])[index(event)];
    if (!r || !r.sent || this._gone || !this._visible || this.syncScope() || this.isPreview() || !this._authorized || !this.data.verified || this.uploadBusy() || this._readFlight || this._pending || this._confirmed || this._modalFlight) return;
    const context = this.capture(true), flight = { r, context }; this._uploadFlight = flight;
    const active = () => this.current(context) && this._authorized && !this.isPreview() && this._uploadFlight === flight;
    r.state = 'checking'; r.canRetry = false; r.error = ''; this.render();
    try {
      const params = Object.assign({}, r.binding, { request_id: r.requestId }); if (r.intent) params.intent_id = r.intent.intent_id;
      const row = await this.api.publicationUploadStatus(params, { isActive: active });
      if (!active()) return;
      const result = upload.status(row, r);
      if (result.intent) r.intent = result.intent;
      r.lastStatus = result.state;
      if (result.state === 'verified') this.acceptUpload(r, result.verified);
      else if (result.state === 'consumed' && this._server.publish.screenshots.includes(r.intent.path)) { this.acceptUpload(r, result.verified); r.associated = true; r.terminal = true; }
      else if (['expired', 'object_changed', 'consumed'].includes(result.state)) { r.state = 'blocked'; r.terminal = true; r.error = '原图已过期、变化或已被使用，不能用于此次关联；可明确移除此引用。'; }
      else { r.state = 'unknown'; r.canRetry = !r.blocked && this._canUpload; r.error = result.state === 'not_found' ? '未查到回执不代表失败；不会自动重发或更换请求。' : '原上传尚未验证，可再次确认后继续原请求。'; }
      this.rememberUpload(r);
    } catch (error) {
      if (!active()) return;
      r.state = 'unknown'; r.error = error.message || '上传状态核对失败'; this.rememberUpload(r);
      if (error.status === 401 || error.status === 403) await this.failure(error, context);
    } finally { if (this._uploadFlight === flight) { this._uploadFlight = null; if (this.current(context)) this.render(); } }
  },
  async retryUpload(event) {
    const r = (this._uploads || [])[index(event)];
    if (!r || !r.canRetry || r.blocked || !this.uploadWritable() || this.uploadBusy()) return;
    const context = this.capture(true);
    if (!await this.modal(context, '继续原图上传请求', '将重新核验同一原图，沿用原请求编号和固定路径；已有对象只验证，不覆盖。查不到回执不代表失败。')) return;
    if (!this.current(context) || !this.uploadWritable() || !(this._uploads || []).includes(r)) return;
    r.everUnknown = true; return this.performUpload(r, r.lastStatus);
  },
  removeUpload(event) {
    const r = (this._uploads || [])[index(event)];
    if (!r || this._gone || !this._visible || this.syncScope() || this.isPreview() || !this._authorized || !this.data.verified || !this.data.canManage || !this._draft) return;
    if (this._readFlight || this._pending || this._confirmed || this._modalFlight || this._writeFlight || this.uploadBusy() || !removable(r)) return;
    if (!r.sent) this._uploads.splice(this._uploads.indexOf(r), 1);
    else { r.included = false; if (r.intent) this._draft.paths = this._draft.paths.filter(p => p !== r.intent.path); this.rememberUpload(r); }
    this._edit++; this.render();
  },
  async previewUpload(event) {
    const r = (this._uploads || [])[index(event)];
    if (!r || this._gone || !this._visible || this.syncScope() || !this._authorized || this.uploadBusy() || this._readFlight) return;
    const context = this.capture(true); await this.load();
    if (!this.current(context) || !this._authorized || !this.data.verified || this.data.conflict) return;
    try { await new Promise((resolve, reject) => wx.previewImage({ current: r.file.file_path, urls: [r.file.file_path], success: resolve, fail: reject })); }
    catch (_) { if (this.current(context)) this.setData({ uploadError: '本地原图暂不可预览；已上传路径及草稿仍保留。' }); }
  },
  eligibleUploads() { return (this._uploads || []).filter(r => r.included && r.state === 'ready' && r.intent && !this._baseline.publish.screenshots.includes(r.intent.path)); },
  completeUploads(payload) {
    const ids = payload.new_evidence_intents || [], entries = ram()[this.uploadKey()];
    if (entries) for (const r of this._uploads || []) if (r.intent && ids.includes(r.intent.intent_id)) delete entries[r.id];
    this._uploads = (this._uploads || []).filter(r => !r.intent || !ids.includes(r.intent.intent_id));
  }
};
