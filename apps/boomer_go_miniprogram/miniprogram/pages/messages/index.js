const { definePage } = require('../../shared/page');
const model = require('../list/model');
const dm = require('./dm');
const { banner } = require('../../shared/notification-read');
const notificationTypes = [{ value: 'all', label: '全部类型' }, { value: 'announcement', label: '公告' }, { value: 'policy', label: '制度' }, { value: 'activity', label: '活动' }, { value: 'urgent', label: '紧急' },
  { value: 'store_update', label: '门店动态' }, { value: 'store_open', label: '新店开业' }, { value: 'hot_item', label: '好物推荐' }, { value: 'official_event', label: '官方活动' }, { value: 'industry', label: '行业资讯' }, { value: 'staff_story', label: '伙伴故事' }];

function notificationItems(data) {
  const raw = new Map((data.items || []).map(row => [String(row.id), row]));
  return model.items(data).map((item) => Object.assign({}, item, { category: model.notificationCategory(item.category), isNews: item.category === 'news',
    notificationType: raw.get(item.id).type || '', cover_url: banner(item.cover_url) }));
}
function conversationHead(data) {
  return JSON.stringify([data.total_at_snapshot, data.unread_total, data.items.map((row) => [row.peer && row.peer.user_id, row.last_message && row.last_message.id, row.unread_count])]);
}

Page(definePage({
  data: { section: 'notifications', canManageNotifications: false, notificationGroup: 'all', notificationQuery: '', notificationTypes, notificationTypeIndex: 0, peopleItems: [], contactGroups: [], contactQuery: '', dmHasMore: false, dmUnreadTotal: null, dmTotal: null, dmSyncError: '', conversationUpdate: false, conversationExpired: false, readNotice: '', items: [], visibleItems: [], filter: 'all', unread: 0, marking: false, freshness: '', hasMore: false, loadingMore: false, moreError: '' },
  onLoad() { this._visible = true; this._epoch = 0; this._scope = model.scope(this); this._initialShow = true; this.syncManageEntry(); return this.load(); },
  onShow() {
    if (this._initialShow) { this._initialShow = false; return; }
    this._visible = true;
    this.syncManageEntry();
    if (this._scope !== model.scope(this)) {
      this._conversationSnapshot = null; this._conversationTotal = null; this._conversationHead = null; this._peopleNext = 0;
      this.setData({ items: [], visibleItems: [], peopleItems: [], contactGroups: [], unread: 0, dmUnreadTotal: null, dmTotal: null, dmHasMore: false, conversationUpdate: false, conversationExpired: false, contactQuery: '', notificationQuery: '', notificationTypeIndex: 0, notificationGroup: 'all' });
    }
    this._scope = model.scope(this);
    if (this.data.section === 'conversations' && this.data.conversationExpired) return;
    if (this._request) return this.load();
  },
  onHide() { this.pause(); },
  onUnload() { this._gone = true; this.pause(); },
  pause() {
    this._visible = false; this._epoch = (this._epoch || 0) + 1; this._request = (this._request || 0) + 1;
    clearTimeout(this._timer); this._peopleFlight = null; this._marking = null;
    if (!this._gone) this.setData({ loading: false, loadingMore: false, marking: false, canManageNotifications: false });
  },
  manageEntryAllowed() { const user = this.session.get(); return this.preview === true || !!(user && user.scopeFresh === true && Array.isArray(user.permissions) && user.permissions.includes('role.manage')); },
  syncManageEntry() { this._manageIdentity = model.scope(this); this.setData({ canManageNotifications: this.manageEntryAllowed() }); },
  openNotificationManage() {
    if (this._gone || this._visible === false || this._manageIdentity !== model.scope(this) || !this.manageEntryAllowed()) return;
    return this.navigate('/pages/notification-manage/index');
  },
  onSection(event) {
    const section = event.currentTarget.dataset.section;
    if (['notifications', 'conversations', 'contacts'].indexOf(section) < 0 || section === this.data.section) return;
    clearTimeout(this._timer); this._epoch = (this._epoch || 0) + 1; this._request = (this._request || 0) + 1; this._peopleFlight = null; this._marking = null;
    this._conversationSnapshot = null; this._conversationTotal = null; this._conversationHead = null; this._peopleNext = 0;
    this.setData({ section, peopleItems: [], contactGroups: [], contactQuery: '', dmHasMore: false, dmUnreadTotal: null, dmTotal: null, conversationUpdate: false, conversationExpired: false, error: '', moreError: '', dmSyncError: '', readNotice: '', loading: false, loadingMore: false, marking: false });
    return this.load();
  },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    if (this.data.section !== 'notifications') {
      if (this._peopleFlight) { this._epoch = (this._epoch || 0) + 1; this._peopleFlight = null; }
      return this.loadPeople(false, false);
    }
    this._nextPage = null;
    return model.remote(this, () => this.api.action('notifications', { page: 0, page_size: 20 }), (data) => {
      this.setData({ items: notificationItems(data), hasMore: model.pagination(this, data, 0), freshness: model.freshness(data) });
      this.applyFilter();
    }, { items: [], visibleItems: [], unread: 0, freshness: '', hasMore: false, loadingMore: false, moreError: '' });
  },
  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading || this._gone) return;
    const request = this._request;
    const identity = model.scope(this);
    const nextPage = this._nextPage;
    const context = dm.capture(this);
    const active = () => dm.active(this, context) && request === this._request && identity === model.scope(this);
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const data = await this.api.action('notifications', { page: nextPage, page_size: 20 });
      if (!active()) return;
      const rows = notificationItems(data).filter((item) => !this.data.items.some((old) => old.id === item.id));
      this.setData({ items: this.data.items.concat(rows), hasMore: model.pagination(this, data, nextPage) });
      this.applyFilter();
    } catch (error) {
      if (active()) {
        if (error.status === 401) await this.run(async () => { throw error; }, { silent: true });
        else this.setData({ moreError: error.message || '通知续页失败，请重试' });
      }
    } finally { if (active()) this.setData({ loadingMore: false }); }
  },
  async loadPeople(append, silent) {
    if (this.data.section === 'notifications' || this._visible === false || this._gone || (append && !this.data.dmHasMore)) return;
    if (this.data.section === 'conversations' && this.data.conversationExpired && (append || silent)) return;
    if (this._peopleFlight) return;
    clearTimeout(this._timer);
    if (!append && !silent) this._request = (this._request || 0) + 1;
    const context = dm.capture(this), request = this._request, section = this.data.section;
    const current = () => dm.active(this, context) && request === this._request;
    this._peopleFlight = context;
    const page = append ? this._peopleNext : 0;
    this.setData(silent ? { dmSyncError: '' } : append ? { loadingMore: true, moreError: '' } : { loading: true, error: '' });
    try {
      const params = { page, page_size: section === 'contacts' ? 50 : 20 };
      if (section === 'conversations' && append) {
        if (!this._conversationSnapshot) throw new Error('会话缺少快照，请刷新后续页');
        params.snapshot_id = this._conversationSnapshot;
      }
      const data = await this.api.action(section === 'contacts' ? 'dm-contacts' : 'dm-conversations', params);
      if (!current()) return;
      const incoming = dm.people(data, section);
      if (section === 'conversations') {
        if (typeof data.snapshot_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.snapshot_id) || !Number.isInteger(data.total_at_snapshot) || data.total_at_snapshot < 0) throw new Error('会话接口未返回有效冻结快照，请重试');
        if (silent) {
          this.setData({ conversationUpdate: conversationHead(data) !== this._conversationHead });
          return;
        }
        if (append && (data.snapshot_id !== this._conversationSnapshot || data.total_at_snapshot !== this._conversationTotal)) throw new Error('会话分页快照或总槽数不一致，已保留原列表，请刷新');
        if (!append) {
          this._conversationSnapshot = data.snapshot_id;
          this._conversationTotal = data.total_at_snapshot;
          this._conversationHead = conversationHead(data);
          this.setData({ conversationUpdate: false, conversationExpired: false, moreError: '', dmSyncError: '' });
        }
      }
      const existing = append || silent ? this.data.peopleItems : [];
      const merged = silent ? incoming.concat(existing.filter((item) => !incoming.some((row) => row.id === item.id))) : existing.concat(incoming.filter((item) => !existing.some((row) => row.id === item.id)));
      const values = { peopleItems: merged };
      if (!silent) { values.dmHasMore = data.has_more === true; this._peopleNext = (Number.isInteger(data.page) ? data.page : page) + 1; }
      if (section === 'conversations') {
        values.dmUnreadTotal = Number.isInteger(data.unread_total) && data.unread_total >= 0 ? data.unread_total : null;
        values.dmTotal = data.total_at_snapshot;
      }
      this.setData(values); this.filterContacts();
    } catch (error) {
      if (current()) {
        if (error.status === 401) await this.run(async () => { throw error; }, { silent: true });
        else if (section === 'conversations' && error.status === 409 && error.code === 'snapshot_expired') this.setData({ conversationExpired: true, conversationUpdate: true, moreError: '会话列表已过期，请刷新', dmSyncError: '' });
        else this.setData(silent ? { dmSyncError: error.message || '会话同步失败' } : append ? { moreError: error.message || '续页失败' } : { error: error.message || '消息读取失败' });
      }
    } finally {
      if (this._peopleFlight === context) this._peopleFlight = null;
      if (current()) { this.setData({ loading: false, loadingMore: false }); this.schedulePoll(); }
    }
  },
  loadMorePeople() { return this.loadPeople(true, false); },
  retryMorePeople() { return this.data.conversationExpired ? this.load() : this.loadMorePeople(); },
  pollPeople() { if (this.data.section === 'conversations' && this._visible !== false) return this.loadPeople(false, true); },
  schedulePoll() {
    clearTimeout(this._timer);
    if (!this._gone && this._visible !== false && this.data.section === 'conversations' && !this.data.conversationExpired) this._timer = setTimeout(() => this.pollPeople(), 10000);
  },
  onContactSearch(event) { this.setData({ contactQuery: event.detail.value }); this.filterContacts(); },
  filterContacts() {
    const query = this.data.contactQuery.trim().toLowerCase();
    const groups = [];
    this.data.peopleItems.filter((item) => !query || [item.name, item.shop, item.position].join(' ').toLowerCase().indexOf(query) >= 0).forEach((item) => {
      let group = groups.find((entry) => entry.name === item.shop);
      if (!group) { group = { name: item.shop, items: [] }; groups.push(group); }
      group.items.push(item);
    });
    this.setData({ contactGroups: groups });
  },
  openPeer(event) {
    const id = event.currentTarget.dataset.id;
    if (this.data.peopleItems.some((item) => item.id === id)) return this.navigate('/pages/chat/index?peer_id=' + encodeURIComponent(id));
  },
  applyFilter() {
    const entries = this.data.items;
    const query = this.data.notificationQuery.trim().toLowerCase(), type = notificationTypes[this.data.notificationTypeIndex].value;
    this.setData({ unread: entries.filter((item) => !item.read).length, visibleItems: entries.filter(item => (this.data.filter !== 'unread' || !item.read)
      && (this.data.notificationGroup === 'all' || (this.data.notificationGroup === 'news' ? item.isNews : !item.isNews)) && (type === 'all' || item.notificationType === type)
      && (!query || (item.title + ' ' + item.body).toLowerCase().includes(query))) });
  },
  onNotificationGroup(event) { const group = event.currentTarget.dataset.group; if (!['all', 'notice', 'news'].includes(group) || this._visible === false || this._gone) return; this.setData({ notificationGroup: group }); this.applyFilter(); },
  onNotificationSearch(event) { if (this._visible === false || this._gone) return; this.setData({ notificationQuery: event.detail.value }); this.applyFilter(); },
  onNotificationType(event) { const index = Number(event.detail.value); if (!Number.isInteger(index) || !notificationTypes[index] || this._visible === false || this._gone) return; this.setData({ notificationTypeIndex: index }); this.applyFilter(); },
  onFilter(event) { this.setData({ filter: event.currentTarget.dataset.kind }); this.applyFilter(); },
  markRead(event) { return this.writeRead([String(event.currentTarget.dataset.id)]); },
  async markAll() {
    const ids = this.data.items.filter((item) => !item.read).map((item) => item.id);
    if (this._marking || !ids.length || this.data.section !== 'notifications') return;
    const context = dm.capture(this); this._marking = context;
    this.setData({ marking: true, error: '', readNotice: '' });
    try {
      return await this.run(async () => {
        let missing = 0;
        for (let offset = 0; offset < ids.length; offset += 100) {
          if (!dm.active(this, context)) return;
          const chunk = ids.slice(offset, offset + 100);
          const data = await this.api.action('notification-read', { ids: chunk });
          if (!dm.active(this, context)) return;
          if (!data || !Array.isArray(data.read_ids) || !Array.isArray(data.ignored_ids) || !Number.isInteger(data.marked)) throw new Error('服务器未返回精确已读回执，未确认的通知仍保留未读');
          const confirmed = chunk.filter((id) => data.read_ids.indexOf(id) >= 0 && data.ignored_ids.indexOf(id) < 0);
          if (data.marked < confirmed.length) throw new Error('已读回执计数不一致，未确认的通知仍保留未读');
          missing += chunk.length - confirmed.length;
          this.setData({ items: this.data.items.map((item) => confirmed.indexOf(item.id) >= 0 ? Object.assign({}, item, { read: true }) : item) });
          this.applyFilter();
        }
        this.setData({ readNotice: missing ? missing + ' 条通知未确认已读（可能已过期或不可见），仍保留未读。' : '所选已加载通知已由服务器确认已读；未加载范围不在本次操作内。' });
      }, { silent: true });
    } finally { if (this._marking === context) this._marking = null; if (dm.active(this, context)) this.setData({ marking: false }); }
  },
  async writeRead(ids) {
    if (this._marking || ids.length !== 1) return false;
    const context = dm.capture(this);
    this._marking = context;
    this.setData({ marking: true, error: '' });
    const identity = model.scope(this);
    try {
      return await this.run(async () => {
        if (!identity) throw new Error('员工登录已失效，请重新登录');
        const data = await this.api.action('notification-read', { id: ids[0] });
        if (!dm.active(this, context)) return false;
        if (!data || !Number.isInteger(data.marked) || data.marked < ids.length) throw new Error('服务器尚未确认已读状态，请重试');
        if (identity !== model.scope(this) || this._gone) return false;
        this.setData({ items: this.data.items.map((item) => ids.indexOf(item.id) >= 0 ? Object.assign({}, item, { read: true }) : item) });
        this.applyFilter();
        return true;
      }, { silent: true });
    } finally { if (this._marking === context) this._marking = null; if (dm.active(this, context)) this.setData({ marking: false }); }
  },
  async openItem(event) {
    const id = String(event.currentTarget.dataset.id);
    const item = this.data.items.find((entry) => entry.id === id);
    if (!item) return;
    if (!item.read && !(await this.writeRead([id]))) return;
    return this.navigate(model.detailUrl(item.kind === 'conversation' ? 'conversation' : 'notifications', id));
  },
  retry() { return this.load(); }
}));
