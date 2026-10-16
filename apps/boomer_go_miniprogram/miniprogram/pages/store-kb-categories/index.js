const { definePage } = require('../../shared/page');
const model = require('./model');
function empty() { return { items: [], hasMore: false, canManage: false, canCreate: false, pendingRequests: [], shopName: '', typeLabel: '', editorVisible: false, name: '', sortText: '', scopeLabel: '', editable: false, canSave: false, canDelete: false, pending: false, receiptConfirmed: false, canRetrySame: false, saved: false, conflict: false, loading: false, sending: false, confirming: false, validation: '', error: '', readbackError: '', notice: '' }; }
Page(definePage({
  data: empty(),
  onLoad(q) { this._type = q.type; this._id = ''; this._epoch = 0; this._edit = 0; this._resource = null; this._page = -1; this._scope = model.scope(this); this._writeConflicts = new Set(); },
  onShow() { this._visible = true; return this.refresh(); },
  onHide() { this.pause(); },
  onUnload() { this.pause(); this.clearPrivate(); },
  pause() { this._visible = false; this._epoch++; this._read = null; this._flight = null; this._modal = null; this._authorized = false; model.records(getApp(), this).forEach(r => { if (!r.receipt) r.unknown = true; }); this.setData(empty()); },
  clearPrivate() { this._resource = null; this._draft = null; this._base = null; this._server = null; this._pending = null; this._writeConflict = false; this._writeConflictResource = null; this._writeConflicts = new Set(); this._needsRefresh = false; this._canManage = false; this._detailManage = false; this._authorized = false; this._read = null; this._flight = null; this._modal = null; },
  syncScope() { const scope = model.scope(this); if (scope === this._scope) return false; this._scope = scope; this._epoch++; this._edit++; this.clearPrivate(); this.setData(empty()); return true; },
  capture() { return { ...model.capture(this), resource: this._resource }; },
  current(c) { this.syncScope(); return model.active(this, c) && c.resource === this._resource; },
  isPreview() { return !!(this.preview || this.data.preview || getApp().preview); },
  async failure(e, c, readback) {
    if (!this.current(c)) return;
    if (e.status === 401 || e.status === 403) {
      this._authorized = false; this._canManage = false; this.setData(empty());
      if (e.status === 401) return this.run(async () => { throw e; }, { silent: true });
      this.setData({ error: '当前门店或分类权限不可用，请重新读取。' }); return;
    }
    this.setData(readback ? { readbackError: e.message || '分类回读失败', notice: '本次回执已确认，详情未核验完成；只重读，不再发送。' } : { error: e.message || '读取失败，请重试' });
  },
  async refresh(adopt) {
    this.syncScope(); if (!this._visible || this._gone || this._read || this._flight || this._modal) return;
    this._epoch++; const c = this.capture(); this._read = c; this._authorized = false;
    this.setData({ loading: true, error: '', canCreate: false, editable: false, canSave: false, canDelete: false, canRetrySame: false });
    try { await this.fetchList(0, c); if (this.current(c) && this._resource !== null) await this.fetchSelection(c, adopt === true); if (this.current(c)) this._needsRefresh = false; }
    catch (e) { await this.failure(e, c, !!(this._pending && this._pending.receipt)); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async fetchList(page, c) {
    const p = { ...model.binding(this), page, page_size: 20 }, row = await this.api.action('kb-category-list', p); if (!this.current(c)) return;
    const d = model.parseList(row, p), items = page === 0 ? [] : this.data.items.slice(), ids = new Set(items.map(x => x.id));
    d.items.forEach(x => { if (!ids.has(x.id)) { items.push(x); ids.add(x.id); } });
    this._page = page; this._canManage = d.canManage; this._authorized = true;
    this.setData({ items, hasMore: d.hasMore, shopName: this.session.get().shop.name || '当前授权门店', typeLabel: this._type === 'sop' ? 'SOP 分类' : '问答分类' }); this.render();
  },
  async loadMore() {
    if (this.syncScope() || !this._visible || !this._authorized || this._needsRefresh || this._read || this._flight || this._modal || !this.data.hasMore) return;
    const c = this.capture(); this._read = c; this.setData({ loading: true, error: '' });
    try { await this.fetchList(this._page + 1, c); } catch (e) { await this.failure(e, c); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) this.setData({ loading: false }); } }
  },
  render() {
    if (!this._visible || !this._authorized) return;
    this._records = this._canManage && !this.isPreview() ? model.records(getApp(), this) : [];
    const pendingRequests = this._records.map((r, index) => ({ index, label: (r.payload.operation === 'create' ? '新增分类' : r.payload.operation === 'delete' ? '删除分类' : '修改分类') + (r.receipt ? ' · 回执待回读' : ' · 原请求待核对') }));
    const s = this._server, pending = this._pending, visible = this._resource !== null && (!pending || this._canManage);
    const d = this._canManage ? this._draft : s ? { name: s.name, sortText: String(s.sort_order) } : null;
    const allowed = this._canManage && this._detailManage && !this._needsRefresh && d && (!s || s.shop_id !== null);
    const conflict = !!(this._writeConflict && this._writeConflictResource === this._resource || s && this._base && s.version !== this._base.version);
    let validation = ''; if (d) try { model.normalize(d.name, d.sortText); } catch (e) { validation = e.message; }
    this.setData({ canManage: !!this._canManage, canCreate: !!(this._canManage && !this._needsRefresh), pendingRequests, editorVisible: !!visible, name: visible && d ? d.name : '', sortText: visible && d ? d.sortText : '', scopeLabel: s ? s.scopeLabel : '本店',
      editable: !!(visible && allowed && !pending), canSave: !!(visible && allowed && !pending && !conflict && !validation && !this.isPreview()), canDelete: !!(visible && allowed && s && !pending && !conflict && !this.isPreview()),
      pending: !!(visible && pending), receiptConfirmed: !!(visible && pending && pending.receipt), conflict, validation,
      notice: pending && visible ? pending.receipt ? '本次回执已确认，请只读回查详情。' : '原请求已冻结，请显式只读核对，不会自动重发。' : conflict ? '分类版本已变化，未保存草稿保留。请明确载入最新。' : this.data.saved ? this.data.notice : this.isPreview() ? '合成示例，仅可编辑本页草稿，不会保存或删除。' : !this._canManage ? '当前账号仅可查看分类。' : '' });
  },
  async open(e) {
    if (this.syncScope() || !this._visible || !this._authorized || this._resource !== null || this._read || this._flight || this._modal) return;
    const id = e.currentTarget.dataset.id; if (!this.data.items.some(x => x.id === id)) return;
    return this.select(id);
  },
  async create() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || this._needsRefresh || this._resource !== null || this._read || this._flight || this._modal) return;
    return this.select('');
  },
  async select(resource) {
    if (this._resource !== null && this._resource !== resource) { this.setData({ error: '请先取消当前编辑，或收起原请求后选择另一分类。' }); return; }
    this._resource = resource; this._epoch++; this._base = null; this._draft = null; this._server = null; this._pending = null; this._detailManage = false; this._edit++;
    this._writeConflictResource = resource; this._writeConflict = this._writeConflicts.has(resource);
    this.setData({ saved: false, error: '', notice: '', readbackError: '', canRetrySame: false });
    const c = this.capture(); this._read = c; this.setData({ loading: true });
    try { await this.fetchSelection(c); } catch (e) { await this.failure(e, c); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) this.setData({ loading: false }); } }
  },
  async fetchSelection(c, adopt) {
    if (!this.current(c)) return;
    let s = null, manage = this._canManage; const key = model.key(this, this._resource), memory = model.ram(getApp());
    if (this._resource) {
      const p = { ...model.binding(this), id: this._resource };
      try { const raw = await this.api.action('kb-category-detail', p); if (!this.current(c)) return; const d = model.parseDetail(raw, p); s = d.category; manage = d.canManage; if (s.shop_id !== null && !manage) this._canManage = false; }
      catch (e) { if (!this.current(c)) return; if (!model.notFound(e) || !manage || !memory[key] || this.isPreview()) throw e; }
    }
    if (!this.current(c)) return;
    this._server = s; this._detailManage = manage;
    if (adopt && this._writeConflictResource === this._resource) { this._writeConflicts.delete(this._resource); this._writeConflict = false; }
    if (!this._draft || adopt) { this._base = s; this._draft = s ? { name: s.name, sortText: String(s.sort_order) } : { name: '', sortText: '0' }; this._edit++; }
    const record = manage && !this.isPreview() ? memory[key] : null;
    if (record) {
      model.check(record.actorId === this.session.get().userId && record.payload.shop_id === model.binding(this).shop_id && record.payload.type === this._type && (record.payload.category_id || '') === this._resource);
      if (this._pending !== record) record.unknown = true;
      this._pending = record;
      if (record.payload.operation !== 'delete') this._draft = { name: record.payload.name, sortText: String(record.payload.sort_order) };
    }
    this.render(); if (record && record.receipt) await this.readback(record, c);
  },
  resume(e) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || this.isPreview() || this._read || this._flight || this._modal) return;
    const index = Number(e.currentTarget.dataset.index), record = this._records && this._records[index];
    if (record) return this.select(record.payload.category_id || '');
  },
  cancel() {
    if (this.syncScope() || !this._visible || this._read || this._flight || this._modal) return;
    this._resource = null; this._epoch++; this._draft = null; this._base = null; this._server = null; this._pending = null; this._detailManage = false;
    this.setData({ editorVisible: false, name: '', sortText: '', canRetrySame: false, readbackError: '', error: '' }); this.render();
  },
  edit(field, value) { if (this.syncScope() || !this._visible || !this._authorized || !this.data.editable || this._pending || this._read || this._flight) return; this._draft[field] = value; this._edit++; this.setData({ error: '' }); this.render(); },
  onName(e) { this.edit('name', e.detail.value); },
  onSort(e) { this.edit('sortText', e.detail.value); },
  async modal(c, title, content) {
    if (this._modal) return false; this._modal = c; const edit = this._edit; this.setData({ confirming: true });
    try { const a = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject })); return a.confirm === true && this.current(c) && this._edit === edit; }
    catch (_) { return false; } finally { if (this._modal === c) { this._modal = null; if (this.current(c)) this.setData({ confirming: false }); } }
  },
  async reloadLatest() { if (this.syncScope() || !this._visible || !this._authorized && !(this._writeConflict && this._writeConflictResource === this._resource) || this._resource === null || this._pending || this._read || this._flight) return; const c = this.capture(); if (await this.modal(c, '载入最新分类', '将放弃当前未保存的名称和排序，重新读取服务器。不会写入。')) return this.refresh(true); },
  save() { return this.confirmWrite(this._resource ? 'update' : 'create'); },
  remove() { return this.confirmWrite('delete'); },
  async confirmWrite(operation) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || !this._detailManage || this._needsRefresh || this.isPreview() || this._resource === null || this._pending || this._read || this._flight || this._modal || !(operation === 'delete' ? this.data.canDelete : this.data.canSave)) return;
    const memory = model.ram(getApp()), key = model.key(this, this._resource); if (memory[key]) return this.select(this._resource);
    const c = this.capture(), base = this._base; let fields;
    try { if (operation !== 'delete') fields = model.normalize(this._draft.name, this._draft.sortText); } catch (e) { return this.failure(e, c); }
    if (!await this.modal(c, operation === 'delete' ? '删除本店分类' : '保存本店分类', operation === 'delete' ? '确认删除该分类？词条会保留并变为未分类，不会删除词条。' : '确认保存分类名称和数字排序？不会改变词条排序或创建共享分类。')) return;
    if (!this.current(c) || this.isPreview() || !this._authorized || !this._canManage || !this._detailManage || this._needsRefresh || this._pending || this._base !== base) return;
    if (memory[key]) return this.select(this._resource);
    const p = { ...model.binding(this), request_id: model.requestId(), operation };
    if (operation !== 'create') { p.category_id = this._resource; p.expected_version = base.version; } if (fields) Object.assign(p, fields);
    const record = { actorId: this.session.get().userId, preview: false, payload: Object.freeze(p), unknown: false, retryBlocked: false, receipt: null };
    memory[key] = record; this._pending = record; return this.send(record, c);
  },
  async send(record, c) {
    if (!this.current(c) || this.isPreview() || !this._authorized || !this._canManage || this._pending !== record || record.receipt || this._flight) return;
    this._flight = record; this.setData({ sending: true, pending: true, editable: false, canSave: false, canDelete: false, canRetrySame: false, error: '' });
    try { const r = await this.api.action('kb-category-write', record.payload); if (!this.current(c) || this._pending !== record) return; record.receipt = model.parseReceipt(r, record.payload, this.session.get().userId); this.setData({ receiptConfirmed: true }); await this.readback(record, c); }
    catch (e) {
      const current = this.current(c), memory = model.ram(getApp()), key = model.key(this, this._resource);
      if (current && this._pending === record && memory[key] === record && record.unknown === false && !record.receipt && model.transactionAborted(e)) {
        delete memory[key]; this._pending = null; this._authorized = false; this._needsRefresh = true;
        if (e.code === 'version_conflict') { this._writeConflict = true; this._writeConflictResource = this._resource; this._writeConflicts.add(this._resource); }
        this.setData({ pending: false, pendingRequests: [], canCreate: false, canSave: false, canDelete: false, canRetrySame: false, editable: false, conflict: !!(this._writeConflict && this._writeConflictResource === this._resource), notice: '此次请求已明确中止，草稿和分类选择保留。请完整重新读取权限与分类后再操作。' });
      } else { record.unknown = true; if (e.code === 'request_id_conflict') record.retryBlocked = true; if (current) this.render(); }
      if (current) await this.failure(e, c, !!record.receipt);
    }
    finally { if (this._flight === record) { this._flight = null; if (this.current(c)) this.setData({ sending: false }); } }
  },
  async readback(record, c) {
    if (!this.current(c) || this._pending !== record || !record.receipt) return;
    const p = record.payload, r = record.receipt;
    try {
      let category;
      try { const raw = await this.api.action('kb-category-detail', { shop_id: p.shop_id, type: p.type, id: r.category_id }); if (!this.current(c)) return; category = model.parseDetail(raw, { shop_id: p.shop_id, type: p.type, id: r.category_id }).category; }
      catch (e) { if (!this.current(c)) return; if (p.operation !== 'delete' || !model.notFound(e)) throw e; }
      model.check(p.operation === 'delete' ? !category : category && model.matches(category, p, r), '分类回读名称、排序或版本不一致，请只重读');
    } catch (e) { await this.failure(e, c, true); return; }
    if (!this.current(c)) return;
    const key = model.key(this, this._resource); if (model.ram(getApp())[key] === record) delete model.ram(getApp())[key];
    this._pending = null; this._resource = null; this._draft = null; this._base = null; this._server = null; this._epoch++;
    this.setData({ saved: true, loading: false, editorVisible: false, pending: false, editable: false, canSave: false, canDelete: false, canRetrySame: false, receiptConfirmed: true, sending: false, name: '', sortText: '', error: '', readbackError: '', notice: p.operation === 'delete' ? '分类删除回执与不存在状态已核验。' : '分类保存回执与服务器名称、排序、版本已核验。' });
    const next = this.capture(); try { await this.fetchList(0, next); } catch (e) { await this.failure(e, next); }
  },
  async retryReadback() { if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || this.isPreview() || !this._pending || !this._pending.receipt || this._read || this._flight || this._modal) return; const c = this.capture(); this._flight = c; this.setData({ loading: true }); try { await this.readback(this._pending, c); } finally { if (this._flight === c) { this._flight = null; if (this._visible && !this._gone) this.setData({ loading: false }); } } },
  async reconcile() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || this.isPreview() || !this._pending || this._read || this._flight || this._modal) return;
    if (this._pending.receipt) return this.retryReadback(); const record = this._pending, c = this.capture(), p = record.payload; this._flight = c; this.setData({ loading: true, canRetrySame: false, error: '' });
    try {
      const params = { shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation }; if (p.category_id) params.category_id = p.category_id;
      const raw = await this.api.action('kb-category-write-status', params); if (!this.current(c) || this._pending !== record) return;
      const r = model.parseStatus(raw, p, this.session.get().userId);
      if (r) { record.receipt = r; this.setData({ receiptConfirmed: true }); await this.readback(record, c); }
      else this.setData({ canRetrySame: !record.retryBlocked, notice: '尚未查到原回执，不代表失败或取消。请稍后核对，或再次确认按同一原请求重试。' });
    } catch (e) { if (e.code === 'request_id_conflict') record.retryBlocked = true; await this.failure(e, c); }
    finally { if (this._flight === c) { this._flight = null; if (this._visible && !this._gone) this.setData({ loading: false }); } }
  },
  async retrySame() { if (this.syncScope() || !this._visible || !this._authorized || !this._canManage || this.isPreview() || !this._pending || this._pending.receipt || this._pending.retryBlocked || !this.data.canRetrySame || this._read || this._flight || this._modal) return; const record = this._pending, c = this.capture(); if (await this.modal(c, '按原分类请求重试', '查不到回执不代表失败。将使用同一编号、原版本及原始名称/排序重试，不会新建请求。')) { if (this.current(c) && this._pending === record) { record.unknown = true; return this.send(record, c); } } }
}));
