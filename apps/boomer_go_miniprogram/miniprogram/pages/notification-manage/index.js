const { definePage } = require('../../shared/page');
const notification = require('../../shared/notification-manage');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clone = value => JSON.parse(JSON.stringify(value));
const blank = () => ({ title: '', body: '', active: true, expires_at: null });
const empty = () => ({ items: [], canManage: false, audience: '全局通知 · 影响所有门店员工', editorVisible: false,
  title: '', body: '', titleCount: 0, bodyCount: 0, active: true, expiryDate: '', assetId: '', editable: false,
  canSave: false, canDelete: false, pending: false, receiptConfirmed: false, saved: false, conflict: false,
  loading: false, sending: false, confirming: false, validation: '', error: '', listError: '', notice: '' });
function ram() { const app = getApp(); return app._notificationManagePending || (app._notificationManagePending = Object.create(null)); }
function dateLabel(value) {
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date + 8 * 3600000).toISOString().slice(0, 10) : '';
}
function patchFor(base, draft) {
  const patch = {};
  for (const key of ['title', 'body', 'active', 'expires_at']) {
    if (!base || draft[key] !== base[key]) patch[key] = typeof draft[key] === 'string' && ['title', 'body'].indexOf(key) >= 0 ? draft[key].trim() : draft[key];
  }
  return patch;
}
function invalidDraft(base, draft) {
  const patch = patchFor(base, draft);
  if (Object.prototype.hasOwnProperty.call(patch, 'title') && (!patch.title || patch.title.length > 60)) return '标题不能为空，且不能超过 60 字；草稿不会截断。';
  if (Object.prototype.hasOwnProperty.call(patch, 'body') && patch.body.length > 500) return '正文不能超过 500 字；草稿不会截断。';
  return '';
}

Page(definePage({
  data: empty(),
  onLoad() { this._visible = true; this._epoch = 0; this._edit = 0; this._scope = this.identity(); this._rows = []; return this.refresh(); },
  onShow() {
    const changed = this.syncScope(), hidden = !this._visible;
    this._visible = true;
    if (hidden || changed) return this.refresh();
    return this._read && this._read.promise;
  },
  onHide() {
    this._visible = false; this._epoch++; this._authorized = false; this._editorVerified = false;
    this._read = null; this._flight = null; this._modal = null;
    if (this._pending && !this._pending.representation) this._pending.unknown = true;
    this.clearView();
  },
  onUnload() { this.onHide(); this._draft = null; this._base = null; this._pending = null; this._completed = null; this._rows = []; },
  clearView() { if (this._gone) Object.assign(this.data, empty()); else this.setData(empty()); },
  isPreview() { return !!(this.preview || getApp().preview); },
  identity() {
    const user = this.session.get();
    return JSON.stringify([user && user.userId, user && user.shop && user.shop.id, user && user.scopeVersion,
      this.session.revision ? this.session.revision() : null, this.isPreview()]);
  },
  syncScope() {
    const scope = this.identity(); if (scope === this._scope) return false;
    this._scope = scope; this._epoch++; this._edit++; this._authorized = false; this._editorVerified = false;
    this._draft = null; this._base = null; this._id = ''; this._editor = false; this._rows = [];
    this._pending = null; this._completed = null; this._conflict = false; this._read = null; this._flight = null; this._modal = null;
    this.clearView(); return true;
  },
  context() {
    const user = this.session.get();
    return user && typeof user.userId === 'string' && UUID.test(user.userId)
      ? { userId: user.userId, scope: this.identity(), epoch: this._epoch, revision: this.session.revision ? this.session.revision() : null } : null;
  },
  current(c) { this.syncScope(); return !!c && !this._gone && this._visible && c.scope === this.identity() && c.epoch === this._epoch; },
  editable() { return !!(this._visible && !this._gone && this._authorized && this._editorVerified && this._editor && this._draft && !this._pending && !this._completed && !this._read && !this._flight); },
  dirty() { return !!this._draft && Object.keys(patchFor(this._base || blank(), this._draft)).length > 0; },
  render() {
    if (!this._visible || this._gone || !this._authorized) return;
    const d = this._draft || blank(), p = this._pending, editable = this.editable(), validation = invalidDraft(this._base, d);
    this.setData({ canManage: true, items: this._rows.map(r => ({ id: r.id, title: r.title, body: r.body.slice(0, 120), active: r.active,
      expiry: r.expires_at === null ? '长期有效' : dateLabel(r.expires_at) || '有效期未能识别', expired: r.expires_at !== null && Date.parse(r.expires_at) <= Date.now(), type: r.type })),
      editorVisible: !!this._editor, title: this._editor ? d.title : '', body: this._editor ? d.body : '',
      titleCount: this._editor ? d.title.length : 0, bodyCount: this._editor ? d.body.length : 0,
      active: d.active, expiryDate: dateLabel(d.expires_at), assetId: p ? p.intent.id : this._id || '', editable,
      canSave: editable && !this._conflict && !validation && this.dirty() && !this.isPreview(),
      canDelete: editable && !!this._base && !this._conflict && !this.isPreview(), validation,
      pending: !!p, receiptConfirmed: !!(p && p.representation || this._completed), saved: !!this._completed, conflict: !!this._conflict,
      notice: this._completed ? (this._completed.operation === 'delete' ? '已核对删除返回和原编号不存在；不会删除图片文件。' : '已核对原编号与当前内容，不代表不可变请求回执或恰好执行一次。')
        : p ? p.readNotice || (p.representation ? '已收到匹配操作返回，请只读核对当前状态；不会再次发送。' : '原操作结果尚未确认，原编号与内容保留；不会重发或换新编号。')
        : this._conflict ? '服务器内容已变化，本地草稿保留。请明确放弃草稿并载入最新内容。' : '' });
  },
  async failure(error, c) {
    if (!this.current(c)) return;
    if (error.status === 401 || error.status === 403) {
      this._authorized = false; this._editorVerified = false; this.clearView();
      if (error.status === 401 && (error.requestRevision == null || error.requestRevision === c.revision)) return this.run(async () => { throw error; }, { silent: true });
      this.setData({ error: '当前管理权限不可用，请重新核验；原待确认操作仍保留。' }); return;
    }
    this.setData({ error: this._pending ? '操作或回读尚未确认，原操作保留，请只读核对。' : '通知读取或格式核验失败，请手动重试；草稿保留。' });
  },
  restorePending(c) {
    if (this.isPreview()) return false;
    const store = ram(), key = Object.keys(store).find(k => store[k] && store[k].intent && store[k].intent.userId === c.userId);
    if (!key) return false;
    const record = store[key];
    if (!UUID.test(record.intent.id) || ['create', 'update', 'delete'].indexOf(record.intent.operation) < 0) throw Error('unconfirmed');
    record.key = key; record.unknown = true; this._pending = record; this._base = record.base; this._draft = clone(record.draft);
    this._id = record.intent.operation === 'create' ? '' : record.intent.id; this._editor = true; this._editorVerified = false; return true;
  },
  refresh(adopt) {
    if (this._gone || !this._visible) return;
    this.syncScope(); if (this._read || this._flight || this._modal) return;
    const c = this.context(); if (!c) { this._authorized = false; this.clearView(); this.setData({ error: '请先登录有效员工账号。' }); return; }
    const read = this._read = {}; this._authorized = false; this._editorVerified = false;
    this.setData({ loading: true, canManage: false, editable: false, canSave: false, canDelete: false, error: '', listError: '' });
    read.promise = (async () => {
      try {
        const caps = await this.api.notificationManageCapabilities();
        if (!this.current(c) || this._read !== read) return;
        if (!caps || caps.can_manage !== true) { this.clearView(); this.setData({ notice: '当前账号没有全局系统通知管理权限。' }); return; }
        this._authorized = true; this.restorePending(c);
        try {
          const result = await this.api.notificationManageList(); if (!this.current(c) || this._read !== read) return;
          if (!result || !Array.isArray(result.items) || result.items.length > 50) throw Error('unconfirmed');
          const rows = result.items.map(r => notification.row(r));
          if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error('unconfirmed');
          this._rows = rows;
        } catch (error) {
          if (!this.current(c) || this._read !== read) return;
          if (error.status === 401 || error.status === 403) throw error;
          this._rows = []; this.setData({ listError: '最新 50 条通知暂未读取成功，请重试。' });
        }
        if (this._pending || this._completed) return;
        if (this._editor && this._id) await this.readEditor(c, read, adopt === true);
        else if (this._editor) this._editorVerified = true;
      } catch (error) { if (this.current(c) && this._read === read) await this.failure(error, c); }
      finally { if (this._read === read) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
    })(); return read.promise;
  },
  async readEditor(c, read, adopt) {
    const raw = await this.api.notificationManageRead(this._id);
    if (!this.current(c) || this._read !== read) return;
    const row = notification.row(raw); if (row.id !== this._id) throw Error('unconfirmed');
    if (this._draft && !adopt && this._base && JSON.stringify(row) !== JSON.stringify(this._base)) this._conflict = true;
    if (!this._draft || adopt) { this._base = row; this._draft = { title: row.title, body: row.body, active: row.active, expires_at: row.expires_at }; this._edit++; this._conflict = false; }
    this._editorVerified = true;
  },
  async modal(c, title, content) {
    if (this._modal) return false;
    const token = this._modal = {}, edit = this._edit; this.setData({ confirming: true });
    try {
      const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject }));
      return this._modal === token && this.current(c) && result.confirm === true && edit === this._edit;
    } catch (_) { return false; }
    finally { if (this._modal === token) { this._modal = null; if (this.current(c)) this.setData({ confirming: false }); } }
  },
  async openItem(e) {
    if (this.syncScope() || !this._authorized || !this._visible || this._gone || this._read || this._flight || this._modal || this._pending) return;
    const id = e.currentTarget.dataset.id; if (!this._rows.some(r => r.id === id)) return;
    const c = this.context();
    if (this.dirty() && !await this.modal(c, '切换通知', '将放弃当前未保存草稿，确认打开另一条通知？')) return;
    if (!this.current(c)) return;
    this._id = id; this._editor = true; this._editorVerified = false; this._draft = null; this._base = null; this._completed = null; this._conflict = false;
    const read = this._read = {}; this.setData({ loading: true, error: '' }); this.render();
    try { await this.readEditor(c, read, true); } catch (error) { if (this.current(c) && this._read === read) await this.failure(error, c); }
    finally { if (this._read === read) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async newItem() {
    if (this.syncScope() || !this._authorized || !this._visible || this._gone || this._read || this._flight || this._modal || this._pending) return;
    const c = this.context(); if (this.restorePending(c)) { this.render(); return; }
    if (this.dirty() && !await this.modal(c, '新建全局通知', '将放弃当前未保存草稿，确认新建？')) return;
    if (!this.current(c)) return;
    this._id = ''; this._base = null; this._draft = blank(); this._editor = true; this._editorVerified = true; this._completed = null; this._conflict = false; this._edit++;
    this.setData({ error: '' }); this.render();
  },
  async closeEditor() {
    if (this.syncScope() || !this._visible || this._gone || this._flight || this._read || this._modal) return;
    const c = this.context(); if (!c) return;
    if (!this._pending && !this._completed && this.dirty() && !await this.modal(c, '关闭编辑器', '将放弃当前未保存草稿；不会发布或保存。确认关闭？')) return;
    if (!this.current(c)) return;
    this._editor = false;
    if (!this._pending) { this._draft = null; this._base = null; this._completed = null; this._id = ''; this._conflict = false; }
    this.render();
  },
  edit(key, value) {
    if (this.syncScope() || !this.editable()) return;
    this._draft = { ...this._draft, [key]: value }; this._edit++; this.setData({ error: '' }); this.render();
  },
  onTitle(e) { if (typeof e.detail.value === 'string') this.edit('title', e.detail.value); },
  onBody(e) { if (typeof e.detail.value === 'string') this.edit('body', e.detail.value); },
  onActive(e) { if (typeof e.detail.value === 'boolean') this.edit('active', e.detail.value); },
  onExpiry(e) { try { if (typeof e.detail.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.detail.value)) throw Error('invalid_date'); const expiry = notification.expiry(e.detail.value); this.edit('expires_at', expiry); } catch (_) { if (!this.syncScope() && this.editable()) this.setData({ validation: '请选择有效日期，原有效期未改变。' }); } },
  clearExpiry() { this.edit('expires_at', null); },
  async reloadLatest() {
    if (this.syncScope() || !this._authorized || !this._visible || this._gone || this._read || this._flight || this._modal || this._pending || this._completed) return;
    const c = this.context(); if (!c) return;
    if (this._draft && !await this.modal(c, '载入最新内容', '将放弃本地未保存草稿，读取最新通知；不会写入。确认继续？')) return;
    if (this.current(c)) return this.refresh(true);
  },
  async toggleItem(e) {
    if (this.syncScope() || this.isPreview() || !this._authorized || !this._visible || this._gone || this._read || this._flight || this._modal || this._pending) return;
    const id = e.currentTarget.dataset.id; if (!this._rows.some(r => r.id === id)) return;
    if (this.dirty()) { this.setData({ error: '请先保存或明确放弃编辑器中的草稿，再上下架通知。' }); return; }
    const c = this.context();
    await this.openItem(e);
    if (!this.current(c) || !this._base || this._id !== id || !this.editable()) return;
    return this.confirmOperation('toggle');
  },
  save() { return this.confirmOperation(this._base ? 'update' : 'create'); },
  remove() { return this.confirmOperation('delete'); },
  async confirmOperation(action) {
    if (this.syncScope() || this.isPreview() || !this.editable() || this._modal || this._conflict) return;
    if (action === 'delete' || action === 'toggle') { if (!this._base) return; }
    else if (invalidDraft(this._base, this._draft) || !this.dirty()) return;
    const c = this.context(); if (this.restorePending(c)) { this.render(); return; }
    const base = this._base, draft = this._draft, id = this._id;
    const title = action === 'delete' ? '删除全局通知' : action === 'toggle' ? (base.active ? '下架全局通知' : '启用全局通知') : '保存全局通知';
    const content = '此操作影响所有门店的全体员工，不是当前门店私有通知。' + (action === 'delete' ? '确认永久删除？已读记录也随通知删除，不删除图片文件。' : '确认' + (action === 'toggle' ? (base.active ? '下架' : '启用') : '保存') + '？');
    if (!await this.modal(c, title, content)) return;
    if (!this.current(c) || !this.editable() || this.isPreview() || this._conflict || base !== this._base || draft !== this._draft || id !== this._id) return;
    if (this.restorePending(c)) { this.render(); return; }
    let intent;
    try { intent = action === 'create' ? notification.create(c, draft) : action === 'delete' ? notification.remove(c, base)
      : notification.update(c, base, action === 'toggle' ? { active: !base.active } : patchFor(base, draft)); }
    catch (_) { this.setData({ validation: '通知字段或来源未能核对，草稿保留。' }); return; }
    const key = notification.key(c, id), record = { key, intent, base, draft: clone(draft), representation: false, unknown: false };
    ram()[key] = record; this._pending = record; this._flight = record; this.setData({ sending: true, error: '' }); this.render();
    try {
      const response = await this.api.notificationManageWrite(intent);
      if (!response || response.operation !== intent.operation || response.id !== intent.id || (intent.operation === 'delete' ? response.deleted !== true : !notification.match(intent, response.row))) throw Error('unconfirmed');
      if (ram()[key] === record) record.representation = true;
      if (this.current(c) && this._pending === record) { this.render(); await this.readback(record, c); }
    } catch (error) { record.unknown = true; if (this.current(c) && this._pending === record) { this.render(); await this.failure(error, c); } }
    finally { if (this._flight === record) { this._flight = null; if (this.current(c)) { this.setData({ sending: false }); this.render(); } } }
  },
  async readback(record, c) {
    try {
      const row = await this.api.notificationManageRead(record.intent.id);
      if (!this.current(c) || this._pending !== record) return;
      const matched = record.intent.operation === 'delete' ? record.representation === true && row === null : notification.match(record.intent, row);
      if (!matched) { record.readNotice = row === null ? '尚未读取到原编号，不代表失败、取消或删除成功；原操作保留。' : '当前内容尚未与原操作核对一致，不能确认完成；不会重新发送。'; this.render(); return; }
      if (ram()[record.key] === record) delete ram()[record.key];
      this._pending = null; this._completed = { operation: record.intent.operation, id: record.intent.id };
      if (record.intent.operation === 'delete') { this._rows = this._rows.filter(r => r.id !== record.intent.id); this._editor = false; }
      else {
        const verified = notification.row(row);
        this._base = verified; this._draft = { title: verified.title, body: verified.body, active: verified.active, expires_at: verified.expires_at };
        this._id = verified.id; this._conflict = false;
        this._rows = this._rows.map(r => r.id === verified.id ? verified : r);
        if (record.intent.operation === 'create' && !record.unknown && !this._rows.some(r => r.id === verified.id)) this._rows = [verified].concat(this._rows).slice(0, 50);
      }
      this.setData({ error: '' }); this.render();
    } catch (error) { await this.failure(error, c); }
  },
  async reconcile() {
    if (this.syncScope() || this.isPreview() || !this._visible || this._gone || !this._authorized || !this._pending || this._flight || this._read || this._modal) return;
    const c = this.context(), record = this._pending, token = this._flight = {};
    this.setData({ loading: true, error: '' }); this.render();
    try { await this.readback(record, c); }
    finally { if (this._flight === token) { this._flight = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  }
}));
