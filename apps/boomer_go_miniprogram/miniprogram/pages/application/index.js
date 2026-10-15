const { definePage } = require('../../shared/page');
const model = require('./model');
const uploads = require('./uploads');
const uploadModel = require('./upload-model');
function empty() { return { view: null, note: '', url: '', images: [], uploads: [], uploadBusy: false, canChoose: false, uploadError: '', canSubmit: false, canManage: false, canConfirm: false, verified: false, pending: false, receipt: null, saved: false, conflict: false, loading: false, sending: false, confirming: false, checkingStatus: false, canRetrySame: false, error: '', notice: '', readbackError: '' }; }
function memory() { const app = getApp(); if (!app._applicationPending) app._applicationPending = Object.create(null); return app._applicationPending; }
function freezePayload(payload) { const result = Object.assign({}, payload, { screenshots: Object.freeze(payload.screenshots.slice()) }); if (payload.new_evidence_intents) result.new_evidence_intents = Object.freeze(payload.new_evidence_intents.slice()); return Object.freeze(result); }
Page(definePage(Object.assign({}, uploads, {
  data: empty(),
  onLoad(query) {
    this._ids = { id: query.id || '', activityId: query.activityId || '' };
    this._visible = true; this._epoch = 0; this._edit = 0; this._scope = model.scope(this); this._initialShow = true;
    this.clearUploads();
    return this.load();
  },
  onShow() {
    if (this._gone) return;
    this._visible = true; const changed = this.syncScope();
    if (this._initialShow && !changed) { this._initialShow = false; return; }
    this._initialShow = false; return this.load();
  },
  onHide() {
    this.pauseUploads();
    this._visible = false; this._epoch++; this._readFlight = null; this._statusFlight = null; this._modalFlight = null; this._writeFlight = null; this._authorized = false;
    this.setData(empty());
  },
  onUnload() { this._gone = true; this._visible = false; this.clearPrivate(); },
  syncScope() { const scope = model.scope(this); if (scope === this._scope) return false; this._scope = scope; this.clearPrivate(); return true; },
  clearPrivate() {
    this.clearUploads();
    this._epoch++; this._edit++; this._server = null; this._baseline = null; this._draft = null; this._pending = null; this._confirmed = null; this._authorized = false;
    this._readFlight = null; this._statusFlight = null; this._modalFlight = null; this._writeFlight = null;
    if (!this._gone) this.setData(empty());
  },
  capture(edit) { return { scope: this._scope, epoch: this._epoch, edit: edit ? this._edit : undefined }; },
  current(c) { if (this._gone) return false; this.syncScope(); return this._visible && c.scope === this._scope && c.epoch === this._epoch && (c.edit === undefined || c.edit === this._edit); },
  isPreview() { return !!(this.preview || this.data.preview || getApp().preview); },
  key() { const u = this.session.get(); return u && u.shop ? JSON.stringify([u.userId, u.shop.id, this._ids.id]) : ''; },
  async failure(error, context, readback) {
    if (!this.current(context)) return;
    if (error.status === 401 || error.status === 403) {
      this.clearPrivate();
      if (error.status === 401) return this.run(async () => { throw error; }, { silent: true });
      this.setData({ error: '当前账号或门店无权查看此申请，请重新核验。' }); return;
    }
    const message = error.status === 404 ? '申请不存在或无权访问' : error.message || '加载失败，请重试';
    this.setData(readback ? { readbackError: message, notice: '本次操作回执已确认，详情回读失败；请只重读详情，不要再次发送。' } : { error: message });
  },
  async load(adopt) {
    if (this._gone || !this._visible || this._uploadFlight) return;
    this.syncScope(); if (this._readFlight) return;
    const u = this.session.get();
    if (typeof this._ids.id !== 'string' || typeof this._ids.activityId !== 'string' || !model.UUID.test(this._ids.id) || !model.UUID.test(this._ids.activityId) || !u || !u.shop || !u.shop.id) { this.setData({ error: '缺少有效申请、活动或已验证工作门店。', canSubmit: false }); return; }
    const context = this.capture(); this._readFlight = context; this._authorized = false;
    this.setData({ loading: true, canSubmit: false, canRetrySame: false, verified: false, error: '', readbackError: '' });
    try {
      const caps = await this.api.action('activity-capabilities', { shop_id: u.shop.id });
      if (!this.current(context)) return;
      if (!caps || caps.shop_id !== u.shop.id || typeof caps.can_manage !== 'boolean' || typeof caps.can_confirm_publish !== 'boolean' || typeof caps.can_upload_evidence !== 'boolean') throw new Error('活动权限回执不匹配');
      if (!caps.can_manage) throw Object.assign(new Error('当前账号没有活动管理权限'), { status: 403 });
      const response = await this.api.action('application-detail', { shop_id: u.shop.id, application_id: this._ids.id });
      if (!this.current(context)) return;
      const server = model.parseDetail(response, this._ids, u.shop.id);
      this._server = server; this._authorized = true;
      this._canUpload = caps.can_upload_evidence && uploadModel.policy(caps.upload_policy);
      this.setData({ canManage: true, canConfirm: caps.can_confirm_publish, verified: true });
      if (!this._baseline || adopt === true) { this._baseline = server; this._draft = model.draftFrom(server.publish); this._edit++; }
      if (!this._confirmed) this.restorePending();
      this.restoreUploads();
      this.render();
    } catch (error) {
      if (this.current(context)) { this._authorized = false; this.setData({ verified: false, canSubmit: false, canChoose: false }); }
      await this.failure(error, context, !!this._confirmed);
    }
    finally { if (this._readFlight === context) { this._readFlight = null; if (this.current(context)) { this.setData({ loading: false }); this.resumeUploadPicker(); } } }
  },
  restorePending() {
    if (!this._authorized || !this._server || this.isPreview()) return false;
    const key = this.key(), record = memory()[key];
    if (!record) return false;
    if (record.activityId !== this._ids.activityId || !record.payload || record.payload.activity_id !== this._ids.activityId) throw new Error('未决请求与活动不匹配，不能恢复');
    this._pending = { key, activityId: record.activityId, payload: freezePayload(record.payload), unknown: true, retryBlocked: record.retryBlocked };
    this.remember(this._pending); this._draft = { note: record.payload.note || '', url: record.payload.url || '', paths: record.payload.screenshots.slice() };
    return true;
  },
  remember(pending) {
    const entries = memory(), old = entries[pending.key];
    if (old && JSON.stringify(old.payload) !== JSON.stringify(pending.payload)) return false;
    pending.unknown = pending.unknown === true || !!(old && old.unknown); pending.retryBlocked = pending.retryBlocked === true || !!(old && old.retryBlocked);
    entries[pending.key] = { activityId: pending.activityId, payload: freezePayload(pending.payload), unknown: pending.unknown, retryBlocked: pending.retryBlocked };
    return true;
  },
  forget(pending) { const entries = memory(), old = entries[pending.key]; if (old && JSON.stringify(old.payload) === JSON.stringify(pending.payload)) delete entries[pending.key]; },
  render() {
    const s = this._server, d = this._draft;
    if (!s || !d || !this._authorized || !this._visible) return;
    const conflict = this._baseline.version !== s.version;
    const images = d.paths.map((path, i) => { const ready = (this._uploads || []).find(r => r.state === 'ready' && r.intent && r.intent.path === path); return model.imageView(s.images.find(v => v.path === path) || (ready && ready.image) || { available: false, url: '', status: '原路径保留，暂不可预览' }, i); });
    const view = { title: s.title, platform: s.platform, name: s.name, phoneTail: s.phoneTail, applicationStatus: s.status, publishStatus: s.publish.confirmed ? '已确认发布' : '待确认发布', confirmed: s.publish.confirmed, time: model.time(s.publish.confirmed_at), checkedAt: model.time(s.serverTime), shopName: this.session.get().shop.name || '当前授权门店', answers: s.answers.map((a, i) => ({ key: a.key, label: a.label, type: a.type, value: a.value, image: a.image ? model.imageView(a.image, i) : null })) };
    const patch = Object.assign({}, this.uploadView(), { view, note: d.note, url: d.url, images, conflict, pending: !!this._pending, canSubmit: !this.isPreview() && this.data.canConfirm && !this._pending && !this._confirmed && !conflict && !this.uploadBusy() && !this.uploadsBlock(), notice: this._pending ? '存在结果待确认的原请求，请显式只读核对，不会自动重发。' : conflict ? '服务器版本已变化。当前草稿保留，请核对后显式载入最新。' : '' });
    patch.canChoose = patch.canChoose && !conflict;
    if (this._confirmed) {
      const matched = model.readbackMatches(s, this._confirmed);
      patch.receipt = { target: this._confirmed.receipt.target_confirmed ? '确认发布' : '撤销发布确认', time: model.time(this._confirmed.receipt.confirmed_at) };
      patch.saved = matched; patch.readbackError = matched ? '' : '回读版本或发布字段尚未一致，请重读详情';
      patch.notice = matched ? '本次操作已保存，服务器详情已回读。' : '本次操作回执已确认，但详情回读尚未一致；不会再次发送。';
    }
    this.setData(patch);
  },
  onNote(event) { this.edit('note', event.detail.value); },
  onUrl(event) { this.edit('url', event.detail.value); },
  edit(field, value) {
    if (this._gone || !this._visible || this.syncScope() || !this._draft || !this._authorized || this._pending || this._confirmed || this.uploadBusy() || this._readFlight) return;
    this._edit++; this._draft[field] = value; this.setData({ [field]: value, error: '', saved: false });
  },
  removeEvidence(event) {
    if (this._gone || !this._visible || this.syncScope() || !this._draft || !this._authorized || this._pending || this._confirmed || this.uploadBusy() || this._readFlight || this.uploadsBlock()) return;
    const index = Number(event.currentTarget.dataset.index); if (!Number.isInteger(index) || index < 0 || index >= this._draft.paths.length) return;
    const path = this._draft.paths[index], added = (this._uploads || []).find(r => r.intent && r.intent.path === path);
    if (added) { added.included = false; this.rememberUpload(added); }
    this._edit++; this._draft.paths.splice(index, 1); this.render();
  },
  async modal(context, title, content) {
    if (this._modalFlight) return false;
    this._modalFlight = context; this.setData({ confirming: true });
    try { const answer = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject })); return answer.confirm === true && this.current(context); }
    catch (_) { return false; }
    finally { if (this._modalFlight === context) { this._modalFlight = null; if (this.current(context)) this.setData({ confirming: false }); } }
  },
  async reloadLatest() {
    if (!this._visible || this._gone || this.syncScope() || this._pending || this._confirmed || this.uploadBusy() || this.uploadsBlock() || !this.data.conflict) return;
    const context = this.capture(true);
    if (await this.modal(context, '载入最新版本', '将放弃当前未保存修改，重新读取服务器申请。不会执行发布确认。')) { for (const r of this._uploads || []) { r.included = false; this.rememberUpload(r); } return this.load(true); }
  },
  confirmPublish() { return this.confirmTarget(true); },
  cancelPublish() { return this.confirmTarget(false); },
  async confirmTarget(target) {
    if (typeof target !== 'boolean' || this._gone || !this._visible || this.syncScope() || this.isPreview() || !this._authorized || !this.data.canSubmit || !this.data.verified || this._pending || this._confirmed || this._modalFlight || this._writeFlight || this._readFlight) return;
    if (this.restorePending()) { this.render(); return; }
    const context = this.capture(true), baseline = this._baseline;
    let normalized;
    const added = this.eligibleUploads();
    try { normalized = model.normalizeDraft(this._draft, baseline.publish.screenshots.concat(added.map(r => r.intent.path))); } catch (error) { await this.failure(error, context); return; }
    const accepted = await this.modal(context, target ? '确认发布记录' : '撤销发布确认', this.data.view.title + '\n门店：' + this.data.view.shopName + '\n只更新发布记录，不会发券、发短信或发布到社交平台。');
    if (!accepted || !this.current(context) || this.isPreview() || this._baseline !== baseline || !this.data.canSubmit || !this._authorized) return;
    if (this.restorePending()) { this.render(); return; }
    const u = this.session.get();
    const body = { shop_id: u.shop.id, activity_id: this._ids.activityId, application_id: this._ids.id, request_id: model.requestId(), expected_version: baseline.version, target_confirmed: target, note: normalized.note, url: normalized.url, screenshots: normalized.screenshots };
    const retained = added.filter(r => normalized.screenshots.includes(r.intent.path)).map(r => r.intent.intent_id);
    if (retained.length) body.new_evidence_intents = [...new Set(retained)];
    const payload = freezePayload(body);
    const pending = { key: this.key(), activityId: this._ids.activityId, payload, unknown: false, retryBlocked: false };
    this._pending = pending; return this.send(pending, context);
  },
  async send(pending, context) {
    if (!this.current(context) || this.isPreview() || !this._authorized || !this.data.canConfirm || this._pending !== pending || this._writeFlight || pending.activityId !== this._ids.activityId || pending.payload.activity_id !== this._ids.activityId) return;
    if (!this.remember(pending)) { this.restorePending(); this.render(); return; }
    this._writeFlight = pending; this.setData({ sending: true, pending: true, canSubmit: false, canRetrySame: false, error: '', notice: '正在提交，请勿重复操作。' });
    try {
      const row = await this.api.action('publication-confirm', pending.payload);
      if (!this.current(context) || this._pending !== pending) return;
      if (!model.receiptValid(row, pending.payload, pending.activityId, this.session.get().userId)) throw new Error('操作回执不匹配，结果仍待确认');
      await this.acceptReceipt(row, pending, context);
    } catch (error) {
      if (this.current(context) && this._pending === pending && !this._confirmed) {
        const owned = this.remember(pending);
        if (owned && !pending.unknown && model.transactionAborted(error)) {
          this.forget(pending); this._pending = null; this._authorized = false;
          this.setData({ pending: false, canSubmit: false, verified: false, notice: '此次请求已明确中止。草稿保留，请重新读取服务器版本后再操作。' });
        } else { pending.unknown = true; if (error.code === 'request_id_conflict') pending.retryBlocked = true; this.remember(pending); this.setData({ notice: '操作结果待确认，请显式核对原请求；不会自动重发。' }); }
      }
      await this.failure(error, context);
    } finally { if (this._writeFlight === pending) { this._writeFlight = null; if (this.current(context)) this.setData({ sending: false }); } }
  },
  async acceptReceipt(row, pending, context) {
    if (!this.current(context) || this._pending !== pending) return;
    this.forget(pending); this._confirmed = { receipt: row, payload: pending.payload }; this._pending = null;
    this.completeUploads(pending.payload);
    this.setData({ pending: false, canSubmit: false, canRetrySame: false, receipt: { target: row.target_confirmed ? '确认发布' : '撤销发布确认', time: model.time(row.confirmed_at) }, saved: false, notice: '本次操作回执已确认，正在回读详情。', error: '' });
    return this.load();
  },
  async reconcile() {
    if (this._gone || !this._visible || this.syncScope() || this.isPreview() || !this._authorized || !this.data.verified || !this._pending || this._statusFlight || this._writeFlight || this._modalFlight || this._readFlight) return;
    const pending = this._pending, context = this.capture(); this._statusFlight = context;
    if (pending.activityId !== this._ids.activityId || pending.payload.activity_id !== this._ids.activityId) { this._statusFlight = null; return; }
    this.setData({ checkingStatus: true, canRetrySame: false, error: '' });
    try {
      const p = pending.payload;
      const row = await this.api.action('publication-confirm-status', { shop_id: p.shop_id, activity_id: p.activity_id, application_id: p.application_id, request_id: p.request_id });
      if (!this.current(context) || this._pending !== pending) return;
      if (row && row.state === 'not_found') this.setData({ canRetrySame: this.data.canConfirm && !pending.retryBlocked, notice: '尚未查到此次回执，不代表失败或取消。可稍后核对，或再次明确确认后按原请求重试。' });
      else if (row && row.state === 'succeeded' && model.receiptValid(row, p, pending.activityId, this.session.get().userId)) await this.acceptReceipt(row, pending, context);
      else throw new Error('状态回执不匹配，不能视为本次成功');
    } catch (error) { await this.failure(error, context); }
    finally { if (this._statusFlight === context) { this._statusFlight = null; if (this.current(context)) this.setData({ checkingStatus: false }); } }
  },
  async retrySame() {
    if (this._gone || !this._visible || this.syncScope() || this.isPreview() || !this._authorized || !this.data.canRetrySame || this._modalFlight || this._statusFlight || this._readFlight || this._writeFlight) return;
    const pending = this._pending, context = this.capture(true);
    if (!pending || pending.retryBlocked) return;
    if (await this.modal(context, '按原请求重试', '查不到回执不代表失败。将使用同一个请求编号、原版本和原始草稿重试，不会新建请求。')) {
      if (!this.current(context) || this._pending !== pending || this.isPreview()) return;
      pending.unknown = true; return this.send(pending, context);
    }
  },
  async previewEvidence(event) { return this.previewImage('publish', Number(event.currentTarget.dataset.index)); },
  async previewAnswer(event) { return this.previewImage('answer', Number(event.currentTarget.dataset.index)); },
  async previewImage(type, index) {
    if (this._gone || !this._visible || this.syncScope() || !this._authorized || !Number.isInteger(index) || index < 0 || this._readFlight || this.uploadBusy()) return;
    const context = this.capture(true);
    const path = type === 'publish' ? this._draft.paths[index] : this._server.answers[index] && this._server.answers[index].image && this._server.answers[index].image.path;
    if (!path) return;
    await this.load();
    if (!this.current(context) || !this._authorized || !this.data.verified || this.data.conflict) return;
    const added = (this._uploads || []).find(r => r.state === 'ready' && r.intent && r.intent.path === path);
    const source = type === 'publish' ? this._server.images.find(r => r.path === path) || (added && added.image) : this._server.answers.map(a => a.image).find(r => r && r.path === path);
    if (!source || !source.available) { this.setData({ error: '该原图暂不可预览，原路径及草稿已保留。' }); return; }
    try { await new Promise((resolve, reject) => wx.previewImage({ current: source.url, urls: [source.url], success: resolve, fail: reject })); }
    catch (_) { if (this.current(context)) this.setData({ error: '原图预览失败，可重新读取签名；原路径已保留。' }); }
  },
  async copyUrl() {
    if (this._gone || !this._visible || this.syncScope() || !this._authorized || !this._draft || !this._draft.url.trim()) return;
    const context = this.capture();
    try { await this.api.copy(this._draft.url.trim()); } catch (error) { await this.failure(error, context); }
  },
  refresh() { return this.load(); }
})));
