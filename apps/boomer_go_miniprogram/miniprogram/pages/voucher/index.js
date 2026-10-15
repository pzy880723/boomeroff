const { definePage } = require('../../shared/page');
const model = require('./model');

function emptyState() {
  return { codeInput: '', shopName: '', capsLoaded: false, canLookup: false, canRedeem: false, canSubmit: false, lookup: null, lookupVerified: false, receipt: null, pending: false, canRetrySame: false, loading: false, checking: false, sending: false, checkingStatus: false, confirming: false, selecting: false, error: '', detailError: '', notice: '' };
}
function pendingMemory() {
  const app = getApp();
  if (!app._voucherPending) app._voucherPending = Object.create(null);
  return app._voucherPending;
}
function ownerKey(user) { return user && user.userId && user.shop && user.shop.id ? JSON.stringify([user.userId, user.shop.id]) : ''; }
Page(definePage({
  data: emptyState(),
  onLoad() {
    this._visible = true; this._epoch = 0; this._edit = 0; this._scope = model.scope(this); this._initialShow = true;
    return this.load();
  },
  onShow() {
    if (this._gone) return;
    this._visible = true;
    const changed = this.syncScope();
    if (this._initialShow && !changed) { this._initialShow = false; return; }
    this._initialShow = false;
    if (changed || !this.data.capsLoaded) return this.load();
    return this.resumeScan();
  },
  onHide() {
    this._visible = false; this._epoch++;
    this._lookupFlight = null; this._capsFlight = null; this._statusFlight = null; this._confirmFlight = null;
    this.setData({ loading: false, checking: false, checkingStatus: false, confirming: false, sending: false, lookupVerified: false, canSubmit: false, notice: this.data.pending ? '核销结果待确认，请核对此次请求的状态，不会自动重发。' : this.data.lookup ? '详情尚未确认，请重新查询后再操作。' : '' });
  },
  onUnload() {
    this._gone = true; this._visible = false; this._epoch++;
    this._picker = null; this._claim = null; this._pending = null;
  },
  syncScope() {
    const scope = model.scope(this);
    if (scope === this._scope) return false;
    this._scope = scope; this.clearPrivate(); return true;
  },
  clearPrivate() {
    this._epoch++; this._edit++; this._picker = null; this._claim = null; this._pending = null;
    this._lookupFlight = null; this._capsFlight = null; this._statusFlight = null; this._confirmFlight = null; this._writeFlight = null;
    if (!this._gone) this.setData(emptyState());
  },
  restorePending() {
    if (this._gone || !this._visible || this.syncScope() || this.preview || !this.data.capsLoaded || !this.data.canLookup || (this._pending && this._pending.receipt)) return false;
    const user = this.session.get(), key = ownerKey(user), record = pendingMemory()[key];
    if (!key || !record) return false;
    this._pending = { ownerKey: key, scope: this._scope, claimId: record.claimId, retryBlocked: record.retryBlocked, unknown: true, payload: Object.freeze({ shop_id: user.shop.id, code: record.code, request_id: record.request_id }), receipt: null };
    this.rememberPending(this._pending);
    this._claim = null;
    this.setData({ pending: true, codeInput: record.code, lookup: null, lookupVerified: false, receipt: null, canSubmit: false, canRetrySame: false, notice: '存在待确认的核销请求。请显式只读核对此次状态，不会自动重发。' });
    return true;
  },
  rememberPending(pending) {
    const memory = pendingMemory(), existing = memory[pending.ownerKey];
    if (existing && (existing.request_id !== pending.payload.request_id || existing.code !== pending.payload.code || existing.claimId !== pending.claimId)) return false;
    pending.unknown = pending.unknown === true || !!(existing && existing.unknown);
    pending.retryBlocked = pending.retryBlocked === true || !!(existing && existing.retryBlocked);
    memory[pending.ownerKey] = Object.freeze({ request_id: pending.payload.request_id, code: pending.payload.code, claimId: pending.claimId, retryBlocked: pending.retryBlocked, unknown: pending.unknown });
    return true;
  },
  forgetPending(pending) {
    const memory = pendingMemory(), record = memory[pending.ownerKey];
    if (record && record.request_id === pending.payload.request_id && record.code === pending.payload.code && record.claimId === pending.claimId) delete memory[pending.ownerKey];
  },
  capture() { return { scope: this._scope, epoch: this._epoch, edit: this._edit }; },
  current(context) {
    if (this._gone) return false;
    this.syncScope();
    return this._visible && context.scope === this._scope && context.epoch === this._epoch && context.edit === this._edit;
  },
  async failure(error, context, field) {
    if (!this.current(context)) return;
    if (error.status === 401 || error.status === 403) {
      this.clearPrivate();
      if (error.status === 401) return this.run(async () => { throw error; }, { silent: true });
      this.setData({ error: '当前账号或门店无权操作，请重新核验权限。' }); return;
    }
    this.setData({ [field || 'error']: error.message || '服务暂不可用，请重试' });
  },
  async load() {
    if (this._gone || !this._visible) return;
    this.syncScope();
    if (this._capsFlight) return;
    const user = this.session.get();
    if (!user || !user.shop || !user.shop.id) {
      this.setData({ canLookup: false, canRedeem: false, canSubmit: false, error: '暂无已验证的工作门店，请先确认员工身份和门店。' }); return;
    }
    const context = this.capture(); this._capsFlight = context;
    this.setData({ loading: true, error: '', shopName: user.shop.name || '当前授权门店', capsLoaded: false, canLookup: false, canRedeem: false, canSubmit: false, lookupVerified: false });
    try {
      const caps = await this.api.action('voucher-capabilities', { shop_id: user.shop.id });
      if (!this.current(context)) return;
      if (!caps || caps.shop_id !== user.shop.id || typeof caps.can_lookup !== 'boolean' || typeof caps.can_redeem !== 'boolean' || typeof caps.can_manage !== 'boolean') throw new Error('券操作权限回执不匹配，请重试');
      if (!caps.can_lookup) this.clearPrivate();
      this.setData({ capsLoaded: true, canLookup: caps.can_lookup, canRedeem: caps.can_redeem, canSubmit: false, notice: caps.can_lookup ? '' : '当前账号没有查券权限。' });
      this.restorePending();
    } catch (error) { await this.failure(error, context); }
    finally { if (this._capsFlight === context) { this._capsFlight = null; if (this.current(context)) this.setData({ loading: false }); } }
  },
  onInput(event) {
    if (this.syncScope()) return;
    if (this.data.pending || !this.data.canLookup || !this._visible || this._gone) return;
    this._edit++; this._claim = null; this._pending = null; this._lookupFlight = null;
    this.setData({ codeInput: event.detail.value, lookup: null, lookupVerified: false, canSubmit: false, receipt: null, error: '', detailError: '', notice: '', checking: false });
  },
  async query() {
    if (this._gone || !this._visible || this.syncScope() || !this.data.canLookup || this._lookupFlight || this.data.confirming || this.data.pending) return;
    if (this.data.receipt) return this.retryReadback();
    if (this.restorePending()) return;
    const code = model.parseCode(this.data.codeInput);
    if (!code) { this._claim = null; this.setData({ lookup: null, lookupVerified: false, canSubmit: false, error: '请输入 8 位字母数字券码，或扫描指定核销二维码。' }); return; }
    this.setData({ codeInput: code });
    return this.readLookup(code, this.capture(), false);
  },
  async readLookup(code, context, readback) {
    const user = this.session.get();
    if (!user || !user.shop || !this.current(context)) return;
    this._lookupFlight = context;
    this.setData({ checking: true, lookupVerified: false, canSubmit: false, error: '', detailError: '' });
    try {
      const row = await this.api.action('voucher-lookup', { shop_id: user.shop.id, code });
      if (!this.current(context) || this._lookupFlight !== context || model.parseCode(this.data.codeInput) !== code) return;
      if (!model.lookupValid(row, user.shop.id, code)) throw new Error('查券回执不匹配，详情尚未确认，请重试');
      if (readback && (!this._pending || row.claim.id !== this._pending.claimId || row.claim.status !== 'redeemed' || !model.timestamp(row.claim.redeemed_at) || Date.parse(row.claim.redeemed_at) !== Date.parse(this._pending.receipt.redeemed_at))) throw new Error('核销详情回读尚未一致，请稍后重新读取');
      this._claim = { id: row.claim.id, code, status: row.claim.status, allowed: row.can_redeem === true };
      this.setData({ lookup: model.lookupView(row), lookupVerified: true, canSubmit: !this.preview && !this._pending && !this.data.receipt && this.data.canRedeem && row.can_redeem === true && row.claim.status === 'claimed', notice: readback ? '核销回执已确认，详情已回读。' : row.can_redeem ? '' : model.reason(row.reason) });
    } catch (error) {
      if (this.current(context)) {
        this._claim = null;
        if (error.status === 404) this.setData({ lookup: null });
        if (readback) this.setData({ notice: '核销回执已确认，详情回读失败。请只重读详情，不要再次核销。' });
      }
      await this.failure(error, context, readback ? 'detailError' : 'error');
    } finally { if (this._lookupFlight === context) { this._lookupFlight = null; if (this.current(context)) this.setData({ checking: false }); } }
  },
  async scan() {
    if (this._gone || !this._visible || this.syncScope() || !this.data.canLookup || this._picker || this.data.pending || this.data.confirming || this.data.checking) return;
    if (this.restorePending()) return;
    const picker = { scope: this._scope, settled: false };
    this._picker = picker; this.setData({ selecting: true, error: '' });
    try { picker.result = await new Promise((resolve, reject) => wx.scanCode({ scanType: ['qrCode'], success: resolve, fail: reject })); }
    catch (error) { picker.error = error; }
    picker.settled = true;
    return this.resumeScan();
  },
  async resumeScan() {
    const picker = this._picker;
    if (!picker || this._gone) return;
    if (picker.scope !== model.scope(this)) { this.syncScope(); return; }
    if (!this._visible || !picker.settled) return;
    this._picker = null; this.setData({ selecting: false });
    if (picker.error) {
      if (!/cancel/i.test(picker.error.errMsg || '')) this.setData({ error: '扫码未完成，可重试或手动输入券码。' });
      return;
    }
    const code = model.parseCode(picker.result && picker.result.result);
    if (!code) { this.setData({ error: '无法识别的核销二维码，不会打开外部链接。' }); return; }
    this.onInput({ detail: { value: code } });
    return this.query();
  },
  async confirmRedeem() {
    if (this._gone || !this._visible || this.syncScope() || this.preview || !this.data.canSubmit || !this.data.lookupVerified || !this._claim || this._pending || this._confirmFlight || this._writeFlight) return;
    if (this.restorePending()) return;
    const context = this.capture(), claim = this._claim;
    const confirmed = await this.confirm(context, '确认核销', '请核对门店：' + this.data.shopName + '\n券码：' + claim.code + '\n确认后将记录核销，不会自动撤销。');
    if (!confirmed || !this.current(context) || this._claim !== claim || !this.data.canSubmit || model.parseCode(this.data.codeInput) !== claim.code) return;
    if (this.restorePending()) return;
    const user = this.session.get();
    const pending = { ownerKey: ownerKey(user), scope: this._scope, claimId: claim.id, unknown: false, payload: Object.freeze({ shop_id: user.shop.id, code: claim.code, request_id: model.requestId() }), receipt: null };
    this._pending = pending;
    return this.send(pending, context);
  },
  async confirm(context, title, content) {
    if (this._confirmFlight) return false;
    this._confirmFlight = context; this.setData({ confirming: true });
    try {
      const result = await new Promise((resolve, reject) => wx.showModal({ title, content, confirmText: '确认核销', confirmColor: '#EB0029', success: resolve, fail: reject }));
      return result.confirm === true && this.current(context);
    } catch (_) { return false; }
    finally { if (this._confirmFlight === context) { this._confirmFlight = null; if (this.current(context)) this.setData({ confirming: false }); } }
  },
  async send(pending, context) {
    if (!this.current(context) || this._pending !== pending || this.preview || this._writeFlight) return;
    if (!this.rememberPending(pending)) { this.restorePending(); return; }
    this._writeFlight = pending;
    this.setData({ pending: true, sending: true, canSubmit: false, canRetrySame: false, lookupVerified: false, error: '', notice: '正在核销，请勿重复操作。' });
    try {
      const row = await this.api.action('voucher-redeem', pending.payload);
      if (!this.current(context) || this._pending !== pending) return;
      if (!model.receiptValid(row, pending)) throw new Error('核销回执未确认，请核对此次请求状态');
      await this.acceptReceipt(row, pending, context);
    } catch (error) {
      if (this.current(context) && this._pending === pending && !pending.receipt) {
        const owned = this.rememberPending(pending);
        if (owned && !pending.unknown && model.transactionAborted(error)) {
          this.forgetPending(pending); this._pending = null; this._claim = null;
          this.setData({ pending: false, canRetrySame: false, canSubmit: false, lookupVerified: false, notice: '此次请求已明确中止。可输入下一张券，再次操作前需重新查询。' });
        } else {
          pending.unknown = true;
          if (error.code === 'request_id_conflict') pending.retryBlocked = true;
          this.rememberPending(pending);
          this.setData({ notice: '核销结果待确认，请核对此次请求状态；不会自动重发。' });
        }
      }
      await this.failure(error, context);
    } finally {
      if (this._writeFlight === pending) { this._writeFlight = null; if (this.current(context)) this.setData({ sending: false }); }
    }
  },
  async acceptReceipt(row, pending, context) {
    if (!this.current(context) || this._pending !== pending || model.parseCode(this.data.codeInput) !== pending.payload.code) return;
    this.forgetPending(pending);
    pending.receipt = row;
    this.setData({ receipt: { code: row.code, time: model.time(row.redeemed_at), replay: row.replay }, pending: false, canSubmit: false, canRetrySame: false, notice: '核销回执已确认，正在回读详情。', error: '' });
    return this.readLookup(pending.payload.code, context, true);
  },
  async checkStatus() {
    if (this._gone || !this._visible || this.syncScope() || this.preview || !this.data.capsLoaded || !this.data.canLookup || !this.data.pending || !this._pending || this._statusFlight || this._writeFlight || this._confirmFlight) return;
    const pending = this._pending, context = this.capture(); this._statusFlight = context;
    this.setData({ checkingStatus: true, canRetrySame: false, error: '' });
    try {
      const row = await this.api.action('voucher-redeem-status', pending.payload);
      if (!this.current(context) || this._pending !== pending) return;
      if (row && row.state === 'not_found') {
        this.setData({ canRetrySame: !pending.retryBlocked && this.data.canRedeem, notice: '暂未找到此次核销回执，不代表核销失败或已取消。可稍后核对，或再次确认后按原请求重试。' });
      } else if (row && row.state === 'succeeded' && model.receiptValid(row, pending)) await this.acceptReceipt(row, pending, context);
      else throw new Error('核销状态回执不匹配，结果仍待确认');
    } catch (error) { await this.failure(error, context); }
    finally { if (this._statusFlight === context) { this._statusFlight = null; if (this.current(context)) this.setData({ checkingStatus: false }); } }
  },
  async retrySame() {
    if (this._gone || !this._visible || this.syncScope() || this.preview || !this.data.canRetrySame || !this.data.canRedeem || this._confirmFlight || this._statusFlight || this._writeFlight) return;
    const pending = this._pending, context = this.capture();
    if (!pending || pending.retryBlocked) return;
    const confirmed = await this.confirm(context, '按原请求重试', '当前未找到此次回执，但不能断言核销失败。\n券码：' + pending.payload.code + '\n确认以同一个请求编号重试，不会新建核销请求。');
    if (confirmed && this.current(context) && this._pending === pending && this.data.canRetrySame) { pending.unknown = true; return this.send(pending, context); }
  },
  retryReadback() {
    if (this._gone || !this._visible || this.syncScope() || !this._pending || !this._pending.receipt || this._lookupFlight) return;
    return this.readLookup(this._pending.payload.code, this.capture(), true);
  },
  refresh() {
    if (!this.data.capsLoaded || !this.data.canLookup) return this.load();
    if (this.data.pending) return this.checkStatus();
    if (this.data.receipt) return this.retryReadback();
    return this.query();
  }
}));
