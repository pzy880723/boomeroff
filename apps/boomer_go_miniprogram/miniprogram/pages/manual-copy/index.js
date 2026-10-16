const { definePage } = require('../../shared/page');
const { scopeKey } = require('../marketing/model');
const manual = require('../../shared/manual-copy');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ title: '', body: '', shopName: '', assetId: '', candidateIndex: 0, candidateNames: [], titleCount: 0, bodyCount: 0,
  editable: false, canSave: false, canDelete: false, pending: false, receiptConfirmed: false, saved: false, conflict: false,
  loading: false, sending: false, confirming: false, validation: '', error: '', notice: '' });
function ram() { const app = getApp(); return app._manualCopyPending || (app._manualCopyPending = Object.create(null)); }
function validation(draft) {
  if (!draft || typeof draft.title !== 'string' || typeof draft.body !== 'string') return '请填写标题和正文。';
  if (draft.title.trim().length > 60) return '标题不能超过 60 字，草稿未截断。';
  if (!draft.body.trim()) return '正文不能为空。';
  return draft.body.trim().length > 1000 ? '正文不能超过 1000 字，草稿未截断。' : '';
}

Page(definePage({
  data: empty(),
  onLoad(query) {
    this._id = query.id || ''; this._validRoute = typeof this._id === 'string' && (!this._id || UUID.test(this._id));
    this._visible = false; this._epoch = 0; this._edit = 0; this._scope = this.identity(); this._index = 0;
  },
  onShow() {
    const changed = this.syncScope();
    if (this._visible && !changed) return this._read && this._read.promise;
    this._visible = true; return this.refresh();
  },
  onHide() {
    this._visible = false; this._epoch++; this._authorized = false; this._modal = null; this._read = null; this._flight = null;
    if (this._pending && !this._pending.representation) this._pending.unknown = true;
    this.clearView();
  },
  onUnload() { this.onHide(); this._draft = null; this._base = null; this._server = null; this._pending = null; this._completed = null; },
  clearView() { if (this._gone) Object.assign(this.data, empty()); else this.setData(empty()); },
  isPreview() { return !!(this.preview || getApp().preview); },
  identity() { return JSON.stringify([scopeKey(this.session), this.isPreview()]); },
  syncScope() {
    const scope = this.identity(); if (scope === this._scope) return false;
    this._scope = scope; this._epoch++; this._edit++; this._authorized = false; this._draft = null; this._base = null; this._server = null;
    this._pending = null; this._completed = null; this._conflict = false; this._index = 0; this._read = null; this._flight = null; this._modal = null; this.clearView(); return true;
  },
  context() {
    const user = this.session.get();
    if (!this._validRoute || !user || typeof user.userId !== 'string' || !UUID.test(user.userId) || !user.shop || typeof user.shop.id !== 'string' || !UUID.test(user.shop.id)) return null;
    return { userId: user.userId, shopId: user.shop.id, scope: this.identity(), epoch: this._epoch, revision: this.session.revision ? this.session.revision() : null };
  },
  current(c) { this.syncScope(); return !!c && !this._gone && this._visible && c.epoch === this._epoch && c.scope === this.identity(); },
  boundRow(row, c, id) {
    if (!row || row.id !== id || row.user_id !== c.userId || row.shop_id !== c.shopId || row.kind !== 'copy' || !row.meta || row.meta.source !== 'manual_upload') throw Error('unconfirmed');
    manual.deleteIntent(c, row); return row;
  },
  editable() { return !!(this._visible && !this._gone && this._authorized && this._draft && !this._pending && !this._completed && !this._read && !this._flight); },
  dirty() {
    if (!this._draft) return false;
    const original = this._base ? manual.candidates(this._base)[this._index] : { title: '', body: '' };
    return this._draft.title !== (original.title || '') || this._draft.body !== original.body;
  },
  render() {
    if (!this._visible || this._gone || !this._authorized) return;
    const d = this._draft || { title: '', body: '' }, pending = this._pending, editable = this.editable(), invalid = validation(d);
    const choices = this._base ? manual.candidates(this._base) : [];
    this.setData({ title: d.title, body: d.body, titleCount: d.title.length, bodyCount: d.body.length,
      shopName: this.session.get().shop.name || '当前授权门店', assetId: pending ? pending.intent.id : this._completed ? this._completed.id : this._id,
      candidateIndex: this._index, candidateNames: choices.map((candidate, i) => '候选 ' + (i + 1) + ' · ' + (candidate.title || '未命名')),
      editable, canSave: editable && !this._conflict && !invalid && this.dirty() && !this.isPreview(),
      canDelete: editable && !!this._base && !this._conflict && !this.isPreview(), pending: !!pending,
      receiptConfirmed: !!(pending && pending.representation || this._completed), saved: !!this._completed, conflict: !!this._conflict, validation: invalid,
      notice: this._completed ? (this._completed.operation === 'delete' ? '删除返回与原编号不存在状态已核对。' : '已核对原编号与当前保存内容。这是内容确认，不是不可变请求回执。')
        : pending ? pending.readNotice || (pending.representation ? '已收到匹配的操作返回，仍需只读核对当前内容；不会再次发送。' : '原操作结果待确认；只读核对，不会重发、换新编号或自动创建。')
        : this._conflict ? '服务器内容已变化，本地草稿保留。请明确载入最新内容后再操作。'
        : this.isPreview() ? '合成预览：可以编辑草稿，不会保存、删除或核对真实数据。' : '仅维护本人在当前门店手动添加的文案，不会调用 AI 或发起发布。' });
  },
  async failure(error, c) {
    if (!this.current(c)) return;
    if (error.status === 401 || error.status === 403) {
      this._authorized = false; this.clearView();
      if (error.status === 401 && (error.requestRevision == null || error.requestRevision === c.revision)) return this.run(async () => { throw error; }, { silent: true });
      this.setData({ error: '当前账号或门店授权不可用，请重新核验；原待确认操作仍保留。' }); return;
    }
    this.setData({ error: this._pending ? '操作或回读尚未确认，原稿和原编号已保留，请只读核对。' : '文案暂未读取成功，请手动重试。' });
  },
  restorePending(c) {
    if (this.isPreview()) return false;
    const entries = ram(), direct = manual.key(c, this._id);
    const key = entries[direct] ? direct : this._id && Object.keys(entries).find(k => {
      const p = entries[k].intent; return p.userId === c.userId && p.shopId === c.shopId && p.id === this._id;
    });
    const record = key && entries[key];
    if (!record) return false;
    const p = record.intent;
    if (p.userId !== c.userId || p.shopId !== c.shopId || (this._id ? p.id !== this._id : p.operation !== 'create')) throw Error('unconfirmed');
    record.key = key; this._pending = record; this._base = record.base; this._draft = { ...record.draft }; this._index = record.index; return true;
  },
  refresh(adopt) {
    if (this._gone || !this._visible) return;
    this.syncScope(); if (this._read || this._flight || this._modal) return;
    const c = this.context();
    if (!c) { this._authorized = false; this.clearView(); this.setData({ error: '请使用有效文案编号，并登录选择当前授权门店。' }); return; }
    const read = this._read = {}; this._authorized = false;
    this.setData({ loading: true, editable: false, canSave: false, canDelete: false, error: '' });
    read.promise = (async () => {
      try {
        if (!this.isPreview() && typeof this.session.ensureFresh === 'function') await this.session.ensureFresh();
        if (!this.current(c) || this._read !== read) return;
        if (this.restorePending(c)) { this._authorized = true; return; }
        if (this._completed) { this._authorized = true; return; }
        let server = null;
        if (this._id) {
          const raw = await this.api.manualCopyRead(this._id); if (!this.current(c) || this._read !== read) return;
          server = this.boundRow(raw, c, this._id); manual.candidates(server);
        }
        this._server = server;
        if (this._draft && adopt !== true && this._base && server && server.output_text !== this._base.output_text) this._conflict = true;
        if (!this._draft || adopt === true) {
          this._base = server ? clone(server) : null; this._index = 0;
          const first = server ? manual.candidates(server)[0] : { title: '', body: '' };
          this._draft = { title: first.title || '', body: first.body }; this._conflict = false; this._edit++;
        }
        this._authorized = true;
      } catch (error) { if (this.current(c) && this._read === read) { this._authorized = false; await this.failure(error, c); } }
      finally { if (this._read === read) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
    })();
    return read.promise;
  },
  edit(field, value) {
    if (this.syncScope() || !this.editable() || typeof value !== 'string') return;
    this._draft = { ...this._draft, [field]: value }; this._edit++; this.setData({ error: '' }); this.render();
  },
  onTitle(e) { this.edit('title', e.detail.value); },
  onBody(e) { this.edit('body', e.detail.value); },
  async modal(c, title, content) {
    if (this._modal) return false;
    const token = this._modal = {}, edit = this._edit; this.setData({ confirming: true });
    try {
      const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject }));
      return this._modal === token && this.current(c) && result.confirm === true && edit === this._edit;
    } catch (_) { return false; }
    finally { if (this._modal === token) { this._modal = null; if (this.current(c)) this.setData({ confirming: false }); } }
  },
  async onCandidate(e) {
    if (this.syncScope() || !this.editable() || this._modal || !this._base) return;
    const value = e.detail.value;
    if (!(typeof value === 'string' && /^\d+$/.test(value) || Number.isInteger(value))) return;
    const index = Number(value), candidates = manual.candidates(this._base);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length || index === this._index) return;
    const c = this.context();
    if (this.dirty() && !await this.modal(c, '切换文案候选', '将放弃当前候选未保存的修改，其他候选不变。确认切换？')) return;
    if (!this.current(c) || !this.editable()) return;
    this._index = index; this._draft = { title: candidates[index].title || '', body: candidates[index].body }; this._edit++; this.render();
  },
  async reloadLatest() {
    if (this.syncScope() || !this._visible || this._gone || this._pending || this._flight || this._read || this._modal || this._completed) return;
    const c = this.context(); if (!c) return;
    if (this._draft && !await this.modal(c, '载入最新内容', '将放弃本页未保存草稿，重新读取当前文案；不会保存或删除。')) return;
    if (this.current(c)) return this.refresh(true);
  },
  save() { return this.confirmOperation(this._id ? 'update' : 'create'); },
  remove() { return this.confirmOperation('delete'); },
  async confirmOperation(operation) {
    if (this.syncScope() || this.isPreview() || !this.editable() || this._modal || this._conflict) return;
    if (operation === 'delete' ? !this._base : validation(this._draft) || !this.dirty()) return;
    const c = this.context(), key = manual.key(c, this._id);
    if (ram()[key]) { this.restorePending(c); this.render(); return; }
    const base = this._base, draft = this._draft, index = this._index;
    if (!await this.modal(c, operation === 'delete' ? '删除手动文案' : '保存手动文案', operation === 'delete'
      ? '确认删除这条本人手动文案？不会删除发布任务、远端作品或任何文件。未保存草稿不会写入。'
      : '确认将当前候选保存到“' + (this.session.get().shop.name || '当前门店') + '”？其他候选和原有标签不变，不会调用 AI 或发起发布。')) return;
    if (!this.current(c) || this.isPreview() || !this.editable() || this._conflict || base !== this._base || draft !== this._draft || index !== this._index) return;
    if (ram()[key]) { this.restorePending(c); this.render(); return; }
    let intent;
    try { intent = operation === 'create' ? manual.createIntent(c, draft) : operation === 'update' ? manual.updateIntent(c, base, index, draft) : manual.deleteIntent(c, base); }
    catch (_) { this.setData({ validation: '文案来源或内容格式未能核对，草稿保留。' }); return; }
    const record = { key, intent, base, draft: { ...draft }, index, unknown: false, representation: null };
    ram()[key] = record; this._pending = record; this._flight = record; this.setData({ sending: true, error: '' }); this.render();
    try {
      const response = await this.api.manualCopyWrite(intent);
      // A verified late representation belongs to the frozen actor/shop slot, never the current UI.
      if (!response || response.operation !== intent.operation || response.id !== intent.id || (operation === 'delete' ? response.deleted !== true : !manual.matches(intent, response.row))) throw Error('unconfirmed');
      if (ram()[key] === record) record.representation = true;
      if (this.current(c) && this._pending === record) { this.render(); await this.readback(record, c); }
    } catch (error) { record.unknown = true; if (this.current(c) && this._pending === record) { this.render(); await this.failure(error, c); } }
    finally { if (this._flight === record) { this._flight = null; if (this.current(c)) { this.setData({ sending: false }); this.render(); } } }
  },
  async readback(record, c) {
    const intent = record.intent, key = record.key;
    try {
      const row = await this.api.manualCopyRead(intent.id);
      if (!this.current(c) || this._pending !== record) return;
      const matched = intent.operation === 'delete' ? record.representation === true && row === null : manual.matches(intent, row);
      if (!matched) {
        if (row !== null) this.boundRow(row, c, intent.id);
        record.readNotice = row === null ? '尚未读到原编号，不代表失败、取消或删除成功；原操作继续保留。' : '当前内容与原操作尚未一致，不能确认完成；不会再次发送。';
        this.render(); return;
      }
      if (ram()[key] === record) delete ram()[key];
      this._pending = null; this._completed = { operation: intent.operation, id: intent.id }; this.setData({ error: '' }); this.render();
    } catch (error) { await this.failure(error, c); }
  },
  async reconcile() {
    if (this.syncScope() || this.isPreview() || !this._visible || this._gone || !this._authorized || !this._pending || this._flight || this._read || this._modal) return;
    const c = this.context(), record = this._pending, token = this._flight = {};
    this.setData({ loading: true, error: '' }); this.render();
    try { await this.readback(record, c); }
    finally { if (this._flight === token) { this._flight = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async returnLibrary() {
    if (this.syncScope() || !this._visible || this._gone || this._modal) return;
    const c = this.context(); if (!c) return;
    if (!this._pending && !this._completed && this.dirty() && !await this.modal(c, '返回素材库', '本页草稿尚未保存，确认返回？不会自动保存或发送。')) return;
    if (this.current(c)) this.navigate('/pages/marketing/index?tab=library');
  },
}));
