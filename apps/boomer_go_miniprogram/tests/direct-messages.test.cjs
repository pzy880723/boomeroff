const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../miniprogram/pages');
const employee = { userId: 'employee-a', shop: { id: 'shop-a' }, scopeVersion: 1 };
const event = (dataset) => ({ currentTarget: { dataset } });
const notice = (id, read = false) => ({ id, title: '通知 ' + id, body: '服务端通知', category: 'notice', read, created_at: '2026-10-16T09:20:00+08:00' });
const paged = (items, page, has_more = false) => ({ items, page, page_size: 20, has_more });

function nativePage(name, action, extra = {}) {
  const file = path.join(root, name, 'index.js');
  let definition;
  const timers = new Map();
  let timerId = 0;
  const wx = {
    stopPullDownRefresh() {}, showToast() {}, setNavigationBarTitle() {},
    previewImage(options) { wx.previewed = options.current; },
    downloadFile(options) { wx.download = options; return { abort() {} }; },
    openDocument(options) { wx.document = options; options.success(); },
    createSelectorQuery() {
      const query = { in() { return query; }, select() { return query; }, selectAll() { return query; }, boundingClientRect() { return query; }, fields() { return query; }, exec(callback) { callback([{ top: 0, bottom: 600, height: 600 }, wx.visibleRows || []]); } };
      return query;
    }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(id) {
      if (id === '../../shared/page') return { definePage: (page) => page };
      return require(path.resolve(path.dirname(file), id));
    },
    Page(page) { definition = page; }, wx, Date, Math,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  }, { filename: file });
  return Object.assign({}, definition, {
    data: Object.assign({ loading: false, error: '', preview: false }, structuredClone(definition.data)),
    api: { action }, session: { get: () => employee, revision: () => 1 },
    setData(values, callback) { Object.assign(this.data, values); if (callback) callback(); },
    navigate(url) { this.navigation = url; },
    platform: wx, timers,
    async run(work, options = {}) {
      if (!options.silent) this.setData({ loading: true, error: '' });
      try { return await work(); }
      catch (error) { this.setData({ error: error.message }); return null; }
      finally { if (!options.silent) this.setData({ loading: false }); }
    },
    ...extra
  });
}

test('notifications use zero-based real BFF pagination and initial lifecycle loads once', async () => {
  const calls = [];
  const page = nativePage('messages', async (action, params) => {
    assert.equal(action, 'notifications');
    calls.push(JSON.parse(JSON.stringify(params)));
    return params.page === 0 ? paged([notice('n1'), notice('n2', true)], 0, true) : paged([notice('n2', true), notice('n3')], 1);
  });
  const first = page.onLoad({});
  page.onShow();
  await first;
  assert.deepEqual(calls, [{ page: 0, page_size: 20 }]);
  assert.equal(page.data.hasMore, true);
  assert.equal(page.data.unread, 1);
  page.onFilter(event({ kind: 'unread' }));
  await page.loadMore();
  assert.deepEqual(calls.at(-1), { page: 1, page_size: 20 });
  assert.deepEqual(Array.from(page.data.items, (item) => item.id), ['n1', 'n2', 'n3']);
  assert.deepEqual(Array.from(page.data.visibleItems, (item) => item.id), ['n1', 'n3']);
  assert.equal(page.data.unread, 2);
  assert.equal(page.data.hasMore, false);
  assert.equal(page.data.items[0].time, '10-16 09:20');
  assert.equal(page.data.items[0].category, '工作通知');
  await page.loadMore();
  assert.equal(calls.length, 2);
});

const peerId = '22222222-2222-4222-8222-222222222222';
const uuid = (index) => '33333333-3333-4333-8333-' + String(index).padStart(12, '0');
const person = (id = peerId) => ({ user_id: id, name: '小李', avatar_url: null, position: '店员', shop_id: 'shop-a', shop_name: '测试门店', is_contact: true });
const message = (index, extra = {}) => ({ id: uuid(index), sender_id: peerId, receiver_id: employee.userId, mine: false, body: '消息 ' + index, attachment: null, created_at: '2026-10-16T01:00:00.' + String(index).padStart(6, '0') + '+00:00', read_at: null, cursor: 'cursor-' + index, ...extra });
const history = (items, extra = {}) => ({ peer_id: peerId, order: 'desc', items, page_size: 30, has_more: false, next_before: items.length ? items.at(-1).cursor : null, next_after: items.length ? items[0].cursor : null, ...extra });
const conversation = (id = peerId) => ({ peer: person(id), last_message: { id: uuid(1), sender_id: id, mine: false, preview: '交接提醒', created_at: '2026-10-16T01:00:00+00:00' }, unread_count: 7 });
const snapshotA = '2026-10-16T01:00:00.123456+00:00';
const snapshotB = '2026-10-16T01:10:00.654321+00:00';
const snapshotIdA = '44444444-4444-4444-8444-000000000001';
const snapshotIdB = '44444444-4444-4444-8444-000000000002';
const v3 = (data, id = snapshotIdA, total = data.total_conversations == null ? 3 : data.total_conversations) => ({ snapshot_id: id, snapshot_at: snapshotA, snapshot_expires_at: '2026-10-16T01:05:00.123456+00:00', total_at_snapshot: total, skipped_slots: 0, ...data });

test('messages switch notification/conversation/contact sources, use authoritative unread total and loaded-only contact search', async () => {
  const calls = [];
  const page = nativePage('messages', async (action, params) => {
    calls.push({ action, params: JSON.parse(JSON.stringify(params)) });
    if (action === 'notifications') return paged([], 0);
    if (action === 'dm-conversations') return v3({ ...paged([conversation()], 0, true), snapshot_at: snapshotA, total_conversations: 30, unread_total: 45 });
    return paged([person(), { ...person(uuid(99)), name: '小王', shop_name: '另一门店' }], params.page);
  });
  await page.onLoad({});
  await page.onSection(event({ section: 'conversations' }));
  assert.equal(calls.at(-1).action, 'dm-conversations');
  assert.equal(page.data.dmUnreadTotal, 45);
  assert.equal(page.data.peopleItems[0].unread, 7);
  assert.equal(page.data.peopleItems[0].time, '10-16 09:00');
  page.openPeer(event({ id: peerId }));
  assert.equal(page.navigation, '/pages/chat/index?peer_id=' + peerId);
  await page.onSection(event({ section: 'contacts' }));
  page.onContactSearch({ detail: { value: '另一门店' } });
  assert.equal(page.data.contactGroups.length, 1);
  assert.equal(page.data.contactGroups[0].items[0].name, '小王');
  assert.equal(calls.at(-1).params.q, undefined);
  assert.match(fs.readFileSync(path.join(root, 'messages/index.wxml'), 'utf8'), /已加载联系人中搜索/);
  page.onHide();
});

test('visible conversation polling is single-flight, stops on hide and rejects old tab responses', async () => {
  let finish;
  let polls = 0;
  const page = nativePage('messages', async (action) => {
    if (action === 'notifications') return paged([], 0);
    if (action === 'dm-contacts') return paged([], 0);
    if (++polls === 1) return v3({ ...paged([conversation()], 0), snapshot_at: snapshotA, unread_total: 7, total_conversations: 1 });
    return new Promise((resolve) => { finish = resolve; });
  });
  await page.onLoad({});
  await page.onSection(event({ section: 'conversations' }));
  assert.equal(page.timers.size, 1);
  const pending = page.pollPeople();
  await page.pollPeople();
  assert.equal(polls, 2);
  await page.onSection(event({ section: 'contacts' }));
  finish({ ...paged([conversation()], 0), unread_total: 99 });
  await pending;
  assert.equal(page.data.peopleItems.length, 0);
  assert.equal(page.timers.size, 0);
  page.onHide();
  await page.pollPeople();
  assert.equal(polls, 2);
});

test('chat loads the latest page, paginates older history without losing rows or accepting route metadata', async () => {
  const calls = [];
  const page = nativePage('chat', async (action, params) => {
    calls.push({ action, params });
    if (action !== 'dm-messages') return paged([], 0);
    return params.before ? history([message(2), message(1)]) : history([message(4), message(3)], { has_more: true });
  });
  await page.onLoad({ peer_id: peerId, name: '伪造管理员', shop_id: 'fake' });
  page.onShow();
  assert.notEqual(page.data.peerName, '伪造管理员');
  assert.deepEqual(Array.from(page.data.messages, (item) => item.id), [uuid(3), uuid(4)]);
  await page.loadOlder();
  assert.deepEqual(Array.from(page.data.messages, (item) => item.id), [uuid(1), uuid(2), uuid(3), uuid(4)]);
  assert.equal(page.data.scrollTarget, 'msg-' + uuid(3));
  assert.equal(calls.filter((call) => call.action === 'dm-messages').length, 2);
  assert.equal(calls.find((call) => call.params.before).params.before, 'cursor-3');
  assert.ok(calls.every((call) => !(call.params.before && call.params.after)));
  page.onUnload();
});

test('chat drains every after page before merging latest read receipts, preserving old history and cursor watermark', async () => {
  const calls = [];
  let loaded = false;
  const page = nativePage('chat', async (action, params) => {
    if (action !== 'dm-messages') return paged([], 0);
    calls.push(JSON.parse(JSON.stringify(params)));
    if (params.before) return history([message(1)]);
    if (params.after === 'cursor-3') return history([message(4), message(5)], { order: 'asc', has_more: true, next_after: 'cursor-5' });
    if (params.after === 'cursor-5') return history([message(6)], { order: 'asc', next_after: 'cursor-6' });
    if (!loaded) { loaded = true; return history([message(3), message(2)], { has_more: true }); }
    return history([message(8), message(6, { read_at: '2026-10-16T02:00:00Z' })]);
  });
  await page.onLoad({ peer_id: peerId });
  await page.loadOlder();
  await page.syncMessages();
  assert.deepEqual(Array.from(page.data.messages, (item) => item.id), [1, 2, 3, 4, 5, 6, 8].map(uuid));
  assert.equal(page._after, 'cursor-6', 'latest snapshot must not skip a missing backlog message');
  assert.ok(page.data.messages.find((item) => item.id === uuid(6)).readAt);
  assert.deepEqual(calls.filter((call) => call.after).map((call) => call.after), ['cursor-3', 'cursor-5']);
  page.onUnload();
});

test('chat send remains single-flight, retains draft on failure and reuses the exact idempotent request on explicit retry', async () => {
  const writes = [];
  let finish;
  let fails = true;
  const page = nativePage('chat', async (action, params) => {
    if (action === 'dm-messages') return history([]);
    if (action !== 'dm-send') return paged([], 0);
    writes.push(JSON.parse(JSON.stringify(params)));
    return new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('超时，结果待确认')) : resolve({ message: message(10, { sender_id: employee.userId, receiver_id: peerId, mine: true, body: params.body }), replay: true }); });
  });
  await page.onLoad({ peer_id: peerId });
  page.onInput({ detail: { value: '  交接已确认  ' } });
  const pending = page.send();
  await page.send();
  assert.equal(page.data.draft, '  交接已确认  ');
  assert.equal(page.data.messages.length, 0);
  finish();
  await pending;
  assert.match(page.data.sendError, /超时/);
  fails = false;
  const retry = page.send();
  finish();
  await retry;
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.match(writes[0].request_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(writes[0].body, '交接已确认');
  assert.equal(writes[0].sender_id, undefined);
  assert.equal(page.data.draft, '');
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.messages[0].mine, true);
  page.onUnload();
});

test('chat invalid successful receipts, blank or oversized drafts never become sent messages', async () => {
  let writes = 0;
  const page = nativePage('chat', async (action) => {
    if (action === 'dm-messages') return history([]);
    if (action === 'dm-send') { writes++; return { message: message(11, { body: '不符的正文' }), replay: false }; }
    return paged([], 0);
  });
  await page.onLoad({ peer_id: peerId });
  for (const draft of ['   ', '字'.repeat(2001)]) { page.onInput({ detail: { value: draft } }); await page.send(); }
  assert.equal(writes, 0);
  page.onInput({ detail: { value: '请确认' } });
  await page.send();
  assert.equal(page.data.draft, '请确认');
  assert.equal(page.data.messages.length, 0);
  assert.match(page.data.sendError, /确认|回执|不符/);
  page.onUnload();
});

test('chat marks only visible incoming IDs and applies confirmed read_at, never inferred success', async () => {
  const writes = [];
  let confirm = false;
  const page = nativePage('chat', async (action, params) => {
    if (action === 'dm-messages') return history([message(3, { sender_id: employee.userId, receiver_id: peerId, mine: true }), message(2), message(1)]);
    if (action !== 'dm-read') return paged([], 0);
    writes.push(JSON.parse(JSON.stringify(params)));
    return confirm ? { updated_ids: [uuid(2)], read: [{ id: uuid(2), read_at: '2026-10-16T02:00:00Z' }], ignored_ids: [] } : { updated_ids: [], read: [], ignored_ids: [uuid(2)] };
  });
  await page.onLoad({ peer_id: peerId });
  page.platform.visibleRows = [{ top: 20, bottom: 100, dataset: { id: uuid(2) } }, { top: 800, bottom: 900, dataset: { id: uuid(1) } }, { top: 100, bottom: 200, dataset: { id: uuid(3) } }];
  await page.markVisible();
  assert.deepEqual(writes[0], { peer_id: peerId, message_ids: [uuid(2)] });
  assert.equal(page.data.messages.find((item) => item.id === uuid(2)).readAt, null);
  confirm = true;
  await page.markVisible();
  assert.ok(page.data.messages.find((item) => item.id === uuid(2)).readAt);
  assert.equal(page.data.messages.find((item) => item.id === uuid(1)).readAt, null);
  page.onHide();
  await page.markVisible();
  assert.equal(writes.length, 2);
  assert.equal(page.timers.size, 0);
});

test('chat late loads and failures cannot cross hide, unload or same-user revision changes', async () => {
  for (const change of ['hide', 'unload', 'revision']) {
    for (const fails of [false, true]) {
      let finish;
      let revision = 1;
      const page = nativePage('chat', async (action) => action === 'dm-messages' ? new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('旧请求失败')) : resolve(history([message(1)])); }) : paged([], 0), { session: { get: () => employee, revision: () => revision } });
      const pending = page.onLoad({ peer_id: peerId });
      if (change === 'hide') page.onHide();
      if (change === 'unload') page.onUnload();
      if (change === 'revision') revision++;
      finish();
      await pending;
      assert.equal(page.data.messages.length, 0);
      assert.equal(page.data.error, '');
      assert.equal(page.timers.size, 0);
    }
  }
});

test('existing chat attachments accept only unexpired own-project signed sender paths and suppress server errors', () => {
  const dm = require(path.join(root, 'messages/dm'));
  const { supabaseUrl } = require('../miniprogram/config');
  const token = (url, exp = Math.floor(Date.now() / 1000) + 600) => 'x.' + Buffer.from(JSON.stringify({ url, exp })).toString('base64url') + '.x';
  const storagePath = 'chat-attachments/' + peerId + '/photo.jpg';
  const url = supabaseUrl + '/storage/v1/object/sign/' + storagePath + '?token=' + token(storagePath);
  const good = { kind: 'image', url, name: '照片', size: 100, mime: 'image/jpeg', error: null };
  assert.equal(dm.attachment(good, peerId).url, url);
  for (const bad of [{ ...good, error: 'attachment_expired' }, { ...good, url: url.replace(supabaseUrl, 'https://evil.example') }, { ...good, url: url + '&transform=resize' }, { ...good, url: url.replace(peerId, uuid(9)) }, { ...good, url: url.split('?')[0] + '?token=' + token(storagePath, 1) }]) {
    assert.equal(dm.attachment(bad, peerId).url, '');
    assert.ok(dm.attachment(bad, peerId).error);
  }
});

test('chat native quartet exposes real history, read/send retries and no web surface', () => {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, 'chat/index.' + ext)));
  const xml = fs.readFileSync(path.join(root, 'chat/index.wxml'), 'utf8');
  assert.match(xml, /scroll-view/);
  assert.match(xml, /loadOlder/);
  assert.match(xml, /sendError/);
  assert.match(xml, /readError/);
  assert.match(xml, /preview/);
  assert.doesNotMatch(xml, /<web-view|\.includes\(|\{\{[^}]*&amp;/);
});

test('chat waits for the native message render before measuring visible rows for read confirmation', async () => {
  let reads = 0;
  const page = nativePage('chat', async (action, params) => {
    if (action === 'dm-messages') return history([message(1)]);
    if (action === 'dm-read') { reads++; return { updated_ids: [uuid(1)], read: [{ id: uuid(1), read_at: '2026-10-16T03:00:00Z' }], ignored_ids: [] }; }
    return paged([], 0);
  });
  page.setData = function (values, callback) {
    Object.assign(this.data, values);
    if (values.messages && values.messages.length) setImmediate(() => { this.platform.visibleRows = [{ top: 0, bottom: 100, dataset: { id: uuid(1) } }]; if (callback) callback(); });
    else if (callback) callback();
  };
  await page.onLoad({ peer_id: peerId });
  assert.equal(reads, 1);
  page.onUnload();
});

test('an initially empty chat exposes older new messages after a later latest-page refresh', async () => {
  let first = true;
  const page = nativePage('chat', async (action) => {
    if (action !== 'dm-messages') return paged([], 0);
    if (first) { first = false; return history([]); }
    return history([message(50), message(49)], { has_more: true });
  });
  await page.onLoad({ peer_id: peerId });
  await page.syncMessages();
  assert.equal(page.data.hasOlder, true);
  assert.equal(page._before, 'cursor-49');
  page.onUnload();
});

test('history failure keeps cursor and messages and restores polling after a timer fired during the request', async () => {
  let finish;
  const calls = [];
  const page = nativePage('chat', async (action, params) => {
    if (action !== 'dm-messages') return paged([], 0);
    calls.push(params);
    if (params.before) return new Promise((resolve, reject) => { finish = () => reject(new Error('历史续页失败')); });
    return history([message(3)], { has_more: true });
  });
  await page.onLoad({ peer_id: peerId });
  const older = page.loadOlder();
  const timer = Array.from(page.timers.values())[0];
  page.timers.clear();
  await timer();
  finish(); await older;
  assert.equal(page._before, 'cursor-3');
  assert.equal(page.data.messages.length, 1);
  assert.match(page.data.olderError, /历史续页失败/);
  assert.equal(page.timers.size, 1);
  page.onUnload();
});

test('chat attachment opening delegates a complete authorized Message rather than just its URL', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  const storagePath = 'chat-attachments/' + peerId + '/notes.pdf';
  const token = 'x.' + Buffer.from(JSON.stringify({ url: storagePath, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.x';
  const row = message(1, { attachment: { kind: 'file', url: supabaseUrl + '/storage/v1/object/sign/' + storagePath + '?token=' + token, name: 'notes.pdf', size: 100, mime: 'application/pdf', error: null } });
  const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([row]) : action === 'dm-attachment' ? { message_id: row.id, attachment: row.attachment } : paged([], 0));
  let opened;
  page.api.openChatAttachment = async (value) => { opened = value; };
  await page.onLoad({ peer_id: peerId });
  await page.openAttachment(event({ id: uuid(1) }));
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), row);
  page.onUnload();
});

test('hidden or revised chat sends retain the draft and cannot apply a late success or failure', async () => {
  for (const change of ['hide', 'revision']) {
    for (const fails of [false, true]) {
      let revision = 1, finish;
      const page = nativePage('chat', async (action, params) => {
        if (action === 'dm-messages') return history([]);
        if (action !== 'dm-send') return paged([], 0);
        return new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('旧发送失败')) : resolve({ message: message(7, { sender_id: employee.userId, receiver_id: peerId, mine: true, body: params.body }), replay: false }); });
      }, { session: { get: () => employee, revision: () => revision } });
      await page.onLoad({ peer_id: peerId });
      page.onInput({ detail: { value: '保留原稿' } });
      const pending = page.send();
      if (change === 'hide') page.onHide(); else revision++;
      finish(); await pending;
      assert.equal(page.data.messages.length, 0);
      assert.equal(page.data.draft, '保留原稿');
      assert.equal(page.data.sendError, '');
      page.onUnload();
    }
  }
});

test('real DM contact pagination retains a failed page and search, deduplicates peers and does not fabricate hidden staff', async () => {
  let fail = true;
  const calls = [];
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    calls.push(params.page);
    if (params.page === 0) return paged([person()], 0, true);
    if (fail) throw new Error('联系人续页失败');
    return paged([person(), { ...person(uuid(2)), name: '小陈' }], 1);
  });
  await page.onLoad({});
  await page.onSection(event({ section: 'contacts' }));
  page.onContactSearch({ detail: { value: '小陈' } });
  await page.loadMorePeople();
  assert.equal(page.data.peopleItems.length, 1);
  assert.match(page.data.moreError, /续页失败/);
  fail = false;
  await page.loadMorePeople();
  assert.deepEqual(calls, [0, 1, 1]);
  assert.equal(page.data.peopleItems.length, 2);
  assert.equal(page.data.contactGroups[0].items[0].name, '小陈');
  page.onUnload();
});

test('notification pagination preserves items and next page on failure and retries that page single-flight', async () => {
  const calls = [];
  let fail = true;
  let finish;
  const page = nativePage('messages', async (action, params) => {
    calls.push(params.page);
    if (params.page === 0) return paged([notice('n1')], 0, true);
    if (fail) throw new Error('续页失败');
    return new Promise((resolve) => { finish = resolve; });
  });
  await page.onLoad({});
  await page.loadMore();
  assert.equal(page.data.items.length, 1);
  assert.match(page.data.moreError, /续页失败/);
  assert.equal(page.data.error, '');
  assert.equal(page.data.hasMore, true);
  fail = false;
  const next = page.loadMore();
  const duplicate = page.loadMore();
  finish(paged([notice('n2')], 1));
  await Promise.all([next, duplicate]);
  assert.deepEqual(calls, [0, 1, 1]);
  assert.equal(page.data.moreError, '');
  assert.equal(page.data.loadingMore, false);
  assert.equal(page.data.items.length, 2);
});

test('empty filtered notification pages still follow the server has_more flag', async () => {
  const calls = [];
  const page = nativePage('messages', async (action, params) => {
    calls.push(params.page);
    return paged(params.page === 2 ? [notice('later')] : [], params.page, params.page < 2);
  });
  await page.onLoad({});
  await page.loadMore();
  assert.equal(page.data.hasMore, true);
  await page.loadMore();
  assert.deepEqual(calls, [0, 1, 2]);
  assert.equal(page.data.items[0].id, 'later');
});

test('late notification pages and errors cannot overwrite a refresh, changed revision or unloaded page', async () => {
  for (const change of ['refresh', 'revision', 'unload']) {
    for (const fails of [false, true]) {
      let revision = 1;
      let finish;
      let refreshes = 0;
      const page = nativePage('messages', async (action, params) => {
        if (params.page == null || params.page === 0) return paged([notice(++refreshes === 1 ? 'original' : 'fresh')], 0, true);
        return new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('旧续页失败')) : resolve(paged([notice('late')], 1)); });
      }, { session: { get: () => employee, revision: () => revision } });
      await page.onLoad({});
      const old = page.loadMore();
      if (change === 'refresh') await page.load();
      if (change === 'revision') revision++;
      if (change === 'unload') page._gone = true;
      finish();
      await old;
      assert.equal(page.data.items.length, 1);
      assert.equal(page.data.items[0].id, change === 'refresh' ? 'fresh' : 'original');
      assert.equal(page.data.moreError, '');
    }
  }
});

test('loaded notification batch marks only exact confirmed read_ids and explains ignored rows, never all:true', async () => {
  const writes = [];
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([notice('n1'), notice('n2')], 0, true);
    writes.push({ action, params });
    return { marked: 1, read_ids: ['n1'], ignored_ids: ['n2'] };
  });
  await page.onLoad({});
  await page.markAll();
  assert.equal(writes.length, 1);
  assert.deepEqual(Array.from(writes[0].params.ids), ['n1', 'n2']);
  assert.equal(writes[0].params.all, undefined);
  assert.equal(page.data.unread, 1);
  assert.equal(page.data.items[0].read, true);
  assert.equal(page.data.items[1].read, false);
  assert.match(page.data.readNotice, /未确认|未读|忽略/);
  const wxml = fs.readFileSync(path.join(root, 'messages/index.wxml'), 'utf8');
  assert.match(wxml, /已加载[^<]*\{\{unread\}\}/);
  assert.match(wxml, /标记已加载通知/);
  assert.doesNotMatch(wxml, /批量已读接口确认中/);
  assert.doesNotMatch(wxml, />没有未读消息</);
});

test('loaded notification batches split at 100 and missing read_ids cannot clear unread notifications', async () => {
  const batches = [];
  let malformed = true;
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged(Array.from({ length: params.page === 5 ? 5 : 20 }, (_, index) => notice(uuid(params.page * 20 + index + 1))), params.page, params.page < 5);
    batches.push(Array.from(params.ids));
    return malformed ? { marked: params.ids.length } : { marked: params.ids.length, read_ids: params.ids, ignored_ids: [] };
  });
  await page.onLoad({});
  for (let index = 0; index < 5; index++) await page.loadMore();
  await page.markAll();
  assert.equal(page.data.unread, 105);
  malformed = false;
  await page.markAll();
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
  assert.equal(page.data.unread, 0);
});

test('native attachment selection preserves original filename and uploads only after explicit choice, with single-flight retry', async () => {
  const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([]) : paged([], 0));
  let choices = 0, uploads = 0, finish;
  page.platform.chooseMedia = (options) => {
    choices++;
    assert.deepEqual(Array.from(options.sourceType), ['album', 'camera']);
    assert.deepEqual(Array.from(options.mediaType), ['image']);
    options.success({ tempFiles: [{ tempFilePath: '/tmp/original.HEIC' }] });
  };
  page.api.uploadChatAttachment = (file) => {
    uploads++;
    assert.equal(file.name, 'original.HEIC');
    assert.equal(file.kind, 'image');
    return new Promise((resolve, reject) => { finish = (fails) => fails ? reject(new Error('上传失败')) : resolve({ kind: 'image', storage_path: employee.userId + '/stored.heic', name: 'original.HEIC', size: 100, mime: 'image/heic' }); });
  };
  await page.onLoad({ peer_id: peerId });
  assert.equal(uploads, 0);
  page.onInput({ detail: { value: '附件说明' } });
  const selected = page.chooseMedia(event({ kind: 'image' }));
  await Promise.resolve();
  await page.chooseMedia(event({ kind: 'image' }));
  assert.equal(choices, 1);
  finish(true); await selected;
  assert.equal(page.data.draft, '附件说明');
  assert.match(page.data.uploadError, /上传失败/);
  assert.equal(page.data.attachmentDraft.name, 'original.HEIC');
  const retry = page.uploadSelected(); finish(false); await retry;
  assert.equal(uploads, 2);
  assert.equal(page.data.attachmentDraft.ready, true);
  page.onUnload();
});

test('attachment send retry keeps the uploaded storage path and complete payload, and clears only after a matching receipt', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  const att = { kind: 'file', storage_path: employee.userId + '/document.pdf', name: '交接.pdf', size: 100, mime: 'application/pdf' };
  const storagePath = 'chat-attachments/' + att.storage_path;
  const token = 'x.' + Buffer.from(JSON.stringify({ url: storagePath, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.x';
  const writes = [];
  let fails = true;
  const page = nativePage('chat', async (action, params) => {
    if (action === 'dm-messages') return history([]);
    if (action !== 'dm-send') return paged([], 0);
    writes.push(JSON.parse(JSON.stringify(params)));
    if (fails) throw new Error('发送超时');
    return { message: message(9, { sender_id: employee.userId, receiver_id: peerId, mine: true, body: null, attachment: { ...att, storage_path: undefined, url: supabaseUrl + '/storage/v1/object/sign/' + storagePath + '?token=' + token, error: null } }), replay: true };
  });
  page.platform.chooseMessageFile = (options) => options.success({ tempFiles: [{ path: '/tmp/document.pdf', name: '交接.pdf' }] });
  let uploads = 0;
  page.api.uploadChatAttachment = async () => { uploads++; return att; };
  await page.onLoad({ peer_id: peerId });
  await page.chooseFile();
  await page.send();
  assert.equal(page.data.attachmentDraft.ready, true);
  assert.equal(page.data.messages.length, 0);
  fails = false;
  await page.send();
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[0].attachment, att);
  assert.equal(uploads, 1);
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.attachmentDraft, null);
  page.onUnload();
});

test('cancelled and stale attachment selections or uploads cannot replace the current message draft', async () => {
  let revision = 1, finish;
  const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([]) : paged([], 0), { session: { get: () => employee, revision: () => revision } });
  await page.onLoad({ peer_id: peerId });
  page.onInput({ detail: { value: '保留' } });
  page.platform.chooseMedia = (options) => options.fail({ errMsg: 'chooseMedia:fail cancel' });
  await page.chooseMedia(event({ kind: 'image' }));
  assert.equal(page.data.draft, '保留');
  assert.equal(page.data.attachmentDraft, null);
  page.platform.chooseMessageFile = (options) => options.success({ tempFiles: [{ path: '/tmp/a.pdf', name: 'a.pdf' }] });
  page.api.uploadChatAttachment = () => new Promise((resolve) => { finish = resolve; });
  const pending = page.chooseFile();
  await Promise.resolve();
  revision++;
  finish({ kind: 'file', storage_path: employee.userId + '/a.pdf', name: 'a.pdf', size: 1, mime: 'application/pdf' });
  await pending;
  assert.notEqual(page.data.attachmentDraft && page.data.attachmentDraft.ready, true);
  page.onUnload();
});

test('single notification read still requires a confirmed receipt and cannot clear other loaded unread rows', async () => {
  let marked = 0;
  const writes = [];
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([notice('n1'), notice('n2')], 0, true);
    writes.push(JSON.parse(JSON.stringify(params)));
    return { marked };
  });
  await page.onLoad({});
  await page.markRead(event({ id: 'n1' }));
  assert.equal(page.data.unread, 2);
  marked = 1;
  await page.markRead(event({ id: 'n1' }));
  assert.deepEqual(writes, [{ id: 'n1' }, { id: 'n1' }]);
  assert.equal(page.data.unread, 1);
  assert.equal(page.data.hasMore, true);
  assert.equal(page.data.items[1].read, false);
});

test('notification pagination auth expiry is delegated to the shared session handler', async () => {
  const expired = Object.assign(new Error('登录过期'), { status: 401 });
  const page = nativePage('messages', async (action, params) => {
    if (params.page === 0) return paged([notice('n1')], 0, true);
    throw expired;
  });
  await page.onLoad({});
  let handled = false;
  page.run = async (work, options) => {
    assert.equal(options.silent, true);
    await assert.rejects(work, (error) => error === expired);
    handled = true;
  };
  await page.loadMore();
  assert.equal(handled, true);
  assert.equal(page.data.moreError, '');
});

test('changing inbox section releases its old read lock without an old receipt clearing a newer write', async () => {
  const completions = [];
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([notice('n1')], 0);
    if (action === 'dm-contacts') return paged([], 0);
    return new Promise((resolve) => { completions.push(() => resolve({ marked: 1 })); });
  });
  await page.onLoad({});
  const old = page.markRead(event({ id: 'n1' }));
  await page.onSection(event({ section: 'contacts' }));
  await page.onSection(event({ section: 'notifications' }));
  const fresh = page.markRead(event({ id: 'n1' }));
  assert.equal(completions.length, 2);
  completions[0](); await old;
  assert.equal(page.data.marking, true);
  completions[1](); await fresh;
  assert.equal(page.data.marking, false);
  assert.equal(page.data.items[0].read, true);
});

test('chat history padding and bubble widths stay inside the native scroll viewport including time and receipts', () => {
  const css = fs.readFileSync(path.join(root, 'chat/index.wxss'), 'utf8');
  const xml = fs.readFileSync(path.join(root, 'chat/index.wxml'), 'utf8');
  function rule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]+)\\}').exec(css);
    assert.ok(match, selector + ' requires a local layout constraint');
    return Object.fromEntries(match[1].split(';').filter((entry) => entry.trim()).map((entry) => entry.split(':').map((part) => part.trim())));
  }
  const scroll = rule('.chat-scroll');
  assert.equal(scroll.width, '100%');
  assert.equal(scroll['box-sizing'], 'border-box');
  assert.ok(!scroll.padding || scroll.padding === '0', 'native scroll-view must not add horizontal padding to its 100% width');
  const history = rule('.chat-history');
  assert.equal(history.width, '100%');
  assert.equal(history['box-sizing'], 'border-box');
  assert.equal(history.padding, '0 28rpx');
  assert.match(xml, /<scroll-view[^>]*class="chat-scroll"[^>]*>\s*<view class="chat-history">/);
  assert.equal(rule('.message-row').width, '100%');
  assert.equal(rule('.message-row')['min-width'], '0');
  assert.equal(rule('.bubble-wrap')['max-width'], '84%');
  assert.equal(rule('.bubble-wrap')['min-width'], '0');
  assert.equal(rule('.bubble')['box-sizing'], 'border-box');
  assert.equal(rule('.bubble')['max-width'], '100%');
  assert.equal(rule('.message-time')['max-width'], '100%');
  assert.equal(rule('.receipt')['max-width'], '100%');
});

test('system media/file picker results arriving hidden upload exactly once only after same-identity onShow', async () => {
  for (const kind of ['image', 'video', 'file']) {
    const requests = [];
    let callback;
    const page = nativePage('chat', async (action) => { requests.push(action); return action === 'dm-messages' ? history([]) : paged([], 0); });
    await page.onLoad({ peer_id: peerId }); page.onShow();
    page.onInput({ detail: { value: '系统选择器返回后保留' } });
    page.platform.chooseMedia = page.platform.chooseMessageFile = (options) => { callback = options; };
    let uploads = 0;
    page.api.uploadChatAttachment = async (file) => { uploads++; return { kind, storage_path: employee.userId + '/selected.bin', name: file.name, size: 100, mime: 'application/octet-stream' }; };
    const chosen = kind === 'file' ? page.chooseFile() : page.chooseMedia(event({ kind }));
    page.onHide();
    const hiddenRequestCount = requests.length;
    callback.success({ tempFiles: [{ tempFilePath: '/tmp/selected.bin', path: '/tmp/selected.bin', name: 'selected.bin' }] });
    await chosen;
    assert.equal(uploads, 0, 'hidden picker callback cannot start upload');
    assert.equal(requests.length, hiddenRequestCount, 'hidden callback cannot start a business request');
    assert.equal(page.data.attachmentDraft, null, 'hidden result is private pending state, not an applied draft');
    assert.equal(page.data.draft, '系统选择器返回后保留');
    await page.onShow();
    assert.equal(uploads, 1);
    assert.equal(page.data.attachmentDraft.ready, true);
    assert.equal(page.data.attachmentDraft.name, 'selected.bin');
    await page.onShow();
    assert.equal(uploads, 1, 'repeated onShow cannot apply the same picker result twice');
    page.onUnload();
  }
});

test('system picker callback arriving after onShow still applies despite the old visible epoch', async () => {
  let callback;
  const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([]) : paged([], 0));
  await page.onLoad({ peer_id: peerId }); page.onShow();
  page.platform.chooseMessageFile = (options) => { callback = options; };
  let uploads = 0;
  page.api.uploadChatAttachment = async (file) => { uploads++; return { kind: 'file', storage_path: employee.userId + '/chosen.pdf', name: file.name, size: 100, mime: 'application/pdf' }; };
  const pending = page.chooseFile();
  page.onHide();
  await page.onShow();
  assert.equal(page.data.selecting, true);
  await page.chooseFile();
  callback.success({ tempFiles: [{ path: '/tmp/chosen.pdf', name: 'chosen.pdf' }] });
  await pending;
  assert.equal(uploads, 1);
  assert.equal(page.data.selecting, false);
  page.onUnload();
});

test('picker pending results are discarded across revision, user, shop or unload, before or after callback', async () => {
  for (const change of ['revision', 'user', 'shop', 'unload']) {
    for (const timing of ['before-callback', 'after-callback']) {
      let revision = 1, current = employee, callback, uploads = 0;
      const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([]) : paged([], 0), { session: { get: () => current, revision: () => revision } });
      await page.onLoad({ peer_id: peerId }); page.onShow();
      page.platform.chooseMessageFile = (options) => { callback = options; };
      page.api.uploadChatAttachment = async () => { uploads++; throw new Error('must not upload old picker'); };
      const chosen = page.chooseFile();
      page.onHide();
      const complete = () => callback.success({ tempFiles: [{ path: '/tmp/private.pdf', name: 'private.pdf' }] });
      if (timing === 'after-callback') { complete(); await chosen; }
      if (change === 'revision') revision++;
      if (change === 'user') current = { ...employee, userId: 'employee-b' };
      if (change === 'shop') current = { ...employee, shop: { id: 'shop-b' } };
      if (change === 'unload') page.onUnload();
      if (timing === 'before-callback') { complete(); await chosen; }
      if (change !== 'unload') await page.onShow();
      assert.equal(uploads, 0, change + ' ' + timing);
      assert.equal(page.data.attachmentDraft, null);
      page.onUnload();
    }
  }
});

test('system picker cancellation while hidden preserves the prior uploaded attachment and text draft', async () => {
  let callback, uploads = 0;
  const page = nativePage('chat', async (action) => action === 'dm-messages' ? history([]) : paged([], 0));
  await page.onLoad({ peer_id: peerId }); page.onShow();
  page.platform.chooseMessageFile = (options) => options.success({ tempFiles: [{ path: '/tmp/original.pdf', name: 'original.pdf' }] });
  page.api.uploadChatAttachment = async (file) => { uploads++; return { kind: 'file', storage_path: employee.userId + '/original.pdf', name: file.name, size: 100, mime: 'application/pdf' }; };
  await page.chooseFile();
  page.onInput({ detail: { value: '原附件说明' } });
  page.platform.chooseMessageFile = (options) => { callback = options; };
  const cancelled = page.chooseFile();
  page.onHide();
  callback.fail({ errMsg: 'chooseMessageFile:fail cancel' });
  await cancelled;
  await page.onShow();
  assert.equal(uploads, 1);
  assert.equal(page.data.attachmentDraft.name, 'original.pdf');
  assert.equal(page.data.attachmentDraft.ready, true);
  assert.equal(page.data.draft, '原附件说明');
  assert.equal(page.data.uploadError, '');
  assert.equal(page.data.selecting, false);
  page.onUnload();
});

test('conversation pages retain the exact snapshot and silent new heads never splice into old offsets', async () => {
  const calls = [];
  let fresh = false;
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    calls.push(JSON.parse(JSON.stringify(params)));
    if (!params.snapshot_id) return v3({ ...paged([conversation(fresh ? uuid(9) : peerId)], 0, true), snapshot_at: fresh ? snapshotB : snapshotA, total_conversations: fresh ? 4 : 3, unread_total: fresh ? 12 : 7 }, fresh ? snapshotIdB : snapshotIdA);
    return v3({ ...paged([conversation(uuid(params.page))], params.page, params.page < 2), total_conversations: params.snapshot_id === snapshotIdA ? 3 : 4, unread_total: 7 }, params.snapshot_id);
  });
  await page.onLoad({});
  await page.onSection(event({ section: 'conversations' }));
  await page.loadMorePeople();
  assert.equal(calls.at(-1).snapshot_id, snapshotIdA);
  assert.equal(calls.at(-1).snapshot_at, undefined);
  fresh = true;
  await page.pollPeople();
  assert.deepEqual(Array.from(page.data.peopleItems, (row) => row.id), [peerId, uuid(1)]);
  assert.equal(page.data.conversationUpdate, true);
  assert.equal(page.data.dmUnreadTotal, 7, 'old snapshot counts must not be relabeled as new snapshot');
  await page.loadMorePeople();
  assert.equal(calls.at(-1).page, 2);
  assert.equal(calls.at(-1).snapshot_id, snapshotIdA);
  await page.load();
  assert.equal(calls.at(-1).snapshot_at, undefined);
  assert.equal(calls.at(-1).snapshot_id, undefined);
  assert.deepEqual(Array.from(page.data.peopleItems, (row) => row.id), [uuid(9)]);
  assert.equal(page.data.conversationUpdate, false);
  await page.loadMorePeople();
  assert.equal(calls.at(-1).snapshot_id, snapshotIdB);
  page.onUnload();
});

test('a mismatched conversation snapshot fails its page without replacing the existing list or cursor', async () => {
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    return v3({ ...paged([conversation(params.page ? uuid(1) : peerId)], params.page, true), unread_total: 7 }, params.page ? snapshotIdB : snapshotIdA);
  });
  await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
  await page.loadMorePeople();
  assert.equal(page.data.peopleItems.length, 1);
  assert.match(page.data.moreError, /快照/);
  assert.equal(page._peopleNext, 1);
  page.onUnload();
});

test('visible old outgoing messages get read receipts from dm-status, not inferred from after or latest-page reads', async () => {
  const calls = [];
  let confirm = false;
  const outgoing = message(1, { sender_id: employee.userId, receiver_id: peerId, mine: true });
  const page = nativePage('chat', async (action, params) => {
    calls.push({ action, params: JSON.parse(JSON.stringify(params)) });
    if (action === 'dm-messages') {
      if (params.before) return history([outgoing]);
      if (params.after) return history([], { order: 'asc' });
      return history([message(3), message(2)], { has_more: true });
    }
    if (action === 'dm-status') return { peer_id: peerId, statuses: [{ id: uuid(1), read_at: confirm ? '2026-10-16T02:00:00Z' : null }], ignored_ids: [] };
    return paged([], 0);
  });
  await page.onLoad({ peer_id: peerId });
  await page.loadOlder();
  page.platform.visibleRows = [{ top: 0, bottom: 150, dataset: { id: uuid(1) } }];
  await page.syncMessages();
  assert.equal(page.data.messages[0].readAt, null);
  confirm = true;
  await page.syncMessages();
  assert.equal(page.data.messages[0].readAt, '2026-10-16T02:00:00Z');
  const statuses = calls.filter((row) => row.action === 'dm-status');
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses[0].params, { peer_id: peerId, message_ids: [uuid(1)] });
  assert.equal(calls.filter((row) => row.action === 'dm-read').length, 0);
  page.onUnload();
});

test('status responses cannot change receipts after hide/revision or for a different peer', async () => {
  for (const change of ['hide', 'revision', 'peer']) {
    let revision = 1, finish;
    const page = nativePage('chat', async (action) => {
      if (action === 'dm-messages') return history([message(1, { sender_id: employee.userId, receiver_id: peerId, mine: true })]);
      if (action === 'dm-status') return new Promise((resolve) => { finish = resolve; });
      return paged([], 0);
    }, { session: { get: () => employee, revision: () => revision } });
    await page.onLoad({ peer_id: peerId });
    page.platform.visibleRows = [{ top: 0, bottom: 150, dataset: { id: uuid(1) } }];
    const pending = page.syncVisibleStatus();
    await new Promise((resolve) => setImmediate(resolve));
    if (change === 'hide') page.onHide();
    if (change === 'revision') revision++;
    finish({ peer_id: change === 'peer' ? uuid(9) : peerId, statuses: [{ id: uuid(1), read_at: '2026-10-16T02:00:00Z' }], ignored_ids: [] });
    await pending;
    assert.equal(page.data.messages[0].readAt, null);
    if (change === 'peer') assert.match(page.data.statusError, /对象|回执/);
    page.onUnload();
  }
});

test('attachment opening refreshes an expired or inaccessible cached source by message id before delegating', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  const storagePath = 'chat-attachments/' + peerId + '/fresh.pdf';
  const token = 'x.' + Buffer.from(JSON.stringify({ url: storagePath, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.x';
  const fresh = { kind: 'file', url: supabaseUrl + '/storage/v1/object/sign/' + storagePath + '?token=' + token, name: 'fresh.pdf', size: 100, mime: 'application/pdf', source: 'bound', expires_in: 3600, error: null };
  const calls = [];
  const page = nativePage('chat', async (action, params) => {
    if (action === 'dm-messages') return history([message(1, { attachment: { ...fresh, url: null, error: 'attachment_not_accessible' } })]);
    if (action === 'dm-attachment') { calls.push(JSON.parse(JSON.stringify(params))); return { message_id: uuid(1), attachment: fresh }; }
    return paged([], 0);
  });
  const opened = [];
  page.api.openChatAttachment = async (row) => opened.push(row);
  await page.onLoad({ peer_id: peerId });
  await page.openAttachment(event({ id: uuid(1) }));
  await page.openAttachment(event({ id: uuid(1) }));
  assert.deepEqual(calls, [{ id: uuid(1) }, { id: uuid(1) }]);
  assert.equal(opened.length, 2);
  assert.equal(opened[0].attachment.url, fresh.url);
  assert.equal(opened[0].sender_id, peerId);
  assert.equal(opened[0].receiver_id, employee.userId);
  assert.equal(opened[0].attachment.source, 'bound');
  assert.match(fs.readFileSync(path.join(root, 'chat/index.wxml'), 'utf8'), /刷新并打开附件/);
  page.onUnload();
});

test('attachment refresh mismatch, backend rejection or late hidden reply never fall back to a cached link', async () => {
  for (const mode of ['mismatch', 'rejected', 'hidden']) {
    let finish, opens = 0;
    const page = nativePage('chat', async (action) => {
      if (action === 'dm-messages') return history([message(1, { attachment: { kind: 'file', url: null, error: 'attachment_expired' } })]);
      if (action === 'dm-attachment') return new Promise((resolve, reject) => { finish = () => mode === 'rejected' ? reject(new Error('当前附件无权访问')) : resolve({ message_id: mode === 'mismatch' ? uuid(9) : uuid(1), attachment: null }); });
      return paged([], 0);
    });
    page.api.openChatAttachment = async () => { opens++; };
    await page.onLoad({ peer_id: peerId });
    const pending = page.openAttachment(event({ id: uuid(1) }));
    assert.equal(typeof finish, 'function');
    if (mode === 'hidden') page.onHide();
    finish(); await pending;
    assert.equal(opens, 0);
    page.onUnload();
  }
});

test('a failed new inbox section cannot reuse the previous section snapshot or continuation page', async () => {
  let failContacts = true;
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    if (action === 'dm-conversations') return v3({ ...paged([conversation()], 0, true), snapshot_at: snapshotA, unread_total: 7 });
    if (failContacts) throw new Error('联系人无权读取');
    return paged([], params.page);
  });
  await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
  assert.equal(page.data.dmHasMore, true);
  await page.onSection(event({ section: 'contacts' }));
  assert.equal(page.data.peopleItems.length, 0);
  assert.equal(page.data.dmHasMore, false);
  failContacts = false;
  await page.loadMorePeople();
  assert.equal(page.data.peopleItems.length, 0);
  page.onUnload();
});

test('explicit conversation refresh wins over an outstanding silent poll without losing the new snapshot lock', async () => {
  let reads = 0, finish;
  const page = nativePage('messages', async (action) => {
    if (action === 'notifications') return paged([], 0);
    reads++;
    if (reads === 2) return new Promise((resolve) => { finish = resolve; });
    return v3({ ...paged([conversation(reads === 1 ? peerId : uuid(8))], 0, true), snapshot_at: reads === 1 ? snapshotA : snapshotB, unread_total: 7 }, reads === 1 ? snapshotIdA : snapshotIdB);
  });
  await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
  const old = page.pollPeople();
  await page.load();
  finish({ ...paged([conversation(uuid(9))], 0), snapshot_at: snapshotA, unread_total: 99 });
  await old;
  assert.equal(page._conversationSnapshot, snapshotIdB);
  assert.equal(page.data.peopleItems[0].id, uuid(8));
  assert.equal(page.data.conversationUpdate, false);
  page.onUnload();
});

test('v3 deleted slots can return an empty page without advancing the frozen collection or ending pagination', async () => {
  const calls = [];
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    calls.push(JSON.parse(JSON.stringify(params)));
    return v3({ ...paged(params.page === 1 ? [] : [conversation(params.page ? uuid(2) : peerId)], params.page, params.page < 2), total_conversations: params.page === 1 ? 1 : 2, skipped_slots: params.page === 1 ? 20 : 0, unread_total: 7 }, snapshotIdA, 42);
  });
  await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
  await page.loadMorePeople();
  assert.equal(page.data.peopleItems.length, 1);
  assert.equal(page.data.dmHasMore, true);
  assert.equal(page.data.dmTotal, 42, 'snapshot slot total is not the count of surviving rows');
  await page.loadMorePeople();
  assert.deepEqual(calls.map((call) => call.page), [0, 1, 2]);
  assert.equal(calls[0].snapshot_id, undefined);
  assert.equal(calls[1].snapshot_id, snapshotIdA);
  assert.equal(calls[2].snapshot_id, snapshotIdA);
  assert.ok(calls.every((call) => call.snapshot_at === undefined));
  assert.deepEqual(Array.from(page.data.peopleItems, (row) => row.id), [peerId, uuid(2)]);
  assert.equal(page.data.dmHasMore, false);
  page.onUnload();
});

test('v3 validates snapshot ID and immutable slot total even on empty continuation pages', async () => {
  for (const mismatch of ['id', 'total']) {
    const page = nativePage('messages', async (action, params) => {
      if (action === 'notifications') return paged([], 0);
      return v3({ ...paged(params.page ? [] : [conversation()], params.page, true), skipped_slots: params.page ? 20 : 0 }, params.page && mismatch === 'id' ? snapshotIdB : snapshotIdA, params.page && mismatch === 'total' ? 99 : 42);
    });
    await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
    await page.loadMorePeople();
    assert.equal(page.data.peopleItems.length, 1);
    assert.equal(page._peopleNext, 1);
    assert.equal(page._conversationSnapshot, snapshotIdA);
    assert.equal(page.data.dmTotal, 42);
    assert.match(page.data.moreError, /快照/);
    page.onUnload();
  }
});

test('v3 empty first pages still retain an ID and zero immutable total, never a v2 missing-ID fallback', async () => {
  for (const valid of [true, false]) {
    const page = nativePage('messages', async (action) => action === 'notifications' ? paged([], 0) : v3(paged([], 0), valid ? snapshotIdA : null, 0));
    await page.onLoad({}); await page.onSection(event({ section: 'conversations' }));
    assert.equal(page.data.peopleItems.length, 0);
    if (valid) {
      assert.equal(page._conversationSnapshot, snapshotIdA);
      assert.equal(page.data.dmTotal, 0);
      assert.equal(page.data.error, '');
    } else assert.match(page.data.error, /快照/);
    page.onUnload();
  }
});

test('snapshot_expired keeps loaded conversations and only explicit refresh creates a new frozen collection', async () => {
  const calls = [];
  let refreshed = false;
  const page = nativePage('messages', async (action, params) => {
    if (action === 'notifications') return paged([], 0);
    calls.push(JSON.parse(JSON.stringify(params)));
    if (params.page) throw Object.assign(new Error('snapshot no longer valid'), { status: 409, code: 'snapshot_expired' });
    return v3({ ...paged([conversation(refreshed ? uuid(9) : peerId)], 0, true), unread_total: 7 }, refreshed ? snapshotIdB : snapshotIdA, 3);
  });
  await page.onLoad({}); page.onShow(); await page.onSection(event({ section: 'conversations' }));
  await page.loadMorePeople();
  assert.deepEqual(Array.from(page.data.peopleItems, (row) => row.id), [peerId]);
  assert.equal(page.data.moreError, '会话列表已过期，请刷新');
  assert.equal(page.data.conversationExpired, true);
  assert.equal(page._conversationSnapshot, snapshotIdA);
  assert.equal(page._peopleNext, 1);
  await page.loadMorePeople(); await page.pollPeople();
  page.onHide(); await page.onShow();
  assert.equal(calls.length, 2, 'expiry must not dispatch another page or an automatic fresh snapshot');
  assert.equal(page.timers.size, 0);
  refreshed = true;
  await page.retryMorePeople();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].page, 0);
  assert.equal(calls[2].snapshot_id, undefined);
  assert.equal(page._conversationSnapshot, snapshotIdB);
  assert.deepEqual(Array.from(page.data.peopleItems, (row) => row.id), [uuid(9)]);
  assert.equal(page.data.conversationExpired, false);
  assert.equal(page.data.moreError, '');
  const xml = fs.readFileSync(path.join(root, 'messages/index.wxml'), 'utf8');
  assert.match(xml, /bindtap="retryMorePeople"/);
  assert.match(xml, /conversationExpired \? '刷新会话'/);
  page.onUnload();
});
