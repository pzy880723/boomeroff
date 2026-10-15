const { definePage } = require('../../shared/page');
const model = require('../store-kb/model');
const aiDraft = require('./ai-draft');
function empty() { return { title: '', body: '', tagsText: '', categoryId: null, categoryIndex: 0, categories: [], categoryNames: [], shopName: '', typeLabel: '', scopeLabel: '', editable: false, canSave: false, canDelete: false, pending: false, canRetrySame: false, receiptConfirmed: false, saved: false, conflict: false, loading: false, sending: false, confirming: false, error: '', validation: '', notice: '', readbackError: '', aiOpen: false, aiHint: '', aiHintCount: 0, aiBusy: false, aiCandidate: null, aiStale: false, aiError: '', aiInputError: '', canGenerate: false, canAdopt: false }; }
Page(definePage({
  data: empty(),
  onLoad(query) { this._type = query.type; this._id = query.id || ''; this._epoch = 0; this._edit = 0; this._visible = false; this._scope = model.scope(this); this._aiSeq = 0; this._aiHint = ''; this._aiHintVersion = 0; },
  onShow() { this._visible = true; return this.refresh(); },
  onHide() { this.pause(); },
  onUnload() { this.pause(); this._draft = null; this._base = null; this._server = null; this._pending = null; this._aiFlight = null; this._aiHint = ''; },
  pause() { this._visible = false; this._epoch++; this.invalidateAI(); this._aiOpen = false; this._modal = null; this._flight = null; this._read = null; this._authorized = false; if (this._pending && !this._pending.receipt) this._pending.unknown = true; this.setData(empty()); },
  syncScope() {
    const scope = model.scope(this); if (scope === this._scope) return false;
    this.invalidateAI(); this._aiFlight = null; this._aiHint = ''; this._aiHintVersion++; this._aiOpen = false;
    this._scope = scope; this._epoch++; this._edit++; this._draft = null; this._base = null; this._server = null; this._pending = null; this._completed = null; this._writeConflict = false; this._caps = null; this._authorized = false; this._modal = null; this._flight = null; this._read = null; this.setData(empty()); return true;
  },
  current(c) { this.syncScope(); return model.active(this, c); },
  isPreview() { return !!(this.preview || this.data.preview || getApp().preview); },
  async failure(e, c, readback) {
    if (!this.current(c)) return;
    if (e.status === 401 || e.status === 403) {
      this.invalidateAI();
      this._authorized = false; this.setData(empty());
      if (e.status === 401) return this.run(async () => { throw e; }, { silent: true });
      this.setData({ error: '当前账号或门店权限不可用，请重新核验。' }); return;
    }
    this.setData(readback ? { readbackError: e.message || '详情回读失败', notice: '本次操作回执已确认，详情回读未完成；只能重读，不会再次发送。' } : { error: e.message || '读取失败，请重试' });
  },
  async refresh(adopt) {
    if (!this._visible || this._gone) return;
    this.syncScope(); if (this._read || this._flight || this._modal) return;
    this.invalidateAI();
    const c = model.capture(this); this._read = c; this._authorized = false;
    this.setData({ loading: true, canSave: false, canDelete: false, editable: false, canRetrySame: false, error: '' });
    try {
      const b = model.binding(this), rawCaps = await this.api.action('kb-capabilities', b); if (!this.current(c)) return;
      this._caps = model.parseCaps(rawCaps, b);
      if (this._completed) { this.setData({ saved: true, receiptConfirmed: true, notice: '本次操作已完成回执与详情核验。请返回列表查看当前内容。', returnUrl: '/pages/store-kb/index?type=' + this._type }); return; }
      let server = null, categories;
      try {
        if (this._id) {
          const dto = await this.api.action('kb-detail', { ...b, id: this._id }); if (!this.current(c)) return;
          server = model.parseDetail(dto, b, this._id); categories = server.categories;
        } else {
          const p = { ...b, q: '', category_id: null, page: 0, page_size: 20 }, dto = await this.api.action('kb-list', p); if (!this.current(c)) return;
          categories = model.parseList(dto, p).categories;
        }
      } catch (e) {
        if (!this.current(c)) return;
        if (!model.notFound(e) || !this._caps.canWrite || this.isPreview() || !model.ram(getApp())[model.key(this)]) throw e;
        categories = []; this._draft = null;
      }
      if (!this.current(c)) return;
      this._server = server; this._categories = categories; this._authorized = true;
      if (adopt === true) this._writeConflict = false;
      if (!this._draft || adopt === true) {
        this._base = server; this._draft = server ? model.draftFrom(server.entry) : this._id ? null : { title: '', body: '', tagsText: '', categoryId: null }; this._edit++;
      }
      if (this._caps.canWrite && !this.isPreview()) this.restorePending();
      this.render();
      if (this._pending && this._pending.receipt) await this.readback(this._pending, c);
    } catch (e) { if (this.current(c)) { this._authorized = false; this.setData({ canSave: false, canDelete: false, editable: false }); } await this.failure(e, c, !!(this._pending && this._pending.receipt)); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.renderAI(); } } }
  },
  restorePending() {
    const record = model.ram(getApp())[model.key(this)];
    if (!record) return;
    if (this._pending !== record) { this.invalidateAI(); record.unknown = true; this._pending = record; }
    const p = record.payload;
    model.check(p.shop_id === model.binding(this).shop_id && p.type === this._type && (p.entry_id || '') === this._id, '原请求与当前页面不匹配');
    if (p.operation !== 'delete' && (!this._id || this._server)) this._draft = { title: p.title, body: p.body, tagsText: p.tags.join(', '), categoryId: p.category_id };
  },
  render() {
    if (!this._visible || !this._authorized) return;
    const d = this._draft, s = this._server, pending = this._pending, caps = this._caps;
    const shared = !!(s && s.entry.shop_id === null), allowed = caps.canWrite && !shared && (!this._id || s && s.canEdit);
    const conflict = !!(this._writeConflict || s && this._base && s.version !== this._base.version);
    const categories = [{ id: null, name: '不分类' }].concat(this._categories || []);
    let categoryIndex = d ? categories.findIndex(x => x.id === d.categoryId) : 0;
    if (categoryIndex < 0) { categories.push({ id: d.categoryId, name: '原分类不可用（请重新选择）' }); categoryIndex = categories.length - 1; }
    let validation = ''; if (d) try { model.normalizeDraft(d, this._categories || []); } catch (e) { validation = e.message; }
    this.setData({ title: d ? d.title : '', body: d ? d.body : '', tagsText: d ? d.tagsText : '', categoryId: d ? d.categoryId : null, categories, categoryNames: categories.map(x => x.name), categoryIndex,
      shopName: this.session.get().shop.name || '当前授权门店', typeLabel: this._type === 'sop' ? '门店 SOP' : '门店问答', scopeLabel: shared ? '共享 · 只读' : '本店',
      editable: !!(allowed && !pending && !this.data.saved), canSave: !!(allowed && !pending && !this._aiFlight && !this.data.saved && !conflict && !validation && !this.isPreview()),
      canDelete: !!(caps.canWrite && s && s.canDelete && !pending && !this._aiFlight && !conflict && !this.data.saved && !this.isPreview()), pending: !!pending, conflict, validation,
      receiptConfirmed: !!(pending && pending.receipt), notice: pending ? pending.receipt ? '本次操作回执已确认，请只读回查详情。' : '存在结果待确认的原请求，请显式只读核对，不会自动重发。' : conflict ? '服务器版本已变化，草稿保留。请明确载入最新版本后再提交。' : this.isPreview() ? '合成示例：可以编辑草稿，不会保存或删除。' : shared ? '共享内容只读，不在本店维护。' : !caps.canWrite ? '当前账号仅可阅读。' : '' });
    this.renderAI();
  },
  invalidateAI() { this._aiSeq = (this._aiSeq || 0) + 1; this._aiCandidate = null; if (this._visible && !this._gone) this.setData({ aiCandidate: null, aiStale: false, canAdopt: false, aiError: '' }); },
  aiAllowed() {
    const s = this._server, session = this.session.get();
    return !!(this._visible && !this._gone && this._authorized && this._caps && this._caps.canWrite === true && this._draft && session && session.shop && (!this._id || s && s.canEdit && s.entry.shop_id === session.shop.id) && !this._writeConflict && !(s && this._base && s.version !== this._base.version) && !this._pending && !model.ram(getApp())[model.key(this)] && !this._completed && !this.data.saved && !this.data.receiptConfirmed && !this._read && !this._flight && !this._modal && !this.isPreview());
  },
  aiMatches(candidate) { const c = candidate.context; return c.seq === this._aiSeq && c.edit === this._edit && c.hint === this._aiHintVersion && c.base === this._base && c.version === (this._base && this._base.version); },
  renderAI() {
    if (!this._visible || this._gone || !this._authorized) return;
    const candidate = this._aiCandidate, stale = !!(candidate && !this.aiMatches(candidate));
    let aiInputError = ''; try { aiDraft.input(model.binding(this), this._draft ? this._draft.title : '', this._aiHint || ''); } catch (e) { aiInputError = e.message; }
    const allowed = this.aiAllowed();
    this.setData({ aiOpen: !!this._aiOpen, aiHint: this._aiHint || '', aiHintCount: Array.from(this._aiHint || '').length, aiInputError, aiBusy: !!this._aiFlight, aiStale: stale,
      aiCandidate: candidate ? candidate.view : null, canGenerate: allowed && !this._aiFlight && !aiInputError, canAdopt: !!(allowed && !this._aiFlight && candidate && !stale) });
  },
  toggleAI() { if (this.syncScope() || !this._visible || !this._authorized) return; this._aiOpen = !this._aiOpen; this.renderAI(); },
  onAIHint(e) {
    if (this.syncScope() || !this._visible || !this._authorized || !this.data.editable || this._pending || this._flight || this._read) return;
    if (this._aiHint !== e.detail.value) { this._aiHint = e.detail.value; this._aiHintVersion++; }
    this.setData({ aiError: '' }); this.renderAI();
  },
  async generateDraft() {
    if (this.syncScope() || !this.aiAllowed() || this._aiFlight) return;
    let p;
    try { p = aiDraft.input(model.binding(this), this._draft.title, this._aiHint || ''); } catch (e) { this.setData({ aiInputError: e.message }); return; }
    const context = { page: model.capture(this), seq: ++this._aiSeq, edit: this._edit, hint: this._aiHintVersion, base: this._base, version: this._base && this._base.version };
    const flight = { context, params: Object.freeze(p) }, tags = Array.isArray(this._draft.tags) ? this._draft.tags.slice() : this._draft.tagsText.split(/[,，]/).map(x => x.trim());
    this._aiFlight = flight; this._aiCandidate = null; this._aiOpen = true; this.setData({ aiError: '' }); this.render();
    try {
      const raw = await this.api.action('kb-draft', flight.params);
      if (!this.current(context.page) || context.seq !== this._aiSeq || this._aiFlight !== flight || !this.aiAllowed()) return;
      const parsed = aiDraft.parse(raw, p, tags);
      const view = { title: parsed.title, body: parsed.body, tags: parsed.tags.slice(), categoryName: parsed.categoryName, blocks: parsed.blocks, sources: parsed.sources, referenceLabel: parsed.referenceLabel, preservedHighlight: parsed.preservedHighlight };
      this._aiCandidate = { context, parsed, view };
    } catch (e) {
      if (this.current(context.page) && context.seq === this._aiSeq && this._aiFlight === flight) {
        if (e.status === 401 || e.status === 403) {
          await this.failure(e, context.page);
          if (e.status === 403 && e.code === 'draft_scope_changed' && this.current(context.page)) this.setData({ error: aiDraft.errorMessage(e) });
        } else this.setData({ aiError: aiDraft.errorMessage(e) });
      }
    } finally {
      if (this._aiFlight === flight) { this._aiFlight = null; if (this._visible && !this._gone && model.scope(this) === context.page.scope) { if (this._authorized) this.render(); else this.setData({ aiBusy: false, canGenerate: false, canAdopt: false }); } }
    }
  },
  async adoptDraft() {
    if (this.syncScope() || !this.aiAllowed() || this._aiFlight || !this._aiCandidate || !this.aiMatches(this._aiCandidate)) return;
    const candidate = this._aiCandidate, c = model.capture(this);
    const accepted = await this.modal(c, '采用 AI 草稿', '将替换标题、正文、标签和分类，仅修改本页草稿，不会保存。请核实内容后再单独确认保存。');
    if (!accepted || !this.current(c) || !this.aiAllowed() || this._aiCandidate !== candidate || !this.aiMatches(candidate)) return;
    const d = candidate.parsed;
    this._draft = { title: d.title, body: d.body, tags: d.tags.slice(), tagsText: d.tags.join(', '), categoryId: d.categoryId };
    this._categories = d.categories.slice(); this._edit++; this.invalidateAI(); this.setData({ aiError: '' }); this.render();
  },
  edit(field, value) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._draft || !this.data.editable || this._pending || this._read || this._flight) return;
    this._draft[field] = value; if (field === 'tagsText') delete this._draft.tags; this._edit++; this.setData({ error: '' }); this.render();
  },
  onTitle(e) { this.edit('title', e.detail.value); },
  onBody(e) { this.edit('body', e.detail.value); },
  onTags(e) { this.edit('tagsText', e.detail.value); },
  onCategory(e) { const row = this.data.categories[Number(e.detail.value)]; if (!row || row.id && !(this._categories || []).some(x => x.id === row.id)) return; this.edit('categoryId', row.id); },
  async modal(c, title, content) {
    if (this._modal) return false;
    const edit = this._edit; this._modal = c; this.setData({ confirming: true });
    try { const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject })); return result.confirm === true && this.current(c) && edit === this._edit; }
    catch (_) { return false; }
    finally { if (this._modal === c) { this._modal = null; if (this.current(c)) this.setData({ confirming: false }); } }
  },
  async reloadLatest() {
    if (this.syncScope() || !this._visible || !this._authorized && !this._writeConflict || this._pending || this._flight || this._read) return;
    const c = model.capture(this);
    if (await this.modal(c, '载入最新版本', '将放弃当前未保存草稿，重新读取服务器内容。不会保存或删除。')) return this.refresh(true);
  },
  save() { return this.confirmOperation(this._id ? 'update' : 'create'); },
  remove() { return this.confirmOperation('delete'); },
  async confirmOperation(operation) {
    if (this.syncScope() || !this._visible || this._gone || this.isPreview() || !this._authorized || this._pending || this._aiFlight || this._flight || this._read || this._modal || !(operation === 'delete' ? this.data.canDelete : this.data.canSave)) return;
    if (model.ram(getApp())[model.key(this)]) { this.restorePending(); this.render(); return; }
    const c = model.capture(this), base = this._base;
    let draft; try { if (operation !== 'delete') draft = model.normalizeDraft(this._draft, this._categories); } catch (e) { await this.failure(e, c); return; }
    const accepted = await this.modal(c, operation === 'delete' ? '删除本店知识' : '保存本店知识', operation === 'delete' ? '确认删除“' + this.data.title + '”？此操作不会删除共享内容。' : '将保存到“' + this.data.shopName + '”的' + this.data.typeLabel + '。请确认标题、正文、标签和分类。');
    if (!accepted || !this.current(c) || this.isPreview() || !this._authorized || base !== this._base || !(operation === 'delete' ? this.data.canDelete : this.data.canSave)) return;
    if (model.ram(getApp())[model.key(this)]) { this.restorePending(); this.render(); return; }
    this.invalidateAI(); const payload = { ...model.binding(this), request_id: model.requestId(), operation };
    if (operation !== 'create') { payload.entry_id = this._id; payload.expected_version = base.version; }
    if (draft) Object.assign(payload, draft);
    const record = { payload: model.freezePayload(payload), unknown: false, retryBlocked: false, receipt: null };
    const key = model.key(this); model.ram(getApp())[key] = record; this._pending = record;
    return this.send(record, c);
  },
  async send(record, c) {
    if (!this.current(c) || this.isPreview() || !this._authorized || !this._caps.canWrite || this._flight || this._pending !== record || record.receipt) return;
    this._flight = record; this.setData({ sending: true, canSave: false, canDelete: false, editable: false, canRetrySame: false, pending: true, error: '' });
    try {
      const row = await this.api.action('kb-write', record.payload); if (!this.current(c) || this._pending !== record) return;
      record.receipt = model.parseReceipt(row, record.payload, this.session.get().userId);
      this.setData({ receiptConfirmed: true, notice: '本次操作回执已确认，正在只读回查详情。' }); await this.readback(record, c);
    } catch (e) {
      const current = this.current(c), entries = model.ram(getApp()), key = model.key(this);
      if (current && this._pending === record && entries[key] === record && record.unknown === false && !record.receipt && model.transactionAborted(e)) {
        delete entries[key]; this._pending = null; this._authorized = false;
        if (e.code === 'version_conflict') this._writeConflict = true;
        this.setData({ pending: false, canRetrySame: false, canSave: false, canDelete: false, editable: false, conflict: !!this._writeConflict, notice: '此次请求已明确中止，草稿保留。请重新读取服务器权限与内容后再操作。' });
      } else {
        record.unknown = true; if (e.code === 'request_id_conflict') record.retryBlocked = true;
        if (current) this.render();
      }
      if (current) await this.failure(e, c, !!record.receipt);
    } finally { if (this._flight === record) { this._flight = null; if (this.current(c)) this.setData({ sending: false }); } }
  },
  async readback(record, c) {
    if (!this.current(c) || !record.receipt || this._pending !== record) return;
    const p = record.payload, receipt = record.receipt;
    try {
      let d;
      try {
        const row = await this.api.action('kb-detail', { shop_id: p.shop_id, type: p.type, id: receipt.entry_id }); if (!this.current(c)) return;
        d = model.parseDetail(row, p, receipt.entry_id);
      } catch (e) { if (!this.current(c)) return; if (p.operation !== 'delete' || !model.notFound(e)) throw e; }
      if (!this.current(c)) return;
      model.check(p.operation === 'delete' ? !d : d && model.matchesReadback(d, p, receipt), '回读版本或内容尚未一致，请只重读详情');
      const key = model.key(this); if (model.ram(getApp())[key] === record) delete model.ram(getApp())[key];
      this._pending = null; this._completed = receipt; this.setData({ pending: false, receiptConfirmed: true, saved: true, canSave: false, canDelete: false, editable: false, canRetrySame: false, readbackError: '', error: '', returnUrl: '/pages/store-kb/index?type=' + this._type, notice: p.operation === 'delete' ? '删除回执和服务器不存在状态已核验。' : '保存回执和服务器内容已核验。' });
    } catch (e) { await this.failure(e, c, true); }
  },
  async retryReadback() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._pending || !this._pending.receipt || this._flight || this._read || this.isPreview()) return;
    const c = model.capture(this); this._flight = c; this.setData({ loading: true });
    try { await this.readback(this._pending, c); } finally { if (this._flight === c) { this._flight = null; if (this.current(c)) this.setData({ loading: false }); } }
  },
  async reconcile() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canWrite || !this._pending || this.isPreview() || this._flight || this._read || this._modal) return;
    if (this._pending.receipt) return this.retryReadback();
    const c = model.capture(this), record = this._pending, p = record.payload; this._flight = c;
    this.setData({ loading: true, canRetrySame: false, error: '' });
    try {
      const params = { shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation }; if (p.entry_id) params.entry_id = p.entry_id;
      const row = await this.api.action('kb-write-status', params); if (!this.current(c) || this._pending !== record) return;
      const r = model.parseStatus(row, p, this.session.get().userId);
      if (r) { record.receipt = r; this.setData({ receiptConfirmed: true }); await this.readback(record, c); }
      else this.setData({ canRetrySame: !record.retryBlocked, notice: '尚未查到原回执，不代表失败或取消。可稍后核对，或再次明确确认后按原请求重试。' });
    } catch (e) { if (e.code === 'request_id_conflict') record.retryBlocked = true; await this.failure(e, c); }
    finally { if (this._flight === c) { this._flight = null; if (this.current(c)) this.setData({ loading: false }); } }
  },
  async retrySame() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canWrite || this.isPreview() || !this.data.canRetrySame || !this._pending || this._pending.retryBlocked || this._pending.receipt || this._flight || this._read || this._modal) return;
    const c = model.capture(this), record = this._pending;
    if (await this.modal(c, '按原请求重试', '查不到回执不代表失败。将使用原编号、原版本和原草稿重试，不会新建请求。')) { if (this.current(c) && this._pending === record) { record.unknown = true; return this.send(record, c); } }
  }
}));
