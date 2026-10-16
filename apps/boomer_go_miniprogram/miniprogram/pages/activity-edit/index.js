const { definePage } = require('../../shared/page');
const model = require('./model');
const form = model.form;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

Page(definePage({
  data: model.empty(),
  onLoad(query) {
    this._id = typeof query.id === 'string' ? query.id.toLowerCase() : '';
    this._routeValid = !own(query, 'id') || typeof query.id === 'string' && model.uuid(query.id);
    this._visible = true; this._firstShow = true; this._epoch = 0; this._edit = 0; this._scope = this.scope(); this._candidateSeq = 0;
    this._initialLoad = this.refresh(); return this._initialLoad;
  },
  onShow() { this._visible = true; const first = this._firstShow; this._firstShow = false; if (first && this._scope === this.scope()) return this._initialLoad; return this.refresh(); },
  onHide() { this.pause(); },
  onUnload() { this.pause(); this._draft = null; this._base = null; this._server = null; this._pending = null; this._dates = null; },
  paint(value) { if (this._gone || !this._visible) Object.assign(this.data, value); else this.setData(value); },
  scope() { const s = this.session.get(); return JSON.stringify([s && s.userId, s && s.shop && s.shop.id, s && s.scopeVersion, this.session.revision ? this.session.revision() : null, !!this.preview]); },
  isPreview() { return !!(this.preview || this.data.preview || getApp().preview); },
  context() { return { scope: this._scope, epoch: this._epoch, id: this._id }; },
  current(c) { return !!(c && this._visible && !this._gone && c.epoch === this._epoch && c.scope === this.scope() && c.scope === this._scope && c.id === this._id); },
  syncScope() {
    const scope = this.scope(); if (scope === this._scope) return false;
    if (this._pending && !this._pending.receipt) this._pending.unknown = true;
    this._scope = scope; this._epoch++; this._edit++; this._authorized = false; this._detailReady = false; this._caps = null; this._read = null; this._flight = null; this._modal = null;
    this._draft = null; this._base = null; this._server = null; this._pending = null; this._completed = null; this._conflict = false; this._dates = null; this._candidates = []; this._candidateSeq++; this._voucherOpen = false;
    this.paint(model.empty()); return true;
  },
  stale() { if (!this._gone && this._scope !== this.scope()) this.syncScope(); },
  pause() {
    this._visible = false; this._firstShow = false; this._epoch++; this._candidateSeq++;
    if (this._pending && !this._pending.receipt) this._pending.unknown = true;
    this._authorized = false; this._detailReady = false; this._read = null; this._flight = null; this._modal = null; this._candidates = []; this._voucherOpen = false; this.paint(model.empty());
  },
  binding() {
    const s = this.session.get(); model.check(this._routeValid && s && model.uuid(s.userId) && s.shop && model.uuid(s.shop.id), '请从有效入口进入，并登录选择已验证授权门店');
    return { actor: s.userId, shop: s.shop.id };
  },
  memoryKey() { const b = this.binding(); return model.key(b.actor, b.shop, this._id); },
  async failure(e, c, readback = false) {
    if (!this.current(c)) { this.stale(); return; }
    if (e.status === 401 || e.status === 403) {
      this._authorized = false; this._detailReady = false; this._candidateSeq++; this._candidates = []; this.paint(model.empty());
      if (e.status === 401) { const safe = new Error('员工登录已失效，请重新登录'); safe.status = 401; safe.code = e.code; safe.requestRevision = e.requestRevision; await this.run(async () => { throw safe; }, { silent: true }); }
      else this.paint({ error: '当前员工或门店权限不可用；原请求保留，恢复权限后请重新核对。' });
      return;
    }
    this.paint(readback ? { readbackError: model.errorText(e), notice: '本次原回执已确认，详情尚未核对；只能只读回查，不能再次发送。' } : { error: model.errorText(e) });
  },
  async authorize(c) {
    const b = this.binding(), raw = await this.api.action('activity-manage-capabilities', { shop_id: b.shop });
    if (!this.current(c)) { this.stale(); return false; }
    this._caps = model.caps(raw, b.shop); this._authorized = this._caps.canView && this._caps.canManage;
    if (!this._authorized) { this.paint(model.empty()); this.paint({ notice: '当前没有本店活动维护权限；能阅读活动不代表可以维护。' }); }
    return this._authorized;
  },
  restorePending() {
    if (this.isPreview()) return;
    const record = model.ram(getApp())[this.memoryKey()]; if (!record) return;
    const b = this.binding(), p = record.payload;
    model.check(record.actorId === b.actor && record.shopId === b.shop && record.targetId === this._id && p && p.shop_id === b.shop && model.uuid(p.request_id) && ['create', 'update', 'set_status', 'delete'].indexOf(p.operation) >= 0);
    model.check(this._id ? p.activity_id === this._id && p.operation !== 'create' && typeof p.expected_version === 'string' && /^[0-9a-f]{64}$/.test(p.expected_version) : p.operation === 'create' && !own(p, 'activity_id') && !own(p, 'expected_version'));
    if (record.receipt) record.receipt = model.receipt(record.receipt, p, b.actor);
    record.unknown = true; this._pending = record; this._draft = form.cloneJson(record.draft); this._base = form.cloneJson(record.base); this.initDates();
  },
  async refresh(adopt = false) {
    if (!this._visible || this._gone) return;
    this.syncScope(); if (this._read || this._flight || this._modal) return;
    this._epoch++; this._candidateSeq++; this._candidates = []; this._voucherOpen = false; this._authorized = false; this._detailReady = false;
    const c = this.context(); this._read = c; this.paint(Object.assign(model.empty(), { loading: true }));
    try {
      const b = this.binding(); if (!await this.authorize(c)) return;
      this.restorePending();
      if (this._completed) { this.paint({ saved: true, receiptConfirmed: true, deleted: this._completed.deleted, notice: '本次原回执与详情已核验。请返回列表查看当前内容。' }); return; }
      let server = null;
      if (this._id) {
        try { const raw = await this.api.action('activity-manage-detail', { shop_id: b.shop, activity_id: this._id }); if (!this.current(c)) { this.stale(); return; } server = model.detail(raw, b.shop, this._id); }
        catch (e) {
          if (!this.current(c)) { this.stale(); return; }
          if (!(e.status === 404 && e.code === 'not_found' && this._pending)) {
            if (this._pending && model.ram(getApp())[this.memoryKey()] === this._pending && e.status !== 401 && e.status !== 403) {
              this._server = null; this._retryAllowed = false;
              await this.failure(e, c, !!this._pending.receipt); return;
            }
            throw e;
          }
        }
      }
      if (!this.current(c)) return;
      this._server = server; this._detailReady = !this._id || !!server;
      if (!this._pending && (!this._draft || adopt === true)) {
        this._base = server; this._draft = server ? form.cloneJson(server.activity) : { name: '', description: null, voucher_id: null, form_fields: [{ key: 'screenshot', label: '主页截图', type: 'image', required: true }], status: 'active', starts_at: null, ends_at: null, min_followers: 1000 };
        this._edit++; this.initDates(); if (adopt === true) this._conflict = false;
      }
      if (!this._pending && this._base && server && this._base.version !== server.version) this._conflict = true;
      this.render(); if (this._pending && this._pending.receipt) await this.readback(this._pending, c, server);
    } catch (e) { if (this.current(c)) { this._authorized = false; this.paint({ editable: false, canSave: false, canDelete: false, canSetStatus: false }); } await this.failure(e, c, !!(this._pending && this._pending.receipt)); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) { this.paint({ loading: false }); this.render(); } } }
  },
  initDates() {
    this._dates = {}; this._dateErrors = {};
    ['starts_at', 'ends_at'].forEach(key => { const p = model.dateParts(this._draft && this._draft[key]); this._dates[key] = { date: p.date, time: p.time, changed: false }; });
  },
  buildPatch() {
    model.check(this._draft, '尚未读取活动草稿');
    ['starts_at', 'ends_at'].forEach(key => { const p = this._dates && this._dates[key]; model.check(!p || !p.changed || p.date && p.time, '请补全本次修改的日期和时间，旧时间不会自动补齐'); model.check(!this._dateErrors || !this._dateErrors[key], this._dateErrors && this._dateErrors[key]); });
    return model.patch(this._base ? this._base.activity : null, this._draft);
  },
  dirty() { try { return !!this._draft && Object.keys(this.buildPatch()).length > 0; } catch (_) { return true; } },
  editable() { return this._visible && !this._gone && this._scope === this.scope() && this._authorized && this._detailReady && !!this._draft && !this._pending && !this._completed && !this._conflict && !this._read && !this._flight; },
  render() {
    if (!this._visible || this._gone || !this._authorized) return;
    const d = this._detailReady ? this._draft : null, pending = this._pending, busy = !!this._flight, ready = this.editable();
    let validation = '', patch = {}; if (d) try { patch = this.buildPatch(); } catch (e) { validation = e.message; }
    const dates = this._dates || {}, start = dates.starts_at || {}, end = dates.ends_at || {}, selected = this._candidates && d && this._candidates.find(x => x.id === d.voucher_id), v = this._server && this._server.voucher;
    const preview = this.isPreview(), completed = this._completed;
    this.paint({ editorVisible: !!d, name: d && typeof d.name === 'string' ? d.name : '', description: d && typeof d.description === 'string' ? d.description : '', minFollowers: d && d.min_followers != null ? String(d.min_followers) : '', statusLabel: d ? model.statusLabel(d.status) : '', createMode: !this._id, createStatus: d && d.status || 'active', reviewLabel: this._id && d ? (d.requires_review ? '原报名审核设置：需审核（保留，不可编辑）' : '原报名审核设置：无需审核（保留，不可编辑）') : '创建时由服务器设置无需审核，本页不发送审核标志。',
      shopName: this.session.get().shop.name || '当前授权门店', startDate: start.date || '', startTime: start.time || '', endDate: end.date || '', endTime: end.time || '', fields: d ? model.fieldViews(d.form_fields, this._expanded) : [], fieldsMalformed: !!d && !Array.isArray(d.form_fields),
      voucherName: selected ? selected.name : v && d && v.id === d.voucher_id ? v.name || '未命名原关联券' : d && d.voucher_id ? '原关联券信息不可用（保留原标识）' : '请选择本店已有券', voucherNotice: v && d && v.id === d.voucher_id && (!v.active || v.deleted) ? '原关联券已停用或删除，未改关联时保留原值；重新选券须由服务器核验。' : '',
      editable: !!ready, canSave: !!(ready && !this._modal && !preview && !validation && (!this._id || Object.keys(patch).length)), canDelete: !!(ready && this._id && !this._modal && !preview), canSetStatus: !!(ready && this._id && !this._modal && !preview && !validation && !Object.keys(patch).length), dirty: !!d && (validation ? this.dirty() : !!Object.keys(patch).length), validation,
      pending: !!pending, receiptConfirmed: !!(completed || pending && pending.receipt), saved: !!completed, deleted: !!(completed && completed.deleted), sending: busy, confirming: !!this._modal, conflict: !!this._conflict, canReconcile: !!(pending && !this._read && !busy && !this._modal && !preview), canRetrySame: !!(pending && this._retryAllowed && !pending.receipt && !pending.retryBlocked && !this._read && !busy && !preview),
      notice: completed ? completed.deleted ? '删除原回执及独立不存在状态已核验；已发放优惠券不受本次删除影响。' : '本次原回执与完整活动详情已核验。' : pending ? pending.receipt ? '本次原回执已确认，详情尚待核对；不能再次发送。' : pending.statusNotFound ? '尚未查到原回执，不代表失败、取消或未执行。只能稍后核对，或再次确认按同一原请求重试。' : '存在结果未确认的原请求。请显式只读核对；不会自动重发或另建编号。' : this._conflict ? '云端版本已变化，本地草稿保留。请明确载入最新版本后再操作。' : preview ? '' : '保存和状态变更分别明确确认；不执行发券、审核或短信。' });
  },
  onText(e) {
    if (this.syncScope() || !this.editable()) return;
    const key = e.currentTarget.dataset.field; if (['name', 'description', 'min_followers'].indexOf(key) < 0 || typeof e.detail.value !== 'string') return;
    const value = e.detail.value; this._draft[key] = key === 'min_followers' && /^\d+$/.test(value) ? Number(value) : value; this._edit++; this.paint({ error: '' }); this.render();
  },
  onCreateStatus(e) { if (this.syncScope() || !this.editable() || this._id) return; const status = e.currentTarget.dataset.status; if (status !== 'active' && status !== 'draft') return; this._draft.status = status; this._edit++; this.render(); },
  onDatePart(e) {
    if (this.syncScope() || !this.editable()) return; const key = e.currentTarget.dataset.field, part = e.currentTarget.dataset.part, value = e.detail.value;
    if (['starts_at', 'ends_at'].indexOf(key) < 0 || ['date', 'time'].indexOf(part) < 0 || typeof value !== 'string' || this._dates[key][part] === value) return;
    const p = this._dates[key]; p[part] = value; p.changed = true; this._edit++; delete this._dateErrors[key];
    if (p.date && p.time) try { const old = this._base && model.dateParts(this._base.activity[key]); this._draft[key] = old && old.date === p.date && old.time === p.time ? this._base.activity[key] : form.shanghaiToISO(p.date, p.time); } catch (error) { this._dateErrors[key] = error.message; }
    this.render();
  },
  toggleField(e) { if (this.syncScope() || !this._authorized || !this._detailReady) return; const key = e.currentTarget.dataset.key; if (!this.data.fields.some(x => x.key === key && !x.invalid)) return; this._expanded = this._expanded === key ? null : key; this.render(); },
  changeFields(task) { if (this.syncScope() || !this.editable()) return; try { this._draft.form_fields = task(this._draft.form_fields); this._edit++; this.paint({ error: '' }); } catch (_) { this.paint({ error: '该字段或选项无法安全修改，原定义保留；请核对类型、角色与完整选项。' }); } this.render(); },
  onFieldText(e) { const key = e.currentTarget.dataset.key, field = e.currentTarget.dataset.field; if (['label', 'placeholder'].indexOf(field) < 0) return; this.changeFields(rows => model.draftField(rows, key, { [field]: e.detail.value })); },
  onFieldRequired(e) { if (typeof e.detail.value !== 'boolean') return; this.changeFields(rows => model.draftField(rows, e.currentTarget.dataset.key, { required: e.detail.value })); },
  onFieldType(e) { const value = e.detail.value; if (!/^(0|[1-5])$/.test(String(value))) return; const selected = model.TYPE_OPTIONS[Number(value)]; if (selected) this.changeFields(rows => model.draftField(rows, e.currentTarget.dataset.key, { type: selected.value })); },
  onFieldRole(e) { const row = this.data.fields.find(x => x.key === e.currentTarget.dataset.key); if (!row || !/^(0|[1-2])$/.test(String(e.detail.value))) return; const selected = row.roleOptions[Number(e.detail.value)]; if (selected) this.changeFields(rows => model.draftField(rows, row.key, { role: selected.value })); },
  addField() { this.changeFields(rows => form.addField(rows, { key: 'field_' + model.requestId(), label: '新字段', type: 'text', required: false })); },
  addOption(e) { this.changeFields(rows => { const row = rows.find(x => x.key === e.currentTarget.dataset.key); model.check(row && (!own(row, 'options') || Array.isArray(row.options))); const options = own(row, 'options') ? row.options.slice() : []; options.push(''); return model.draftField(rows, row.key, { options }); }); },
  onOption(e) { this.changeFields(rows => { const row = rows.find(x => x.key === e.currentTarget.dataset.key), index = Number(e.currentTarget.dataset.index); model.check(row && Array.isArray(row.options) && Number.isInteger(index) && index >= 0 && index < row.options.length); const options = row.options.slice(); options[index] = e.detail.value; return model.draftField(rows, row.key, { options }); }); },
  removeOption(e) { this.changeFields(rows => { const row = rows.find(x => x.key === e.currentTarget.dataset.key), index = Number(e.currentTarget.dataset.index); model.check(row && Array.isArray(row.options) && Number.isInteger(index) && index >= 0 && index < row.options.length); const options = row.options.slice(); options.splice(index, 1); return model.draftField(rows, row.key, { options }); }); },
  moveField(e) { const key = e.currentTarget.dataset.key, direction = e.currentTarget.dataset.direction; if (direction !== 'up' && direction !== 'down') return; this.changeFields(rows => form.moveField(rows, key, rows.findIndex(x => x.key === key) + (direction === 'up' ? -1 : 1))); },
  async removeField(e) { if (this.syncScope() || !this.editable() || this._modal) return; const c = this.context(), key = e.currentTarget.dataset.key; if (!await this.modal(c, '移除报名字段', '只从本页草稿明确移除此字段，其他字段定义与元数据保持原样；仍需另行确认保存。')) return; if (this.current(c)) this.changeFields(rows => form.removeField(rows, key)); },
  async openVouchers() {
    if (this.syncScope() || !this.editable() || this._modal) return; this._voucherOpen = true; this._candidates = []; this._nextCursor = null; this._candidateSeq++;
    this.paint({ voucherOpen: true, vouchers: [], voucherError: '', voucherHasMore: false }); return this.fetchVouchers(false);
  },
  closeVouchers() { this._candidateSeq++; this._voucherOpen = false; this.paint({ voucherOpen: false, voucherLoading: false }); },
  moreVouchers() { if (!this.data.voucherHasMore || this.data.voucherLoading) return; return this.fetchVouchers(true); },
  async fetchVouchers(append) {
    if (!this.editable() || !this._voucherOpen || this.data.voucherLoading) return;
    const c = this.context(), seq = this._candidateSeq, b = this.binding(), p = { shop_id: b.shop, limit: 20 }; if (append && this._nextCursor) p.cursor = this._nextCursor;
    this.paint({ voucherLoading: true, voucherError: '' });
    const active = () => this.current(c) && this._voucherOpen && seq === this._candidateSeq;
    try { const raw = await this.api.action('activity-manage-voucher-candidates', p); if (!active()) { this.stale(); return; } const result = model.candidatePage(raw, p), old = append ? this._candidates : []; this._candidates = old.concat(result.items.filter(x => !old.some(y => y.id === x.id))); this._nextCursor = result.nextCursor; this.paint({ vouchers: this._candidates, voucherHasMore: result.hasMore }); }
    catch (e) { if (active()) { if (e.status === 401 || e.status === 403) await this.failure(e, c); else this.paint({ voucherError: model.errorText(e) }); } else this.stale(); }
    finally { if (active()) this.paint({ voucherLoading: false }); }
  },
  chooseVoucher(e) { if (this.syncScope() || !this.editable() || !this._voucherOpen || this.data.voucherLoading) return; const row = (this._candidates || []).find(x => x.id === e.currentTarget.dataset.id); if (!row) return; this._draft.voucher_id = row.id; this._edit++; this.closeVouchers(); this.render(); },
  async modal(c, title, content) {
    if (this._modal) return false; const token = { context: c, edit: this._edit }; this._modal = token; this.render();
    try { const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmText: '确认', confirmColor: '#EB0029', success: resolve, fail: reject })); return this.current(c) && this._modal === token && token.edit === this._edit && result.confirm === true; }
    catch (_) { return false; } finally { if (this._modal === token) { this._modal = null; if (this.current(c)) this.render(); } }
  },
  async reloadLatest() { if (this.syncScope() || !this._visible || !this._authorized || this._pending || this._read || this._flight || this._modal) return; const c = this.context(); if (await this.modal(c, '载入最新活动', '将放弃当前未保存草稿，重新读取权限和服务器版本；不会保存或变更状态。')) return this.refresh(true); },
  save() { return this.confirmOperation(this._id ? 'update' : 'create'); },
  remove() { return this.confirmOperation('delete'); },
  setStatus(e) { return this.confirmOperation('set_status', e.currentTarget.dataset.status); },
  async confirmOperation(operation, targetStatus) {
    if (this.syncScope() || !this.editable() || this.isPreview() || this._modal) return;
    let patch;
    try {
      if (operation === 'set_status') { if (!this._id || !['active', 'draft'].includes(targetStatus) || targetStatus === this._base.activity.status) return; if (this.dirty()) { this.paint({ notice: '请先保存或明确放弃基础资料草稿，再单独变更状态。' }); return; } patch = { status: targetStatus }; }
      else if (operation !== 'delete') { patch = this.buildPatch(); if (operation === 'update' && !Object.keys(patch).length) return; }
    } catch (e) { this.paint({ validation: e.message }); return; }
    if (operation === 'delete' && !this._id) return;
    const c = this.context(), base = this._base;
    const content = operation === 'delete' ? '删除“' + this.data.name + '”？删除后该活动所有申请记录都将一并清除，已发放的优惠券仍然有效。此操作不可恢复。未保存草稿不会另行保存。'
      : operation === 'set_status' ? this.data.shopName + '：' + model.statusLabel(base.activity.status) + ' → ' + model.statusLabel(targetStatus) + '。仅修改活动状态，不发券、不改变审核设置。'
      : this.data.shopName + '：确认' + (operation === 'create' ? '创建活动，初始状态为“' + model.statusLabel(patch.status || 'active') + '”' : '保存已修改的基础资料') + '？关联券、起止时间与报名字段请核对；不发券、不执行审核或短信。';
    if (!await this.modal(c, operation === 'delete' ? '不可恢复：删除活动' : operation === 'set_status' ? '确认变更状态' : '确认活动资料', content)) return;
    if (!this.current(c) || !this.editable() || this.isPreview() || base !== this._base) return;
    const memory = model.ram(getApp()), key = this.memoryKey(); if (memory[key]) { this.restorePending(); this.render(); return; }
    const b = this.binding(), payload = { shop_id: b.shop, operation, request_id: model.requestId() }; if (operation !== 'create') { payload.activity_id = this._id; payload.expected_version = base.version; } if (operation !== 'delete') payload.patch = patch;
    const record = { actorId: b.actor, shopId: b.shop, targetId: this._id, payload: model.frozen(form.cloneJson(payload)), base: model.frozen(form.cloneJson(base)), draft: model.frozen(form.cloneJson(this._draft)), expected: model.frozen(model.expected(base, payload)), unknown: false, retryBlocked: false, receipt: null };
    memory[key] = record; this._pending = record; this._retryAllowed = false; return this.send(record, c);
  },
  async send(record, c) {
    if (!this.current(c) || this.isPreview() || !this._authorized || !this._caps.canManage || this._pending !== record || record.receipt || this._flight) return;
    this._flight = record; this.paint({ error: '', readbackError: '' }); this.render();
    try { const raw = await this.api.action('activity-manage-write', record.payload); if (!this.current(c) || this._pending !== record) { record.unknown = true; this.stale(); return; } record.receipt = model.receipt(raw, record.payload, record.actorId); this.render(); await this.readback(record, c); }
    catch (e) { record.unknown = true; if (e.code === 'request_id_conflict') record.retryBlocked = true; if (this.current(c)) { if (e.code === 'version_conflict') this._conflict = true; await this.failure(e, c, !!record.receipt); } else this.stale(); }
    finally { if (this._flight === record) { this._flight = null; if (this.current(c)) this.render(); } }
  },
  async readback(record, c, known) {
    if (!this.current(c) || this._pending !== record || !record.receipt) return;
    try {
      let d = known;
      if (!d) try { const raw = await this.api.action('activity-manage-detail', { shop_id: record.payload.shop_id, activity_id: record.receipt.activity_id }); if (!this.current(c)) { this.stale(); return; } d = model.detail(raw, record.payload.shop_id, record.receipt.activity_id); }
      catch (e) { if (!(e.status === 404 && e.code === 'not_found' && record.payload.operation === 'delete')) throw e; }
      if (!this.current(c)) return;
      model.check(record.payload.operation === 'delete' ? !d : d && model.matches(d, record), '回读完整内容或版本与原请求不一致');
      const memory = model.ram(getApp()), key = model.key(record.actorId, record.shopId, record.targetId); if (memory[key] === record) delete memory[key];
      this._pending = null; this._completed = record.receipt; this._retryAllowed = false; this._conflict = false;
      if (d) { this._server = d; this._base = d; this._draft = form.cloneJson(d.activity); this._detailReady = true; this.initDates(); }
      else { this._draft = null; this._base = null; this._server = null; this._detailReady = false; }
      this.paint({ readbackError: '', error: '', loading: false }); this.render();
    } catch (e) { await this.failure(e, c, true); }
  },
  async retryReadback() {
    if (this.syncScope() || !this._visible || !this._authorized || this.isPreview() || !this._pending || !this._pending.receipt || this._read || this._flight || this._modal) return;
    const c = this.context(), record = this._pending; this._flight = c; this.paint({ loading: true });
    try { if (await this.authorize(c)) await this.readback(record, c); } catch (e) { await this.failure(e, c, true); }
    finally { if (this._flight === c) { this._flight = null; if (this.current(c)) { this.paint({ loading: false }); this.render(); } } }
  },
  async reconcile() {
    if (this.syncScope() || !this._visible || !this._authorized || this.isPreview() || !this._pending || this._read || this._flight || this._modal) return;
    if (this._pending.receipt) return this.retryReadback();
    const c = this.context(), record = this._pending, p = record.payload; this._flight = c; this._retryAllowed = false; this.paint({ loading: true, error: '' }); this.render();
    try {
      if (!await this.authorize(c) || !this.current(c)) return;
      const params = { shop_id: p.shop_id, request_id: p.request_id, operation: p.operation }; if (p.operation !== 'create') params.activity_id = p.activity_id;
      const raw = await this.api.action('activity-manage-write-status', params); if (!this.current(c) || this._pending !== record) { this.stale(); return; }
      const r = model.status(raw, p, record.actorId); if (r) { record.receipt = r; await this.readback(record, c); } else { record.statusNotFound = true; this._retryAllowed = !record.retryBlocked; }
    } catch (e) { if (e.code === 'request_id_conflict') record.retryBlocked = true; await this.failure(e, c); }
    finally { if (this._flight === c) { this._flight = null; if (this.current(c)) { this.paint({ loading: false }); this.render(); } } }
  },
  async retrySame() {
    if (this.syncScope() || !this._visible || !this._authorized || this.isPreview() || !this._pending || this._pending.receipt || this._pending.retryBlocked || !this._retryAllowed || this._read || this._flight || this._modal) return;
    const c = this.context(), record = this._pending;
    if (await this.modal(c, '按同一原请求重试', '查不到回执不代表未执行。将复用原编号、原版本和完整原载荷，不会替换草稿或自动建立新请求。')) { if (this.current(c) && this._pending === record && !this.isPreview()) { record.unknown = true; this._retryAllowed = false; return this.send(record, c); } }
  },
  retry() { return this.refresh(); },
  onPullDownRefresh() { return Promise.resolve(this.refresh()).finally(() => wx.stopPullDownRefresh()); }
}));
