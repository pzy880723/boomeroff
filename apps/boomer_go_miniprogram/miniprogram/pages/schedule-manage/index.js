const { definePage } = require('../../shared/page');
const model = require('./model');
function empty() { return { shopName: '', weekStart: '', weekEnd: '', days: [], canView: false, canArrange: false, candidateVisible: false, candidates: [], query: '', candidateLoading: false, candidateMore: false, targetDate: '', targetUser: '', targetName: '', editorVisible: false, cellReadable: false, shifts: [], selectedShift: '', originalShift: '', visibleWarnings: [], warningsAccepted: [], hardWarning: false, rulesVisible: false, canSave: false, canDelete: false, pendingRequests: [], pending: false, receiptConfirmed: false, canRetrySame: false, conflict: false, saved: false, loading: false, sending: false, confirming: false, error: '', readbackError: '', notice: '' }; }
Page(definePage({
  data: empty(),
  onLoad(q) { this._weekStart = q.week_start || model.monday(model.today(Date.now())); this._epoch = 0; this._edit = 0; this._candidateSerial = 0; this._scope = model.scope(this); this._target = null; this._authorized = false; },
  onShow() { this._visible = true; return this.refresh(); },
  onHide() { this.pause(); },
  onUnload() { this.pause(); this.clearPrivate(); },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()); },
  isPreview() { return !!(this.preview || this.data.preview || getApp().preview); },
  clearPrivate() { this._target = null; this._draft = null; this._base = null; this._cell = null; this._week = null; this._caps = null; this._pending = null; this._records = []; this._conflict = false; this._needsRefresh = false; this._read = null; this._flight = null; this._modal = null; this._authorized = false; this._candidateRead = null; this._pickDate = ''; },
  pause() {
    this._visible = false; this._epoch++; this._candidateSerial++;
    model.records(getApp(), this).forEach(r => { if (!r.receipt) r.unknown = true; });
    this._authorized = false; this._read = null; this._flight = null; this._modal = null; this._candidateRead = null; this._week = null; this._cell = null; this._caps = null; this._records = [];
    if (this._target) this._target.name = '';
    if (this._gone) Object.assign(this.data, empty()); else this.setData(empty());
  },
  syncScope() { const scope = model.scope(this); if (scope === this._scope) return false; this._scope = scope; this._epoch++; this._candidateSerial++; this.clearPrivate(); if (this._visible && !this._gone) this.setData(empty()); else Object.assign(this.data, empty()); return true; },
  capture() { return { scope: model.scope(this), epoch: this._epoch, resource: this._target ? this._target.user_id + ':' + this._target.work_date : '' }; },
  current(c) { this.syncScope(); return !!(c && this._visible && !this._gone && c.scope === model.scope(this) && c.epoch === this._epoch && c.resource === (this._target ? this._target.user_id + ':' + this._target.work_date : '')); },
  focusPanel(c, selector) {
    if (!this.current(c) || c.seq != null && c.seq !== this._candidateSerial || typeof wx.pageScrollTo !== 'function') return;
    if (selector === '#manager-candidates' ? this.data.candidateVisible : selector === '#manager-editor' && this.data.editorVisible) wx.pageScrollTo({ selector, duration: 200 });
  },
  params() { return Object.assign(model.binding(this), { user_id: this._target.user_id, work_date: this._target.work_date }); },
  async failure(error, c, readback) {
    if (!this.current(c)) return;
    if (this._pending && error.status === 404 && error.code === 'not_found') { this._cell = null; this.setData({ canRetrySame: false }); }
    if (error.status === 401 || error.status === 403) {
      if (this._pending && !this._pending.receipt) this._pending.unknown = true;
      this._authorized = false; this._cell = null; this._week = null; this._caps = null;
      if (this._target) this._target.name = '';
      this.setData(empty());
      if (error.status === 401) return this.run(async () => { const safe = new Error('员工登录已过期，请重新登录'); safe.status = 401; safe.requestRevision = error.requestRevision; throw safe; }, { silent: true });
      this.setData({ error: '当前门店排班权限不可用，原请求仍保留；请重新核验。' }); return;
    }
    this.setData(readback ? { readbackError: '回执已确认，但当前单格尚未核验一致；只读回查，不再发送。', notice: '排班详情回读未完成，不能宣称本次操作完成。' } : { error: this.data.saved ? '本次单格已核验；周列表刷新未完成，请只读重试。' : '排班读取或操作未确认，请核对权限和最新单格后重试。' });
    if (this._authorized) this.render(this._pending && !this._cell ? c : undefined);
  },
  async authorize(c) {
    const p = model.binding(this), raw = await this.api.action('schedule-manage-capabilities', p);
    if (!this.current(c)) return false;
    this._caps = model.caps(raw, p.shop_id); this._authorized = this._caps.canView;
    if (!this._authorized) { this._week = null; this._cell = null; this.setData(Object.assign(empty(), { error: '当前账号未获准查看门店排班；角色名称不能代替权限。' })); return false; }
    if (this._target) this.restorePending(c);
    this.render();
    return true;
  },
  restorePending(c) {
    if (!this.current(c)) return;
    const p = this.params(), actor = this.session.get().userId;
    const record = this._caps.canArrange && !this.isPreview() ? model.ram(getApp())[model.key(actor, p)] : null;
    if (record) {
      model.check(!record.preview && record.actorId === actor && record.payload.shop_id === p.shop_id && record.payload.user_id === p.user_id && record.payload.work_date === p.work_date && model.UUID.test(p.user_id) && model.date(p.work_date) && model.UUID.test(record.payload.request_id) && Array.isArray(record.payload.acknowledged_warnings));
      if (this._pending !== record && !record.receipt) record.unknown = true;
      this._draft = { shiftId: record.payload.shift_id || '', ack: record.payload.acknowledged_warnings.slice() };
    }
    this._pending = record || null;
  },
  async fetchWeek(c) {
    const p = Object.assign(model.binding(this), { week_start: this._weekStart });
    const raw = await this.api.action('schedule-manage-week', p); if (!this.current(c)) return;
    this._week = model.week(raw, p.shop_id, p.week_start);
    this.setData({ days: this._week.days, weekStart: p.week_start, weekEnd: this._week.end, shopName: this.session.get().shop.name || '当前已验证门店' });
    if (this._target) { const row = this._week.days.flatMap(d => d.rows).find(r => r.user_id === this._target.user_id && r.work_date === this._target.work_date); if (row) this._target.name = row.name; }
  },
  async refresh(adopt) {
    this.syncScope(); if (!this._visible || this._gone || this._read || this._flight || this._modal || this._candidateRead) return;
    this._epoch++; const c = this.capture(); this._read = c; this._authorized = false;
    if (this._target) this._needsRefresh = true;
    this.setData({ loading: true, canSave: false, canDelete: false, canArrange: false, canRetrySame: false, error: '' });
    try {
      model.check(model.date(this._weekStart) && model.monday(this._weekStart) === this._weekStart, '请选择有效的周一日期'); model.binding(this);
      if (!await this.authorize(c)) return;
      await this.fetchWeek(c); if (!this.current(c)) return;
      if (this._target) await this.fetchCell(c, adopt === true);
      if (this.current(c)) { this._needsRefresh = false; this.render(c); }
    } catch (error) { await this.failure(error, c, !!(this._pending && this._pending.receipt)); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  render(focus) {
    if (!this._visible || !this._authorized || !this._caps) return;
    this._records = this._caps.canArrange && !this.isPreview() ? model.records(getApp(), this) : [];
    const pendingRequests = this._records.map((r, index) => ({ index, date: r.payload.work_date, label: r.payload.operation === 'delete' ? '移除排班' : r.payload.operation === 'create' ? '新增排班' : '改班', confirmed: !!r.receipt }));
    const c = this._cell, p = this._pending, d = this._draft;
    const selected = c && d && c.shifts.find(s => s.id === d.shiftId && s.selectable), soft = c && d ? model.applicable(c, d.shiftId) : [];
    const allowed = !!(c && d && this._caps.canArrange && !this._needsRefresh && !this._conflict && !p && !c.hard);
    const acknowledged = !!d && soft.every(w => d.ack.indexOf(w.code) >= 0);
    let notice = this.data.saved || this._needsRefresh ? this.data.notice : '';
    if (p) notice = p.receipt ? '原回执已确认，请只读回查单格，不再发送。' : this.data.canRetrySame ? '尚未查到原回执，不代表未执行、失败或取消。若重试必须再次确认同一原请求。' : '原请求结果未知，载荷和编号已冻结；请显式核对状态，不会自动重发。';
    else if (this._conflict) notice = '该格版本或规则已变化，原班次选择保留；请明确载入最新后再操作。';
    else if (this._needsRefresh && !notice) notice = '当前单格尚未重新核验，原选择保留；请重新读取权限和单格后再操作。';
    else if (c && c.hard) notice = '该员工当天已有其他门店排班，不能在此安排；不展示其他门店详情。';
    else if (this.isPreview()) notice = '开发预览为合成内容，可查看选择，不能保存、移除或查询写入状态。';
    else if (!this._caps.canArrange) notice = '当前仅可查看；安排、改班与移除需要服务器独立授权。';
    this.setData({ canView: true, canArrange: this._caps.canArrange, pendingRequests, editorVisible: !!this._target && !!(c || p && this._caps.canArrange), cellReadable: !!c, targetDate: this._target ? this._target.work_date : '', targetUser: this._target ? this._target.user_id : '', targetName: this._target ? model.name(this._target.name, this._target.user_id) : '',
      originalShift: c ? c.assignment ? c.assignment.shift_code : '未排班' : '', shifts: c ? c.shifts : [], selectedShift: d ? d.shiftId : '', visibleWarnings: soft.map(w => Object.assign({}, w, { checked: d.ack.indexOf(w.code) >= 0 })), warningsAccepted: d ? d.ack.slice() : [], hardWarning: !!(c && c.hard), rulesVisible: !!(c && c.rulesVisible),
      canSave: !!(allowed && c.canSave && selected && acknowledged && !this.isPreview()), canDelete: !!(allowed && c.canDelete && c.assignment && !this.isPreview()), conflict: !!this._conflict, pending: !!p && this._caps.canArrange, receiptConfirmed: !!(p && p.receipt), notice }, focus ? () => this.focusPanel(focus, '#manager-editor') : undefined);
  },
  async changeWeek(e) {
    if (this.syncScope() || !this._visible || this._target || this._read || this._flight || this._modal || this._candidateRead) return;
    let next; try { next = e.detail && e.detail.value ? model.monday(e.detail.value) : model.addDays(this._weekStart, Number(e.currentTarget.dataset.offset)); model.check(model.date(next) && model.monday(next) === next); } catch (_) { this.setData({ error: '周日期无效' }); return; }
    this._weekStart = next; this._epoch++; this._pickDate = ''; this.setData({ candidateVisible: false, candidates: [], days: [] }); return this.refresh();
  },
  async addDay(e) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this._target || this._read || this._flight || this._modal || this._candidateRead) return;
    const date = e.currentTarget.dataset.date; if (!this._week || !this._week.days.some(d => d.date === date)) return;
    this._pickDate = date; this._epoch++; this._query = ''; this._cursor = null; this.setData({ candidateVisible: true, candidates: [], query: '', targetDate: date, error: '', saved: false });
    return this.fetchCandidates(true);
  },
  onQuery(e) { if (!this.syncScope() && this._visible && !this._gone && this.data.candidateVisible && !this._target) { this._candidateSerial++; this._candidateRead = null; this._cursor = null; this.setData({ query: e.detail.value, candidates: [], candidateMore: false, candidateLoading: false }); } },
  searchCandidates() { return this.fetchCandidates(true); },
  loadMoreCandidates() { if (this.data.candidateMore && !this._candidateRead) return this.fetchCandidates(false); },
  async fetchCandidates(reset) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || !this.data.candidateVisible || this._target || this._flight || this._modal) return;
    const q = reset ? this.data.query.trim() : this._query;
    if (Array.from(q).length > 40) { this.setData({ error: '候选搜索最多 40 个字，输入未截断' }); return; }
    const c = Object.assign(this.capture(), { seq: ++this._candidateSerial }); this._candidateRead = c;
    const p = Object.assign(model.binding(this), { work_date: this._pickDate, q }); if (!reset && this._cursor) p.cursor = this._cursor;
    this.setData({ candidateLoading: true, error: '' });
    try {
      const raw = await this.api.action('schedule-manage-candidates', p); if (!this.current(c) || c.seq !== this._candidateSerial) return;
      const result = model.candidates(raw, p), items = reset ? [] : this.data.candidates.slice(), seen = new Set(items.map(x => x.id));
      result.items.forEach(x => { if (!seen.has(x.id)) { seen.add(x.id); items.push(x); } }); this._query = q; this._cursor = result.next;
      this.setData({ candidates: items, candidateMore: result.hasMore }, reset ? () => this.focusPanel(c, '#manager-candidates') : undefined);
    } catch (error) { if (this.current(c) && c.seq === this._candidateSerial) await this.failure(error, c); }
    finally { if (this._candidateRead === c) { this._candidateRead = null; if (this.current(c)) this.setData({ candidateLoading: false }); } }
  },
  closeCandidates() { if (this.syncScope() || !this._visible || this._target || this._flight || this._modal) return; this._epoch++; this._candidateSerial++; this._candidateRead = null; this._pickDate = ''; this.setData({ candidateVisible: false, candidates: [], query: '', candidateLoading: false, error: '' }); },
  chooseCandidate(e) { if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this._candidateRead || this._target || this._read || this._flight || this._modal) return; const item = this.data.candidates.find(x => x.id === e.currentTarget.dataset.id); if (item) return this.select({ user_id: item.id, work_date: this._pickDate, name: item.name }); },
  openAssignment(e) { if (this.syncScope() || !this._visible || !this._authorized || !this._week || this._target || this._read || this._flight || this._modal || this._candidateRead) return; const row = this._week.days.flatMap(d => d.rows).find(r => r.assignment_id === e.currentTarget.dataset.id); if (row) return this.select({ user_id: row.user_id, work_date: row.work_date, name: row.name }); },
  async select(target) {
    this._target = target; this._epoch++; this._edit++; this._base = null; this._cell = null; this._draft = null; this._pending = null; this._conflict = false; this._needsRefresh = false;
    this.setData({ saved: false, candidateVisible: false, candidates: [], editorVisible: false, error: '', readbackError: '', canRetrySame: false });
    const c = this.capture(); this._read = c; this.setData({ loading: true });
    try { if (await this.authorize(c)) { await this.fetchCell(c); if (this.current(c)) this.render(c); } } catch (error) { await this.failure(error, c, !!(this._pending && this._pending.receipt)); }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async fetchCell(c, adopt) {
    const p = this.params(), raw = await this.api.action('schedule-manage-cell', p); if (!this.current(c)) return;
    const result = model.cell(raw, p); this._cell = result;
    if (this._base && this._base.version !== result.version && !adopt) { this._conflict = true; if (this._draft) this._draft.ack = []; }
    if (!this._base || adopt) { this._base = result; this._draft = { shiftId: model.initialShift(result), ack: [] }; this._edit++; if (adopt) this._conflict = false; }
    const record = this._pending;
    if (record) {
      this._draft = { shiftId: record.payload.shift_id || '', ack: record.payload.acknowledged_warnings.slice() };
      if (record.receipt) return this.readback(record, c, result);
    }
  },
  editable() { return !this.syncScope() && this._visible && !this._gone && this._authorized && this._caps && this._caps.canArrange && this._cell && this._draft && !this._pending && !this._read && !this._flight && !this._needsRefresh && !this._conflict; },
  chooseShift(e) { if (!this.editable()) return; const id = e.currentTarget.dataset.id; if (!this._cell.shifts.some(s => s.id === id && s.selectable)) return; this._draft.shiftId = id; this._draft.ack = []; this._edit++; this.setData({ error: '' }); this.render(); },
  onWarnings(e) { if (!this.editable() || !Array.isArray(e.detail.value)) return; const allowed = model.applicable(this._cell, this._draft.shiftId).map(w => w.code); if (!e.detail.value.every(x => allowed.indexOf(x) >= 0)) return; this._draft.ack = Array.from(new Set(e.detail.value)); this._edit++; this.render(); },
  dirty() { return !!(this._draft && this._base && (this._draft.shiftId !== model.initialShift(this._base) || this._draft.ack.length)); },
  async modal(c, title, content) {
    if (this._modal) return false; this._modal = c; const edit = this._edit; this.setData({ confirming: true });
    try { const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmColor: '#EB0029', success: resolve, fail: reject })); return result.confirm === true && this.current(c) && this._edit === edit; }
    catch (_) { return false; } finally { if (this._modal === c) { this._modal = null; if (this.current(c)) this.setData({ confirming: false }); } }
  },
  async cancelEditor() {
    if (this.syncScope() || !this._visible || !this._target || this._read || this._flight || this._modal) return;
    const c = this.capture(); if ((this.dirty() || this._pending) && !await this.modal(c, '收起单格编辑', this._pending ? '只收起当前界面，不会取消或删除已发送原请求；稍后仍须核对。' : '放弃本页未保存的班次选择与提醒确认？不会修改排班。')) return;
    if (!this.current(c)) return;
    this._target = null; this._base = null; this._cell = null; this._draft = null; this._pending = null; this._conflict = false; this._epoch++;
    this.setData({ editorVisible: false, selectedShift: '', targetName: '', targetUser: '', targetDate: '', shifts: [], visibleWarnings: [], warningsAccepted: [], canRetrySame: false, readbackError: '', error: '' }); this.render();
  },
  async reloadLatest() { if (this.syncScope() || !this._visible || !this._target || this._pending || this._read || this._flight || this._modal) return; const c = this.capture(); if (await this.modal(c, '载入最新单格', '将放弃未保存的班次与提醒确认，重新读取权限和最新版本。不会写入。')) return this.refresh(true); },
  save() { return this.confirmWrite(this._base && this._base.assignment ? 'update' : 'create'); },
  remove() { return this.confirmWrite('delete'); },
  async confirmWrite(operation) {
    if (!this.editable() || this.isPreview() || this._modal || !(operation === 'delete' ? this.data.canDelete : this.data.canSave)) return;
    const c = this.capture(), base = this._base, draft = { shiftId: this._draft.shiftId, ack: this._draft.ack.slice() };
    this._read = c; this.setData({ loading: true });
    try { if (!await this.authorize(c) || !this._caps.canArrange) return; } catch (error) { await this.failure(error, c); return; }
    finally { if (this._read === c) { this._read = null; if (this.current(c)) this.setData({ loading: false }); } }
    if (!this.current(c) || !this.editable()) return;
    const s = this._cell.shifts.find(x => x.id === draft.shiftId), original = base.assignment ? base.assignment.shift_code : '未排班';
    const content = (this.session.get().shop.name || '当前授权门店') + ' · ' + model.name(this._target.name, this._target.user_id) + ' · ' + this._target.work_date + '\n' + original + ' → ' + (operation === 'delete' ? '移除排班（不会新增休息或请假记录）' : s.name + ' ' + s.time) + '\n确认后立即生效，不含发布阶段或员工通知。';
    if (!await this.modal(c, operation === 'delete' ? '确认移除排班' : '确认单格排班', content)) return;
    if (!this.current(c) || this.isPreview() || !this.editable() || this._base !== base) return;
    const actor = this.session.get().userId, key = model.key(actor, this.params()), memory = model.ram(getApp());
    if (memory[key]) { this._pending = memory[key]; this._pending.unknown = true; this.render(); return; }
    const p = model.freeze(Object.assign(this.params(), { request_id: model.requestId(), operation, assignment_id: operation === 'create' ? null : base.assignment.assignment_id, expected_cell_version: base.version, shift_id: operation === 'delete' ? null : draft.shiftId, acknowledged_warnings: operation === 'delete' ? [] : draft.ack }));
    const record = { actorId: actor, preview: false, payload: p, unknown: false, retryBlocked: false, receipt: null };
    memory[key] = record; this._pending = record; return this.send(record, c);
  },
  async send(record, c) {
    if (!this.current(c) || this.isPreview() || !this._authorized || !this._caps.canArrange || this._pending !== record || record.receipt || this._flight) return;
    this._flight = record; this.setData({ sending: true, error: '', canSave: false, canDelete: false, canRetrySame: false }); this.render();
    try {
      const raw = await this.api.action('schedule-manage-write', record.payload); if (!this.current(c) || this._pending !== record) { record.unknown = true; return; }
      record.receipt = model.receipt(raw, record.payload, record.actorId); this.setData({ receiptConfirmed: true }); await this.readback(record, c);
    } catch (error) {
      const current = this.current(c), memory = model.ram(getApp()), key = model.key(record.actorId, record.payload);
      if (current && this._pending === record && memory[key] === record && record.unknown === false && !record.receipt && model.aborted(error)) {
        delete memory[key]; this._pending = null; this._needsRefresh = true; if (error.code === 'version_conflict') this._conflict = true;
        this.setData({ notice: '本次请求明确被拒绝，原班次选择保留；请明确重新读取权限和单格再操作。' });
      } else { record.unknown = true; if (error.code === 'request_id_conflict') record.retryBlocked = true; }
      if (current) { await this.failure(error, c, !!record.receipt); this.render(); }
    } finally { if (this._flight === record) { this._flight = null; if (this.current(c)) { this.setData({ sending: false }); this.render(); } } }
  },
  async readback(record, c, knownCell) {
    if (!this.current(c) || this._pending !== record || !record.receipt) return;
    try {
      const result = knownCell || model.cell(await this.api.action('schedule-manage-cell', { shop_id: record.payload.shop_id, user_id: record.payload.user_id, work_date: record.payload.work_date }), record.payload);
      if (!this.current(c) || this._pending !== record) return;
      model.check(model.matches(result, record.payload, record.receipt), '回读单格与原回执不一致');
    } catch (error) { await this.failure(error, c, true); return; }
    if (!this.current(c)) return;
    const memory = model.ram(getApp()), key = model.key(record.actorId, record.payload); if (memory[key] === record) delete memory[key];
    this._pending = null; this._target = null; this._base = null; this._cell = null; this._draft = null; this._conflict = false; this._epoch++;
    this.setData({ saved: true, loading: false, sending: false, editorVisible: false, pending: false, receiptConfirmed: true, canSave: false, canDelete: false, canRetrySame: false, targetName: '', targetUser: '', targetDate: '', selectedShift: '', shifts: [], visibleWarnings: [], warningsAccepted: [], error: '', readbackError: '', notice: '本次原回执与单格状态已核验，排班立即生效；未执行员工通知。' });
    const next = this.capture(); try { await this.fetchWeek(next); this.render(); } catch (error) { await this.failure(error, next); }
  },
  async retryReadback() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this.isPreview() || !this._pending || !this._pending.receipt || this._read || this._flight || this._modal) return;
    const c = this.capture(), record = this._pending; this._flight = c; this.setData({ loading: true });
    try { if (await this.authorize(c) && this._caps.canArrange) await this.readback(record, c); } catch (error) { await this.failure(error, c, true); }
    finally { if (this._flight === c) { this._flight = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async reconcile() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this.isPreview() || !this._pending || this._read || this._flight || this._modal) return;
    if (this._pending.receipt) return this.retryReadback();
    const record = this._pending, c = this.capture(), p = record.payload; this._flight = c; this.setData({ loading: true, canRetrySame: false, error: '' });
    try {
      if (!await this.authorize(c) || !this._caps.canArrange || !this.current(c)) return;
      const raw = await this.api.action('schedule-manage-write-status', { shop_id: p.shop_id, request_id: p.request_id, operation: p.operation, user_id: p.user_id, work_date: p.work_date });
      if (!this.current(c) || this._pending !== record) return;
      const r = model.status(raw, p, record.actorId);
      if (r) { record.receipt = r; this.setData({ receiptConfirmed: true }); await this.readback(record, c); }
      else this.setData({ canRetrySame: !record.retryBlocked && !!this._cell, notice: '尚未查到原回执，不代表未执行、失败或取消。可稍后核对；若重试必须再次确认同一原请求。' });
    } catch (error) { if (error.code === 'request_id_conflict') record.retryBlocked = true; await this.failure(error, c); }
    finally { if (this._flight === c) { this._flight = null; if (this.current(c)) { this.setData({ loading: false }); this.render(); } } }
  },
  async retrySame() {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this.isPreview() || !this._cell || !this._pending || this._pending.receipt || this._pending.retryBlocked || !this.data.canRetrySame || this._read || this._flight || this._modal) return;
    const record = this._pending, c = this.capture(); if (await this.modal(c, '按同一原请求重试', '查不到回执不能证明没有执行。将严格复用原编号、原版本、原班次和提醒确认，不替换载荷或创建新请求。')) { if (this.current(c) && this._pending === record && !this.isPreview()) { record.unknown = true; return this.send(record, c); } }
  },
  resume(e) {
    if (this.syncScope() || !this._visible || !this._authorized || !this._caps.canArrange || this.isPreview() || this._target || this._read || this._flight || this._modal) return;
    const record = this._records && this._records[Number(e.currentTarget.dataset.index)]; if (!record) return;
    const p = record.payload; this._weekStart = model.monday(p.work_date); this._target = { user_id: p.user_id, work_date: p.work_date, name: '' }; this._epoch++; this._draft = null; this._base = null; this._cell = null; this._pending = null; this._conflict = false;
    return this.refresh();
  },
  retry() { return this.refresh(); }
}));
