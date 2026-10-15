const { definePage } = require('../../shared/page');
const model = require('../list/model');
const dm = require('../messages/dm');

Page(definePage({
  data: { peerId: '', peerName: '同事私信', peerInfo: '仅展示服务端可见资料', messages: [], loaded: false, draft: '', sending: false, sendError: '', readError: '', statusError: '', syncError: '', peerError: '', hasOlder: false, loadingOlder: false, olderError: '', scrollTarget: '', newMessages: false, keyboardHeight: 0, opening: false, attachmentDraft: null, uploading: false, selecting: false, uploadError: '' },
  onLoad(options) {
    this._visible = true; this._epoch = 0; this._scope = model.scope(this); this._initialShow = true; this._nearBottom = true;
    const id = options.peer_id || '';
    this.setData({ peerId: id });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !this.session.get() || id === this.session.get().userId) return this.run(async () => { throw new Error('缺少有效的同事标识，不能开始会话'); });
    return Promise.all([this.load(), this.loadPeer()]);
  },
  onShow() {
    if (this._gone) return;
    if (this._initialShow && this._visible !== false) { this._initialShow = false; return; }
    this._initialShow = false;
    this._visible = true;
    if (this._scope !== model.scope(this)) {
      this._picker = null; this._choosing = false;
      this._scope = model.scope(this); this._pendingSend = null; this._before = null; this._after = null; this._attachment = null; this._selectedFile = null;
      this.setData({ messages: [], draft: '', attachmentDraft: null, selecting: false, uploading: false, uploadError: '', loaded: false, peerName: '同事私信', peerInfo: '仅展示服务端可见资料', sendError: '', readError: '', statusError: '', syncError: '', hasOlder: false });
      return Promise.all([this.load(), this.loadPeer()]);
    }
    return Promise.all([this.resumePicker(), this.data.loaded ? this.syncMessages() : this.load()]);
  },
  onHide() { this.pause(); },
  onUnload() { this._gone = true; this.pause(); this._picker = null; this._choosing = false; this._pendingSend = null; this._selectedFile = null; this._attachment = null; },
  pause() {
    this._visible = false; this._epoch = (this._epoch || 0) + 1;
    clearTimeout(this._timer); clearTimeout(this._statusTimer); this._statusFlight = null; this._historyFlight = null; this._syncFlight = null; this._readFlight = null; this._sendFlight = null; this._uploadFlight = null;
    if (!this._gone) this.setData({ loading: false, loadingOlder: false, sending: false, opening: false, uploading: false, selecting: false, keyboardHeight: 0 });
  },
  current(context) { return dm.active(this, context); },
  async failure(error, context, field) {
    if (!this.current(context)) return;
    if (error.status === 401) await this.run(async () => { throw error; }, { silent: true });
    else this.setData({ [field]: error.message || '消息服务暂不可用，请重试' });
  },
  async loadPeer() {
    const context = dm.capture(this);
    try {
      const conversations = await this.api.action('dm-conversations', { page: 0, page_size: 50 });
      if (!this.current(context)) return;
      let peer = dm.rows(conversations).map((row) => row.peer).find((row) => row && row.user_id === this.data.peerId);
      if (!peer) {
        const contacts = await this.api.action('dm-contacts', { page: 0, page_size: 50 });
        if (!this.current(context)) return;
        peer = dm.rows(contacts).find((row) => row.user_id === this.data.peerId);
      }
      if (peer) { const view = dm.person(peer); this.setData({ peerName: view.name, peerInfo: [view.shop, view.position].filter(Boolean).join(' · '), peerError: '' }); }
    } catch (error) { await this.failure(error, context, 'peerError'); }
  },
  async load() {
    if (this.data.loaded) return this.syncMessages();
    if (this._historyFlight || this._visible === false || this._gone) return;
    const context = dm.capture(this); this._historyFlight = context;
    this.setData({ loading: true, error: '' });
    try {
      const data = await this.api.action('dm-messages', { peer_id: this.data.peerId, page_size: 30 });
      if (!this.current(context)) return;
      const incoming = dm.messages(data, this.session.get().userId, this.data.peerId);
      this._before = data.next_before || null; this._after = data.next_after || null;
      await new Promise((resolve) => this.setData({ messages: dm.merge([], incoming), loaded: true, hasOlder: data.has_more === true }, resolve));
      if (!this.current(context)) return;
      this.scrollBottom(); await this.markVisible(); await this.syncVisibleStatus();
    } catch (error) { await this.failure(error, context, 'error'); }
    finally {
      if (this._historyFlight === context) this._historyFlight = null;
      if (this.current(context)) { this.setData({ loading: false }); this.schedulePoll(); }
    }
  },
  async loadOlder() {
    if (!this.data.hasOlder || this._historyFlight || this._visible === false || this._gone) return;
    const context = dm.capture(this); this._historyFlight = context;
    const before = this._before, anchor = this.data.messages[0];
    this.setData({ loadingOlder: true, olderError: '' });
    try {
      if (!before) throw new Error('服务端未提供更早消息游标，请刷新');
      const data = await this.api.action('dm-messages', { peer_id: this.data.peerId, page_size: 30, before });
      if (!this.current(context)) return;
      const incoming = dm.messages(data, this.session.get().userId, this.data.peerId);
      if (data.has_more && (!data.next_before || data.next_before === before)) throw new Error('历史游标未前进，请重试');
      this._before = data.next_before || before;
      await new Promise((resolve) => this.setData({ messages: dm.merge(this.data.messages, incoming), hasOlder: data.has_more === true, scrollTarget: anchor ? 'msg-' + anchor.id : '' }, resolve));
      if (!this.current(context)) return;
      this._nearBottom = false; await this.markVisible(); await this.syncVisibleStatus();
    } catch (error) { await this.failure(error, context, 'olderError'); }
    finally { if (this._historyFlight === context) this._historyFlight = null; if (this.current(context)) { this.setData({ loadingOlder: false }); this.schedulePoll(); } }
  },
  async syncMessages() {
    if (this._syncFlight || this._historyFlight || !this.data.loaded || this._visible === false || this._gone) return;
    clearTimeout(this._timer);
    const context = dm.capture(this); this._syncFlight = context;
    this.setData({ syncError: '' });
    try {
      let after = this._after;
      while (after) {
        const data = await this.api.action('dm-messages', { peer_id: this.data.peerId, page_size: 50, after });
        if (!this.current(context)) return;
        const incoming = dm.messages(data, this.session.get().userId, this.data.peerId);
        if (data.has_more && (!data.next_after || data.next_after === after)) throw new Error('新消息游标未前进，请重试');
        await this.mergeIncoming(incoming);
        if (!this.current(context)) return;
        this._after = data.next_after || after;
        if (!data.has_more) break;
        after = this._after;
      }
      const latest = await this.api.action('dm-messages', { peer_id: this.data.peerId, page_size: 30 });
      if (!this.current(context)) return;
      await this.mergeIncoming(dm.messages(latest, this.session.get().userId, this.data.peerId));
      if (!this.current(context)) return;
      if (!this._before && latest.next_before) { this._before = latest.next_before; this.setData({ hasOlder: latest.has_more === true }); }
      if (!this._after) this._after = latest.next_after || null;
      await this.markVisible(); await this.syncVisibleStatus();
    } catch (error) { await this.failure(error, context, 'syncError'); }
    finally {
      if (this._syncFlight === context) this._syncFlight = null;
      if (this.current(context)) this.schedulePoll();
    }
  },
  async mergeIncoming(incoming) {
    const context = dm.capture(this);
    const added = incoming.some((row) => !this.data.messages.some((old) => old.id === row.id));
    await new Promise((resolve) => this.setData({ messages: dm.merge(this.data.messages, incoming) }, resolve));
    if (!this.current(context)) return;
    if (added && this._nearBottom) this.scrollBottom();
    else if (added) this.setData({ newMessages: true });
  },
  schedulePoll() {
    clearTimeout(this._timer);
    if (!this._gone && this._visible !== false && this.data.loaded) this._timer = setTimeout(() => this.syncMessages(), 10000);
  },
  scrollBottom() {
    const last = this.data.messages[this.data.messages.length - 1];
    this._nearBottom = true;
    this.setData({ scrollTarget: last ? 'msg-' + last.id : '', newMessages: false });
  },
  onScroll(event) {
    const detail = event.detail;
    this._nearBottom = detail.scrollHeight - detail.scrollTop - (this._scrollHeight || 600) < 80;
    clearTimeout(this._statusTimer);
    if (!this._gone && this._visible !== false) this._statusTimer = setTimeout(() => this.syncVisibleStatus(), 500);
    return this.markVisible();
  },
  async visibleMessageIds(context) {
    const bounds = await new Promise((resolve) => {
      wx.createSelectorQuery().in(this).select('.chat-scroll').boundingClientRect().selectAll('.message-row').fields({ rect: true, dataset: true }).exec(resolve);
    });
    if (!this.current(context)) return [];
    const viewport = bounds && bounds[0], rects = bounds && bounds[1];
    if (!viewport || !Array.isArray(rects)) return [];
    this._scrollHeight = viewport.height;
    return Array.from(new Set(rects.filter((rect) => rect.bottom > viewport.top && rect.top < viewport.bottom).map((rect) => rect.dataset && rect.dataset.id).filter((id) => this.data.messages.some((row) => row.id === id))));
  },
  async syncVisibleStatus() {
    if (this._statusFlight || this._gone || this._visible === false || !this.data.messages.length) return;
    const context = dm.capture(this); this._statusFlight = context;
    try {
      const ids = await this.visibleMessageIds(context);
      let missing = 0;
      for (let offset = 0; offset < ids.length; offset += 100) {
        if (!this.current(context)) return;
        const chunk = ids.slice(offset, offset + 100);
        const data = await this.api.action('dm-status', { peer_id: this.data.peerId, message_ids: chunk });
        if (!this.current(context)) return;
        if (!data || data.peer_id !== this.data.peerId || !Array.isArray(data.statuses) || !Array.isArray(data.ignored_ids)) throw new Error('回执对象或返回格式不符，请重试');
        const confirmed = data.statuses.filter((row) => chunk.indexOf(row.id) >= 0 && data.ignored_ids.indexOf(row.id) < 0 && (row.read_at === null || Number.isFinite(Date.parse(row.read_at))));
        missing += chunk.filter((id) => !confirmed.some((row) => row.id === id)).length;
        this.setData({ messages: this.data.messages.map((row) => {
          const status = confirmed.find((item) => item.id === row.id && item.read_at);
          return status ? Object.assign({}, row, { readAt: status.read_at, fullMessage: Object.assign({}, row.fullMessage, { read_at: status.read_at }) }) : row;
        }) });
      }
      if (this.current(context)) this.setData({ statusError: missing ? '部分可见消息的回执暂不可读取，原状态已保留。' : '' });
    } catch (error) { await this.failure(error, context, 'statusError'); }
    finally { if (this._statusFlight === context) this._statusFlight = null; }
  },
  async markVisible() {
    if (this._readFlight || this._gone || this._visible === false || !this.data.messages.length) return;
    const context = dm.capture(this); this._readFlight = context;
    try {
      const visible = await this.visibleMessageIds(context);
      if (!this.current(context)) return;
      const ids = visible.filter((id) => this.data.messages.some((row) => row.id === id && !row.mine && !row.readAt)).slice(0, 100);
      if (!ids.length) return;
      const data = await this.api.action('dm-read', { peer_id: this.data.peerId, message_ids: ids });
      if (!this.current(context)) return;
      if (!data || !Array.isArray(data.read)) throw new Error('服务器未确认已读回执，请重试');
      const confirmed = data.read.filter((row) => ids.indexOf(row.id) >= 0 && Number.isFinite(Date.parse(row.read_at)));
      if (!confirmed.length) throw new Error('服务器尚未确认可见消息已读，请重试');
      this.setData({ messages: this.data.messages.map((row) => {
        const read = confirmed.find((item) => item.id === row.id);
        return read ? Object.assign({}, row, { readAt: read.read_at, fullMessage: Object.assign({}, row.fullMessage, { read_at: read.read_at }) }) : row;
      }), readError: confirmed.length < ids.length ? '部分消息尚未确认已读，可重试' : '' });
    } catch (error) { await this.failure(error, context, 'readError'); }
    finally { if (this._readFlight === context) this._readFlight = null; }
  },
  onInput(event) { if (!this.data.sending) this.setData({ draft: event.detail.value }); },
  onKeyboard(event) { this.setData({ keyboardHeight: Math.max(0, event.detail.height || 0) }); },
  chooseMedia(event) {
    const kind = event.currentTarget.dataset.kind;
    if (['image', 'video'].indexOf(kind) < 0) return;
    return this.chooseAttachment(kind);
  },
  chooseFile() { return this.chooseAttachment('file'); },
  async chooseAttachment(kind) {
    if (this._choosing || this.data.uploading || this.data.sending || this._gone || this._visible === false) return;
    const picker = { scope: model.scope(this), peerId: this.data.peerId, settled: false };
    this._picker = picker; this._choosing = true; this.setData({ selecting: true });
    try {
      picker.result = await new Promise((resolve, reject) => {
        const options = { count: 1, success: resolve, fail: reject };
        if (kind === 'file') wx.chooseMessageFile(Object.assign(options, { type: 'file' }));
        else wx.chooseMedia(Object.assign(options, { mediaType: [kind], sourceType: ['album', 'camera'], sizeType: ['original'] }));
      });
    } catch (error) { picker.error = error; }
    if (!this.pickerCurrent(picker)) {
      if (this._picker === picker) { this._picker = null; this._choosing = false; if (this._visible !== false && !this._gone) this.setData({ selecting: false }); }
      return;
    }
    picker.kind = kind; picker.settled = true;
    return this.resumePicker();
  },
  pickerCurrent(picker) { return !this._gone && this._picker === picker && picker.scope === model.scope(this) && picker.peerId === this.data.peerId; },
  async resumePicker() {
    const picker = this._picker;
    if (!picker || this._visible === false || !this.pickerCurrent(picker)) return;
    if (!picker.settled) { this.setData({ selecting: true }); return; }
    this._picker = null; this._choosing = false; this.setData({ selecting: false });
    const context = dm.capture(this);
    try {
      if (picker.error) throw picker.error;
      const file = picker.result.tempFiles && picker.result.tempFiles[0];
      const path = file && (file.tempFilePath || file.path);
      if (!path) throw new Error('微信未返回选中的本地附件');
      this._selectedFile = { path, kind: picker.kind, name: file.name || path.split('/').pop() };
      this._attachment = null; this._pendingSend = null;
      this.setData({ attachmentDraft: { kind: picker.kind, name: this._selectedFile.name, ready: false }, uploadError: '', sendError: '' });
      await this.uploadSelected();
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) await this.failure(error, context, 'uploadError');
    }
  },
  async uploadSelected() {
    if (!this._selectedFile || this._uploadFlight || this.data.sending || this._gone || this._visible === false) return;
    const file = this._selectedFile, context = dm.capture(this); this._uploadFlight = context;
    this.setData({ uploading: true, uploadError: '' });
    try {
      const att = await this.api.uploadChatAttachment(file);
      if (!this.current(context) || file !== this._selectedFile) return;
      const prefix = this.session.get().userId + '/';
      if (!att || att.kind !== file.kind || typeof att.storage_path !== 'string' || att.storage_path.indexOf(prefix) !== 0 || att.storage_path.split('/').some((part) => !part || part === '.' || part === '..') || !Number.isSafeInteger(att.size) || att.size < 1 || att.size > 41943040 || !att.name) throw new Error('服务器未确认附件存储回执，请重试上传');
      this._attachment = { kind: att.kind, storage_path: att.storage_path, name: att.name, size: att.size, mime: att.mime || 'application/octet-stream' };
      this.setData({ attachmentDraft: { kind: att.kind, name: att.name, ready: true } });
    } catch (error) { await this.failure(error, context, 'uploadError'); }
    finally { if (this._uploadFlight === context) this._uploadFlight = null; if (this.current(context)) this.setData({ uploading: false }); }
  },
  removeAttachment() {
    if (this.data.sending || this.data.uploading) return;
    this._selectedFile = null; this._attachment = null; this._pendingSend = null;
    this.setData({ attachmentDraft: null, uploadError: '', sendError: '' });
  },
  async send() {
    if (this._sendFlight || this.data.uploading || this.data.selecting || this._visible === false || this._gone) return;
    const body = this.data.draft.trim();
    if (this._selectedFile && !this._attachment) { this.setData({ sendError: '附件尚未确认上传，请重试上传或移除附件' }); return; }
    if ((!body && !this._attachment) || body.length > 2000) { this.setData({ sendError: !body ? '请输入消息内容或选择附件' : '消息不能超过 2000 字' }); return; }
    const signature = JSON.stringify([body, this._attachment || null]);
    if (!this._pendingSend || this._pendingSignature !== signature) {
      this._pendingSignature = signature;
      this._pendingSend = { peer_id: this.data.peerId, body, request_id: 'dm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14) };
      if (this._attachment) this._pendingSend.attachment = Object.assign({}, this._attachment);
    }
    const payload = this._pendingSend, context = dm.capture(this); this._sendFlight = context;
    this.setData({ sending: true, sendError: '' });
    try {
      const response = await this.api.action('dm-send', payload);
      if (!this.current(context)) return;
      if (!response || typeof response.replay !== 'boolean') throw new Error('服务端未确认发送回执，请使用相同原稿重试');
      const row = dm.message(response.message, this.session.get().userId, this.data.peerId);
      if (!row.mine || row.body !== payload.body) throw new Error('发送回执与原稿不符，请重试确认');
      if (payload.attachment) {
        const att = row.fullMessage.attachment;
        const path = att && att.url && decodeURIComponent(att.url.split('/storage/v1/object/sign/')[1].split('?')[0]);
        if (!att || !row.attachment.url || att.kind !== payload.attachment.kind || att.name !== payload.attachment.name || att.size !== payload.attachment.size || path !== 'chat-attachments/' + payload.attachment.storage_path) throw new Error('附件发送回执与所选文件不符，请重试确认');
      } else if (row.fullMessage.attachment) throw new Error('发送回执包含未选择的附件，请重试确认');
      await this.mergeIncoming([row]);
      if (!this.current(context)) return;
      this._pendingSend = null; this._attachment = null; this._selectedFile = null;
      this.setData({ draft: '', attachmentDraft: null, uploadError: '', sendError: '' }); this.scrollBottom();
    } catch (error) { await this.failure(error, context, 'sendError'); }
    finally { if (this._sendFlight === context) this._sendFlight = null; if (this.current(context)) this.setData({ sending: false }); }
  },
  async openAttachment(event) {
    if (this.data.opening || this._gone || this._visible === false) return;
    const row = this.data.messages.find((item) => item.id === event.currentTarget.dataset.id);
    if (!row || !row.attachment) return;
    const context = dm.capture(this); this.setData({ opening: true, syncError: '' });
    try {
      const data = await this.api.action('dm-attachment', { id: row.id });
      if (!this.current(context)) return;
      const current = this.data.messages.find((item) => item.id === row.id);
      if (!data || data.message_id !== row.id || !current || current.fullMessage.sender_id !== row.fullMessage.sender_id || current.fullMessage.receiver_id !== row.fullMessage.receiver_id) throw new Error('附件回执与当前消息不符，已停止打开');
      const fullMessage = Object.assign({}, current.fullMessage, { attachment: data.attachment });
      const fresh = dm.message(fullMessage, this.session.get().userId, this.data.peerId);
      if (!fresh.attachment || !fresh.attachment.url) throw new Error(fresh.attachment && fresh.attachment.error || '附件暂不可用');
      await this.mergeIncoming([fresh]);
      if (this.current(context)) await this.api.openChatAttachment(fullMessage);
    } catch (error) { await this.failure(error, context, 'syncError'); }
    finally { if (this.current(context)) this.setData({ opening: false }); }
  },
  retry() { return this.load(); }
}));
