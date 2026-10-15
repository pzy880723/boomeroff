const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../miniprogram');
const POST = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ID = n => '44444444-4444-4444-8444-' + String(n).padStart(12, '0');
const plain = value => JSON.parse(JSON.stringify(value));
const input = value => ({ detail: { value } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function failure(status, code, message = code) { return Object.assign(new Error(message), { status, code }); }
function post() {
  return { post: { id: POST, name: '一只彩绘瓷杯', category: 'ceramics', story: '可核实的完整商品故事', description: '观察器型与底款的具体方法',
    era: '年代待考', origin: '产地待考', material: '瓷', craft: '彩绘', dimensions: '以实物为准', condition: '自然使用痕迹',
    selling_points: [{ tag: '工艺', text: '可见彩绘纹样', detail: '近看线条' }], tips: { memory: '先看底款', objection: '年代不能保证' },
    appreciation: '观察装饰与器型', care_tips: '轻拿轻放', rarity: 0, collection_value: '收藏价值由实物判断', market_value: '非价格承诺', buy_reason: '适合日常欣赏',
    created_at: '2026-10-16T01:00:00.000001+00:00', author: { user_id: OTHER, name: '门店伙伴', avatar_url: null, phone: 'never-show' }, mine: false },
    liked: false, likes_count: 7, comments_count: 40 };
}
function comment(n, content = '真实评论 ' + n, mine = false) {
  return { id: ID(n), post_id: POST, author: { user_id: mine ? USER : OTHER, name: mine ? '我' : '门店伙伴', avatar_url: null }, mine,
    content, created_at: '2026-10-16T02:00:00.' + String(n).padStart(6, '0') + '+00:00', cursor: 'opaque-cursor-' + n };
}
function pageDto(items = [], has_more = false, next_cursor = null) { return { post_id: POST, order: 'asc', items, page_size: 20, has_more, next_cursor }; }
function receipt(content, extra = {}) { return { comment: comment(100, content, true), replay: false, liked: false, likes_count: 7, comments_count: 41, ...extra }; }
function fixture(handlers = {}, { preview = false, id = POST } = {}) {
  const file = path.join(root, 'pages/community/index.js');
  assert.ok(fs.existsSync(file), 'native community page must exist');
  const calls = [], updates = [], redirects = [];
  let revision = 1, current = { userId: USER, shop: { id: 'shop-a' }, scopeVersion: 10 }, definition;
  const session = { get: () => current, revision: () => revision, signOut() { revision++; current = null; } };
  const api = { async action(name, params) {
    calls.push([name, plain(params)]);
    if (handlers[name]) return handlers[name](params);
    if (name === 'community-detail') return post();
    if (name === 'community-comments') return pageDto();
    if (name === 'community-like') return { post_id: POST, liked: params.liked, likes_count: params.liked ? 8 : 7, comments_count: 40 };
    if (name === 'community-comment') return receipt(params.content);
    assert.fail('unexpected action ' + name);
  } };
  const wx = { reLaunch: options => redirects.push(options.url), setNavigationBarTitle() {}, stopPullDownRefresh() {} };
  const app = { session, api, preview, ensureSession: async () => !!current };
  const requireFile = createRequire(file);
  const context = vm.createContext({ wx, getApp: () => app, Page: value => { definition = value; }, console });
  const shared = vm.runInContext('(function(module){' + fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8') + ';return module.exports;})({exports:{}})', context);
  context.require = name => name === '../../shared/page' ? shared : requireFile(name);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const p = { ...definition, data: plain(definition.data), setData(patch) {
    assert.notEqual(this._gone, true, 'unloaded page must never receive setData');
    updates.push(plain(patch)); Object.assign(this.data, patch);
  } };
  return { p, api, session, calls, updates, redirects,
    change(kind) { revision++; if (kind === 'user') current = { ...current, userId: OTHER }; if (kind === 'shop') current = { ...current, shop: { id: 'shop-b' } }; if (kind === 'scope') current = { ...current, scopeVersion: 11 }; },
    async open() { const loading = p.onLoad({ id }); const show = p.onShow(); await Promise.all([loading, show]); },
  };
}

test('Round10 detail loads once across onLoad/onShow and retains every story field', async () => {
  const f = fixture(); await f.open();
  assert.deepEqual(f.calls, [['community-detail', { id: POST }], ['community-comments', { post_id: POST, page_size: 20 }]]);
  assert.equal(f.p.data.post.name, post().post.name);
  const shown = JSON.stringify([f.p.data.fields, f.p.data.sections]);
  for (const text of ['完整商品故事', '器型与底款', '瓷', '彩绘', '自然使用痕迹', '可见彩绘纹样', '近看线条', '先看底款', '年代不能保证', '观察装饰', '轻拿轻放', '收藏价值', '非价格承诺', '适合日常欣赏']) assert.ok(shown.includes(text), text);
  assert.ok(f.p.data.fields.some(field => field.value === '0'));
  assert.equal(f.p.data.liked, false); assert.equal(f.p.data.likesCount, 7); assert.equal(f.p.data.commentsCount, 40);
  assert.equal(f.p.data.canInteract, true); assert.doesNotMatch(JSON.stringify(f.p.data), /never-show|access_token/);
});
test('missing id never reads or interacts; missing authoritative counts do not become zero', async () => {
  const absent = fixture({}, { id: '' }); await absent.open(); await absent.p.like(); await absent.p.sendComment();
  assert.equal(absent.calls.length, 0); assert.ok(absent.p.data.detailError);
  const f = fixture({ 'community-detail': async () => ({ post: post().post }) }); await f.open();
  assert.equal(f.p.data.liked, null); assert.equal(f.p.data.likesCount, null); assert.equal(f.p.data.canInteract, false);
  await f.p.like(); assert.equal(f.calls.filter(x => x[0] === 'community-like').length, 0);
});
test('likes send a fixed target, single-flight, never optimistic state or count', async () => {
  const request = deferred(); const f = fixture({ 'community-like': () => request.promise }); await f.open();
  const pending = f.p.like(); await f.p.like();
  assert.equal(f.p.data.liked, false); assert.equal(f.p.data.likesCount, 7);
  assert.deepEqual(f.calls.at(-1), ['community-like', { post_id: POST, liked: true }]);
  assert.equal(f.calls.filter(x => x[0] === 'community-like').length, 1);
  request.resolve({ post_id: POST, liked: true, likes_count: 8, comments_count: 40 }); await pending;
  assert.equal(f.p.data.liked, true); assert.equal(f.p.data.likesCount, 8); assert.equal(f.p.data.writing, '');
});
test('failed like retries the same target even after a newer detail already says liked', async () => {
  let count = 0, latest = false;
  const f = fixture({ 'community-detail': async () => ({ ...post(), liked: latest, likes_count: latest ? 8 : 7 }),
    'community-like': async () => { if (++count === 1) throw new Error('连接超时'); return { post_id: POST, liked: true, likes_count: 8, comments_count: 40 }; } });
  await f.open(); await f.p.like(); assert.ok(f.p.data.likeError);
  latest = true; await f.p.refresh(); await f.p.like();
  assert.deepEqual(f.calls.filter(x => x[0] === 'community-like').map(x => x[1].liked), [true, true]);
  await f.p.like(); assert.equal(f.calls.at(-1)[1].liked, false, 'a new unlike intent must be sent as false');
  assert.ok(f.p.data.likeError);
});
test('false like receipt, wrong post and missing counts never confirm a like', async () => {
  for (const reply of [{}, { post_id: OTHER, liked: true, likes_count: 8, comments_count: 40 }, { post_id: POST, liked: false, likes_count: 8, comments_count: 40 }, { post_id: POST, liked: true, likes_count: -1, comments_count: 40 }]) {
    const f = fixture({ 'community-like': async () => reply }); await f.open(); await f.p.like();
    assert.equal(f.p.data.liked, false); assert.equal(f.p.data.likesCount, 7); assert.ok(f.p.data.likeError);
  }
});
test('comments consume opaque ascending cursors, deduplicate and preserve position on retry', async () => {
  let fail = true;
  const f = fixture({ 'community-comments': async params => {
    if (!params.cursor) return pageDto([comment(1), comment(2)], true, 'opaque-next');
    if (fail) throw new Error('分页失败');
    return pageDto([comment(2), comment(3)], false, 'opaque-end');
  } }); await f.open(); await f.p.loadMoreComments();
  assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(1), ID(2)]);
  assert.equal(f.p.data.nextCursor, 'opaque-next'); assert.equal(f.p.data.hasMore, true); assert.ok(f.p.data.commentsError);
  fail = false; await f.p.loadMoreComments(); await f.p.loadMoreComments();
  assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(1), ID(2), ID(3)]);
  assert.deepEqual(f.calls.filter(x => x[0] === 'community-comments').map(x => x[1]), [
    { post_id: POST, page_size: 20 }, { post_id: POST, page_size: 20, cursor: 'opaque-next' }, { post_id: POST, page_size: 20, cursor: 'opaque-next' },
  ]);
});
test('comment paging is single-flight and honors has_more even for an empty page', async () => {
  const request = deferred(); let count = 0;
  const f = fixture({ 'community-comments': () => ++count === 1 ? pageDto([], true, 'next') : request.promise }); await f.open();
  const loading = f.p.loadMoreComments(); await f.p.loadMoreComments(); assert.equal(count, 2);
  request.resolve(pageDto([comment(1)], false, 'end')); await loading; assert.equal(f.p.data.comments.length, 1);
});
test('the native initial-comment retry button retries the first page, not an event object as append', async () => {
  let attempts = 0;
  const f = fixture({ 'community-comments': async () => {
    if (++attempts === 1) throw new Error('首批评论读取失败');
    return pageDto([comment(1)]);
  } }); await f.open();
  const wxml = fs.readFileSync(path.join(root, 'pages/community/index.wxml'), 'utf8');
  const handler = /wx:if="\{\{!commentsLoaded\}\}"[^>]*bindtap="([^"]+)"/.exec(wxml)[1];
  await f.p[handler]({ type: 'tap', detail: {}, currentTarget: { dataset: {} } });
  assert.equal(attempts, 2); assert.equal(f.p.data.comments.length, 1);
});
test('wrong-post, descending or unusable cursor pages retain loaded comments and cursor', async () => {
  for (const bad of [pageDto([comment(2)], true, null), { ...pageDto([comment(2)]), post_id: OTHER }, { ...pageDto([comment(2)]), order: 'desc' }, pageDto([{ ...comment(2), post_id: OTHER }])]) {
    let count = 0; const f = fixture({ 'community-comments': async () => ++count === 1 ? pageDto([comment(1)], true, 'kept') : bad });
    await f.open(); await f.p.loadMoreComments();
    assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(1)]); assert.equal(f.p.data.nextCursor, 'kept'); assert.ok(f.p.data.commentsError);
  }
});
test('comments trim text and count UTF16, accept 1000 units but reject empty and 1001', async () => {
  const f = fixture(); await f.open();
  for (const text of ['   ', '文'.repeat(1001), '😀'.repeat(501)]) { f.p.onDraftInput(input(text)); await f.p.sendComment(); }
  assert.equal(f.calls.filter(x => x[0] === 'community-comment').length, 0);
  f.p.onDraftInput(input('  ' + '😀'.repeat(500) + '  ')); await f.p.sendComment();
  const body = f.calls.at(-1)[1]; assert.equal(body.content.length, 1000); assert.match(body.request_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(Object.keys(body).sort(), ['content', 'post_id', 'request_id']); assert.equal(f.p.data.draft, '');
});
test('send keeps the original draft until a matched persisted comment and blocks double-send/edit', async () => {
  const request = deferred(); const f = fixture({ 'community-comment': () => request.promise }); await f.open();
  f.p.onDraftInput(input('  请看底款  ')); const pending = f.p.sendComment();
  f.p.onDraftInput(input('不能在发送时改稿')); await f.p.sendComment();
  assert.equal(f.p.data.draft, '  请看底款  '); assert.equal(f.p.data.comments.length, 0);
  assert.equal(f.calls.filter(x => x[0] === 'community-comment').length, 1);
  request.resolve(receipt('请看底款')); await pending;
  assert.equal(f.p.data.draft, ''); assert.equal(f.p.data.comments[0].content, '请看底款'); assert.equal(f.p.data.commentsCount, 41);
  assert.match(f.p.data.notice, /确认/);
});
test('timeout and malformed receipt preserve draft and retry the identical key/body', async () => {
  for (const initial of ['timeout', 'empty']) {
    let count = 0;
    const f = fixture({ 'community-comment': async params => {
      if (++count === 1) { if (initial === 'timeout') throw new Error('响应超时'); return {}; }
      return receipt(params.content, { replay: true });
    } }); await f.open(); f.p.onDraftInput(input('保留原稿')); await f.p.sendComment();
    assert.equal(f.p.data.draft, '保留原稿'); assert.ok(f.p.data.sendError); assert.equal(f.p.data.notice, '');
    f.p.onDraftInput(input('未核验时不换稿')); assert.equal(f.p.data.draft, '保留原稿');
    await f.p.sendComment();
    const calls = f.calls.filter(x => x[0] === 'community-comment'); assert.deepEqual(calls[0][1], calls[1][1]);
    assert.equal(f.p.data.comments.length, 1); assert.equal(f.p.data.draft, '');
  }
});
test('fake comment receipts fail closed without requiring a nonexistent request_id echo', async () => {
  const valid = receipt('原稿');
  for (const patch of [
    { id: '' }, { post_id: OTHER }, { content: '别的正文' }, { mine: false }, { author: { user_id: OTHER } }, { created_at: '' },
  ]) {
    const f = fixture({ 'community-comment': async () => ({ ...valid, comment: { ...valid.comment, ...patch } }) });
    await f.open(); f.p.onDraftInput(input('原稿')); await f.p.sendComment();
    assert.equal(f.p.data.draft, '原稿'); assert.equal(f.p.data.comments.length, 0); assert.ok(f.p.data.sendError);
  }
  const good = fixture({ 'community-comment': async () => valid }); await good.open(); good.p.onDraftInput(input('原稿')); await good.p.sendComment();
  assert.equal(good.p.data.draft, ''); assert.equal(good.p.data.comments.length, 1); assert.equal(valid.comment.request_id, undefined);
});
test('explicit server rejection retains draft, conflict retains original key, and preview never claims persistence', async () => {
  const f = fixture({ 'community-comment': async () => { throw failure(409, 'request_id_conflict'); } }); await f.open();
  f.p.onDraftInput(input('原稿')); await f.p.sendComment(); await f.p.sendComment();
  assert.equal(f.p.data.draft, '原稿'); assert.equal(f.p.data.comments.length, 0);
  const sent = f.calls.filter(x => x[0] === 'community-comment'); assert.equal(sent[0][1].request_id, sent[1][1].request_id);
  const { createPreview } = require('../miniprogram/shared/preview');
  const preview = createPreview({}); const demo = fixture({}, { preview: true, id: 'example-community' }); demo.api.action = preview.api.action;
  await demo.open(); assert.match(demo.p.data.post.name, /瓷杯/); assert.equal(demo.p.data.comments.length, 1);
  demo.p.onDraftInput(input('示例不落库')); await demo.p.sendComment(); await demo.p.like();
  assert.equal(demo.p.data.draft, '示例不落库'); assert.equal(demo.p.data.notice, ''); assert.equal(demo.p.data.canInteract, false);
});
test('new comment intents get different keys even for identical text', async () => {
  const f = fixture(); await f.open();
  f.p.onDraftInput(input('同一句')); await f.p.sendComment(); f.p.onDraftInput(input('同一句')); await f.p.sendComment();
  const sent = f.calls.filter(x => x[0] === 'community-comment'); assert.notEqual(sent[0][1].request_id, sent[1][1].request_id);
});
test('a definite 400 rejection retains editable text and a changed draft gets a new key', async () => {
  let attempts = 0;
  const f = fixture({ 'community-comment': async params => {
    if (++attempts === 1) throw failure(400, 'invalid_params', '正文不合法');
    return receipt(params.content);
  } }); await f.open(); f.p.onDraftInput(input('旧稿')); await f.p.sendComment();
  assert.equal(f.p.data.draft, '旧稿'); assert.equal(f.p.data.draftLocked, false);
  f.p.onDraftInput(input('修正稿')); await f.p.sendComment();
  const sent = f.calls.filter(x => x[0] === 'community-comment'); assert.notEqual(sent[0][1].request_id, sent[1][1].request_id);
  assert.equal(sent[1][1].content, '修正稿'); assert.equal(f.p.data.draft, '');
});
test('retrying unchanged text after a definite rejection retains its request_id', async () => {
  let attempts = 0;
  const f = fixture({ 'community-comment': async params => {
    if (++attempts === 1) throw failure(400, 'invalid_params', '请求未写入');
    return receipt(params.content);
  } }); await f.open(); f.p.onDraftInput(input('同一原稿')); await f.p.sendComment(); await f.p.sendComment();
  const sent = f.calls.filter(x => x[0] === 'community-comment'); assert.deepEqual(sent[0][1], sent[1][1]);
});
test('a persisted-looking comment with false persistence or invalid exact counts does not clear the draft', async () => {
  for (const patch of [{ persisted: false }, { likes_count: '7' }, { comments_count: -1 }, { liked: null }, { replay: undefined }]) {
    const f = fixture({ 'community-comment': async () => receipt('原稿', patch) }); await f.open();
    f.p.onDraftInput(input('原稿')); await f.p.sendComment();
    assert.equal(f.p.data.draft, '原稿'); assert.equal(f.p.data.comments.length, 0); assert.equal(f.p.data.commentsCount, 40); assert.ok(f.p.data.sendError);
  }
});
test('detail reads begun before or during a write cannot roll back confirmed exact counts', async () => {
  for (const readFirst of [true, false]) {
    const old = deferred(), write = deferred(); let reads = 0;
    const f = fixture({ 'community-detail': () => ++reads === 1 ? post() : old.promise, 'community-like': () => write.promise }); await f.open();
    let reading, writing;
    if (readFirst) { reading = f.p.refresh(); writing = f.p.like(); } else { writing = f.p.like(); reading = f.p.refresh(); }
    write.resolve({ post_id: POST, liked: true, likes_count: 18, comments_count: 49 }); await writing;
    old.resolve(post()); await reading;
    assert.equal(f.p.data.liked, true); assert.equal(f.p.data.likesCount, 18); assert.equal(f.p.data.commentsCount, 49);
  }
});
test('comment and like writes serialize so one receipt cannot overwrite another in-flight write', async () => {
  const request = deferred(); const f = fixture({ 'community-like': () => request.promise }); await f.open();
  f.p.onDraftInput(input('先点赞再发评')); const pending = f.p.like(); await f.p.sendComment();
  assert.equal(f.calls.filter(x => x[0] === 'community-comment').length, 0);
  request.resolve({ post_id: POST, liked: true, likes_count: 8, comments_count: 40 }); await pending;
});
test('late comment pages and refresh cannot drop or duplicate a newly persisted comment', async () => {
  const request = deferred(); let pages = 0;
  const f = fixture({ 'community-comments': () => ++pages === 1 ? pageDto([comment(1)], true, 'one') : request.promise }); await f.open();
  const reading = f.p.loadMoreComments(); f.p.onDraftInput(input('新评论')); await f.p.sendComment();
  request.resolve(pageDto([comment(2), comment(100, '新评论', true)], false, 'end')); await reading;
  assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(1), ID(2), ID(100)]); assert.equal(f.p.data.nextCursor, 'end');
  f.api.action = async name => name === 'community-detail' ? { ...post(), comments_count: 41 } : pageDto([comment(1)], true, 'one');
  await f.p.refresh(); assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(1), ID(100)]);
});
test('refresh wins over old pages without allowing their finally to unlock a new page request', async () => {
  const old = deferred(), fresh = deferred(); let reads = 0;
  const f = fixture({ 'community-comments': () => ++reads === 1 ? pageDto([comment(1)], true, 'one') : reads === 2 ? old.promise : fresh.promise }); await f.open();
  const stale = f.p.loadMoreComments(); const refreshing = f.p.refresh(); await tick();
  old.resolve(pageDto([comment(2)], false, 'stale')); await stale;
  assert.equal(f.p.data.commentsLoading, true);
  fresh.resolve(pageDto([comment(3)], false, 'new')); await refreshing;
  assert.deepEqual(plain(f.p.data.comments.map(x => x.id)), [ID(3)]);
});
test('all data/write callbacks isolate user, shop, scope and same-user login revision changes', async () => {
  for (const kind of ['user', 'shop', 'scope', 'revision']) {
    for (const operation of ['detail', 'comments', 'like', 'comment']) {
      for (const reject of [false, true]) {
        const request = deferred(); const f = fixture(); await f.open();
        f.p.onDraftInput(input('旧员工原稿'));
        f.api.action = async () => request.promise;
        const pending = operation === 'detail' ? f.p.refresh() : operation === 'comments' ? f.p.loadComments(false) : operation === 'like' ? f.p.like() : f.p.sendComment();
        f.change(kind); const snapshot = plain(f.p.data);
        if (reject) request.reject(failure(401, 'unauthorized')); else request.resolve(operation === 'detail' ? post() : operation === 'comments' ? pageDto([comment(2)]) : operation === 'like' ? { post_id: POST, liked: true, likes_count: 8, comments_count: 40 } : receipt('旧员工原稿'));
        await pending; assert.deepEqual(plain(f.p.data), snapshot, kind + ':' + operation); assert.equal(f.redirects.length, 0);
        f.api.action = async name => name === 'community-detail' ? post() : pageDto(); await f.p.onShow();
        assert.equal(f.p.data.draft, ''); assert.equal(f.p.data.writing, ''); assert.equal(f.p.data.notice, '');
      }
    }
  }
});
test('hide/unload ignore late success, failure and finally; hidden pages issue no actions', async () => {
  for (const unload of [false, true]) for (const operation of ['detail', 'comments', 'like', 'comment']) for (const reject of [false, true]) {
    const request = deferred(); const f = fixture(); await f.open(); f.p.onDraftInput(input('原稿'));
    f.api.action = async () => request.promise;
    const pending = operation === 'detail' ? f.p.refresh() : operation === 'comments' ? f.p.loadComments(false) : operation === 'like' ? f.p.like() : f.p.sendComment();
    if (unload) f.p.onUnload(); else f.p.onHide();
    const snapshot = plain(f.p.data), writes = f.updates.length;
    if (reject) request.reject(failure(401, 'unauthorized')); else request.resolve(operation === 'detail' ? post() : operation === 'comments' ? pageDto() : operation === 'like' ? { post_id: POST, liked: true, likes_count: 8, comments_count: 40 } : receipt('原稿'));
    await pending; await f.p.refresh(); await f.p.like(); await f.p.sendComment(); await f.p.loadMoreComments();
    assert.deepEqual(plain(f.p.data), snapshot); assert.equal(f.updates.length, writes); assert.equal(f.redirects.length, 0);
  }
});
test('foreground retains an unresolved comment intent for manual same-key replay, never auto-resends', async () => {
  const request = deferred(); const f = fixture({ 'community-comment': () => request.promise }); await f.open();
  f.p.onDraftInput(input('保留待核验原稿')); const pending = f.p.sendComment();
  const original = f.calls.at(-1)[1]; f.p.onHide(); request.resolve(receipt(original.content)); await pending;
  await f.p.onShow(); assert.equal(f.calls.filter(x => x[0] === 'community-comment').length, 1);
  assert.equal(f.p.data.draft, '保留待核验原稿');
  f.api.action = async (name, body) => { f.calls.push([name, plain(body)]); return receipt(body.content, { replay: true }); };
  await f.p.sendComment(); assert.deepEqual(f.calls.at(-1)[1], original); assert.equal(f.p.data.draft, '');
});
test('old write completion cannot unlock a same-key retry begun after returning to foreground', async () => {
  for (const action of ['community-like', 'community-comment']) {
    const old = deferred(), fresh = deferred(); let writes = 0;
    const f = fixture({ [action]: () => ++writes === 1 ? old.promise : fresh.promise }); await f.open();
    f.p.onDraftInput(input('原稿'));
    const first = action === 'community-like' ? f.p.like() : f.p.sendComment();
    f.p.onHide(); await f.p.onShow();
    const second = action === 'community-like' ? f.p.like() : f.p.sendComment();
    const snapshot = plain(f.p.data);
    const reply = action === 'community-like' ? { post_id: POST, liked: true, likes_count: 8, comments_count: 40 } : receipt('原稿');
    old.resolve(reply); await first; assert.deepEqual(plain(f.p.data), snapshot); assert.ok(f.p.data.writing);
    fresh.resolve(reply); await second; assert.equal(f.p.data.writing, '');
  }
});
test('events from a changed identity cannot send old drafts even before onShow runs', async () => {
  const f = fixture(); await f.open(); f.p.onDraftInput(input('旧账号草稿')); const calls = f.calls.length;
  f.change('revision'); await f.p.sendComment(); await f.p.like();
  assert.equal(f.calls.length, calls); assert.equal(f.p.data.draft, ''); assert.equal(f.p.data.post, null);
});
test('a late native input event cannot repopulate the cleared draft after a login revision change', async () => {
  const f = fixture(); await f.open(); f.p.onDraftInput(input('旧身份草稿'));
  f.change('revision'); f.p.onDraftInput(input('旧输入框迟到文字'));
  assert.equal(f.p.data.post, null); assert.equal(f.p.data.draft, '');
});
test('current 401 reaches shared auth expiry, and revoked post removes all interactive cached content', async () => {
  const auth = fixture({ 'community-detail': async () => { throw failure(401, 'unauthorized'); } }); await auth.open();
  assert.deepEqual(auth.redirects, ['/pages/login/index']);
  for (const action of ['community-detail', 'community-comments', 'community-like', 'community-comment']) {
    const f = fixture(); await f.open(); f.p.onDraftInput(input('保留草稿'));
    f.api.action = async () => { throw failure(404, 'post_not_found'); };
    await (action === 'community-detail' ? f.p.refresh() : action === 'community-comments' ? f.p.loadComments(false) : action === 'community-like' ? f.p.like() : f.p.sendComment());
    assert.equal(f.p.data.post, null); assert.equal(f.p.data.comments.length, 0); assert.equal(f.p.data.canInteract, false); assert.equal(f.p.data.liked, null);
    assert.equal(f.p.data.draft, '保留草稿'); assert.equal(f.p.data.unavailable, true);
  }
});
test('post-id changes invalidate earlier details and private draft/intent', async () => {
  const request = deferred(); const f = fixture(); await f.open();
  f.p.onDraftInput(input('原帖草稿')); f.api.action = async () => request.promise; const pending = f.p.refresh();
  f.p.setData({ id: OTHER }); const snapshot = plain(f.p.data); request.resolve(post()); await pending;
  assert.deepEqual(plain(f.p.data), snapshot);
  f.api.action = async (name) => name === 'community-detail' ? { ...post(), post: { ...post().post, id: OTHER } } : { ...pageDto(), post_id: OTHER };
  await f.p.onShow(); assert.equal(f.p.data.draft, ''); assert.equal(f.p.data.post.id, OTHER);
});
test('native markup exposes full story, true like state, pagination and keyboard-safe composer', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/community/index.wxml'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'pages/community/index.wxss'), 'utf8');
  assert.match(wxml, /sections/); assert.match(wxml, /fields/); assert.match(wxml, /bindtap="like"/); assert.match(wxml, /bindtap="loadMoreComments"/);
  assert.match(wxml, /bindtap="sendComment"/); assert.match(wxml, /maxlength="1000"/); assert.match(wxml, /bindkeyboardheightchange/);
  assert.match(wxml, /preview/); assert.match(wxml, /selectable/); assert.doesNotMatch(wxml, /<web-view|<rich-text|<script|innerHTML/i);
  for (const match of wxml.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
  for (const match of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) assert.doesNotMatch(match[1], /&(?:amp|lt|gt|quot|apos);/);
  assert.match(css, /safe-area-inset-bottom/); assert.match(css, /position:\s*fixed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'pages/community/index.json'), 'utf8')).navigationBarTitleText, 'BOOMER 圈');
});
