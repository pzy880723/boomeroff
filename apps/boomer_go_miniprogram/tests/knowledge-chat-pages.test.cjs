const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
const ID = '00000000-0000-4000-8000-000000000811';
const VERSION = '2026-10-16T09:00:00+08:00';
const clone = value => JSON.parse(JSON.stringify(value));
const input = value => ({ detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function detail(patch = {}) { return { item: { id: ID, kind: 'official', title: '合成官方知识', body: '合成正文', quiz_kind: 'official', quiz_available: true, raw: { updated_at: VERSION, category: 'jp_porcelain', era: '昭和' }, ...patch } }; }
const reply = patch => ({ knowledge_id: ID, source_updated_at: VERSION, reply: '合成模拟回答，非真实生成', persisted: false, ...patch });
function harness(handler = async name => name === 'knowledge-detail' ? detail() : reply(), preview = false) {
  let spec, revision = 1, user = { userId: ID, shop: { id: ID }, scopeVersion: 1 };
  const calls = [], modals = [], renders = [], launches = [], navigations = [];
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, reLaunch(options) { launches.push(options); }, showModal(options) { modals.push(options); } };
  const session = { get: () => user, revision: () => revision, signOut() { user = null; revision++; } };
  const app = { preview, session, ensureSession: async () => !!user, api: { async action(name, params) { calls.push({ name, params: clone(params) }); return handler(name, params); } } };
  const shell = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const filename = path.join(root, 'pages/detail/index.js'); vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page(value) { spec = value; }, getApp: () => app, wx, require(name) { return name === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), name)); } }, { filename });
  const page = Object.assign({}, spec, { data: clone(spec.data), navigate(url) { navigations.push(url); }, setData(patch) { assert.notEqual(this._gone, true, 'shared wrapper forbids unloaded renders'); renders.push(patch); Object.assign(this.data, patch); } });
  return { page, calls, modals, renders, launches, navigations, app, change(kind = 'revision') { revision++; if (kind === 'user') user = { ...user, userId: '00000000-0000-4000-8000-000000000812' }; if (kind === 'shop') user = { ...user, shop: { id: '00000000-0000-4000-8000-000000000813' } }; }, paid() { return calls.filter(x => x.name === 'official-knowledge-chat'); }, async start(patch = {}) { await page.onLoad({ kind: 'official', id: ID, ...patch }); }, confirm(value = true) { const modal = modals.at(-1); assert.ok(modal, 'explicit native confirmation exists'); return modal.success({ confirm: value }); } };
}
async function ask(t, question = '如何介绍这件器物？') { t.page.onKnowledgeQuestion(input(question)); return t.page.sendKnowledgeQuestion(); }
async function open(t) { await t.start(); t.page.toggleKnowledgeChat(); }

test('official detail mounts collapsed version-bound panel without changing article, filter or quiz links', async () => {
  const t = harness(); await t.start(); assert.equal(t.page.data.qaVisible, true); assert.equal(t.page.data.qaOpen, false); assert.equal(t.paid().length, 0); assert.match(t.page.data.quizUrl, /kind=official/); assert.ok(t.page.data.officialFilters.length); assert.equal(t.page.data.item.title, '合成官方知识');
  t.page.toggleKnowledgeChat(); assert.equal(t.page.data.qaOpen, true); t.page.onKnowledgeQuestion(input('问题')); assert.equal(t.page.data.qaCanSend, true); t.page.toggleKnowledgeChat(); assert.equal(t.page.data.qaOpen, false); t.page.toggleKnowledgeChat(); assert.equal(t.page.data.qaDraft, '问题');
});
test('unknown source version disables only generation and missing/foreign IDs cannot invoke chat', async () => {
  for (const patch of [{ raw: {} }, { raw: { updated_at: 'bad' } }, { raw: { updated_at: '2026-02-30T00:00:00Z' } }]) { const t = harness(async name => name === 'knowledge-detail' ? detail(patch) : reply()); await open(t); await ask(t); assert.equal(t.paid().length, 0); assert.match(t.page.data.qaUnavailable, /版本/); assert.ok(t.page.data.item); assert.ok(t.page.data.quizUrl); }
  const t = harness(); await t.start({ kind: 'knowledge' }); t.page.toggleKnowledgeChat(); await ask(t); assert.equal(t.paid().length, 0); assert.equal(t.page.data.qaVisible, false);
});
test('success sends exact knowledge/messages only and appends a confirmed pair atomically without persistence claims', async () => {
  const t = harness(); await open(t); await ask(t, '  介绍材质  '); assert.deepEqual(t.paid()[0].params, { knowledge_id: ID, messages: [{ role: 'user', content: '介绍材质' }] });
  assert.equal(t.page.data.qaMessages.length, 2); assert.equal(t.page.data.qaDraft, ''); assert.equal(t.page.data.qaMessages[0].content, '介绍材质'); assert.equal(t.page.data.qaBusy, false); assert.match(t.page.data.qaNotice, /临时/); assert.doesNotMatch(t.page.data.qaNotice, /已保存|归档成功/);
  await ask(t, '再问'); assert.deepEqual(t.paid()[1].params.messages.map(x => x.role), ['user', 'assistant', 'user']);
});
test('singleflight prevents duplicate send, reset and direct question mutation while request is running', async () => {
  const d = deferred(), t = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(t);
  const pending = ask(t, '原问题'); await t.page.sendKnowledgeQuestion(); t.page.newKnowledgeConversation(); t.page.onKnowledgeQuestion(input('被替换')); assert.equal(t.paid().length, 1); assert.equal(t.modals.length, 0); assert.equal(t.page.data.qaDraft, '原问题'); assert.equal(t.page.data.qaMessages.length, 0);
  d.resolve(reply()); await pending; assert.equal(t.page.data.qaMessages.length, 2);
});
test('failure retains full question/history in own error and explicit uncertain repeat needs confirmation, never automatic retry', async () => {
  let failures = false; const t = harness(async name => { if (name === 'knowledge-detail') return detail(); if (failures) throw Error('SECRET provider token'); return reply(); }); await open(t); await ask(t, '首题'); failures = true;
  await ask(t, '未确认问题'); assert.equal(t.paid().length, 2); assert.equal(t.page.data.qaDraft, '未确认问题'); assert.equal(t.page.data.qaMessages.length, 2); assert.equal(t.page.data.error, ''); assert.ok(t.page.data.qaError); assert.doesNotMatch(t.page.data.qaError, /SECRET|token/);
  await t.page.sendKnowledgeQuestion(); assert.equal(t.paid().length, 2); assert.match(t.modals.at(-1).content, /额度/); await t.confirm(false); assert.equal(t.paid().length, 2); failures = false;
  await t.page.sendKnowledgeQuestion(); await t.confirm(); assert.equal(t.paid().length, 3); assert.equal(t.page.data.qaMessages.length, 4);
});
test('malformed or mismatched reply never appends user-only content or clears question', async () => {
  for (const patch of [{ knowledge_id: '00000000-0000-4000-8000-000000000812' }, { source_updated_at: '2026-10-16T09:01:00+08:00' }, { persisted: true }, { reply: ' ' }, { reply: '\ud800' }]) { const t = harness(async name => name === 'knowledge-detail' ? detail() : reply(patch)); await open(t); await ask(t, '保留'); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaDraft, '保留'); assert.ok(t.page.data.qaError); assert.equal(t.page.data.error, ''); }
});
test('unbounded confirmed conversation uses explicit recent-tail confirmation and local20 earlier pagination', async () => {
  const t = harness(); await open(t);
  for (let n = 0; n < 13; n++) { const count = t.paid().length; await ask(t, '问题 ' + n); if (n > 5) { assert.equal(t.paid().length, count); assert.match(t.modals.at(-1).content, /最近 5 轮完整对话/); await t.confirm(); } }
  assert.equal(t.paid().length, 13); assert.equal(t.paid().at(-1).params.messages.length, 11); assert.equal(t.page.data.qaMessages.length, 20); assert.equal(t.page.data.qaTotalCount, 26); assert.equal(t.page.data.qaHasEarlier, true);
  const calls = t.calls.length; t.page.showEarlierKnowledgeMessages(); assert.equal(t.page.data.qaMessages.length, 26); assert.equal(t.page.data.qaHasEarlier, false); assert.equal(t.calls.length, calls);
});
test('oversized latest answer remains fully visible but next question requires knowledge-only confirmation', async () => {
  const t = harness(async name => name === 'knowledge-detail' ? detail() : reply({ reply: '长'.repeat(3000) })); await open(t); await ask(t); assert.equal(t.page.data.qaMessages[1].content.length, 3000);
  await ask(t, '新问题'); assert.equal(t.paid().length, 1); assert.match(t.modals.at(-1).content, /仅携带当前问题和本条知识/); await t.confirm(); assert.equal(t.paid()[1].params.messages.length, 1); assert.equal(t.page.data.qaMessages.length, 4);
});
test('omission/reset confirmation is invalidated by edited question and reset clears all only after explicit confirmation', async () => {
  const t = harness(); await open(t); await ask(t); t.page.onKnowledgeQuestion(input('待保存草稿')); t.page.newKnowledgeConversation(); t.page.onKnowledgeQuestion(input('变化')); await t.confirm(); assert.equal(t.page.data.qaMessages.length, 2); assert.equal(t.page.data.qaDraft, '变化');
  t.page.newKnowledgeConversation(); await t.confirm(false); assert.equal(t.page.data.qaMessages.length, 2); t.page.newKnowledgeConversation(); await t.confirm(); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaDraft, '');
});
test('preview direct handlers cannot call paid action or fabricate a response', async () => {
  const t = harness(undefined, true); await open(t); await ask(t); await t.page.sendKnowledgeQuestion(); t.page.newKnowledgeConversation(); assert.equal(t.paid().length, 0); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaCanSend, false); assert.match(t.page.data.qaUnavailable, /预览/);
});
test('preview textarea permits only local draft typing while real unavailable versions and every send remain blocked', async () => {
  const xml = fs.readFileSync(path.join(root, 'pages/detail/index.wxml'), 'utf8');
  const tag = xml.match(/<textarea\b[^>]*class="qa-input"[^>]*>/); assert.ok(tag);
  const expression = tag[0].match(/disabled="\{\{([^}]+)\}\}"/); assert.ok(expression);
  const disabled = values => vm.runInNewContext(expression[1], values);
  const idle = { qaBusy: false, loading: false, error: '', preview: true, qaUnavailable: '开发预览不可生成' };
  assert.equal(!!disabled(idle), false, 'synthetic preview must allow actual native question input');
  assert.equal(!!disabled({ ...idle, preview: false }), true, 'real unavailable generation remains input-blocked');
  for (const patch of [{ qaBusy: true }, { loading: true }, { error: 'article unavailable' }]) assert.equal(!!disabled({ ...idle, ...patch }), true);
  const t = harness(undefined, true); await open(t); t.page.onKnowledgeQuestion(input('仅本页合成预览草稿')); assert.equal(t.page.data.qaDraft, '仅本页合成预览草稿'); assert.equal(t.page.data.qaCanSend, false);
  await t.page.sendKnowledgeQuestion(); assert.equal(t.paid().length, 0); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaTotalCount, 0);
});
for (const event of ['hide', 'unload', 'revision', 'user', 'shop', 'refresh']) test('late successful response after ' + event + ' cannot append private history or clear current draft', async () => {
  const d = deferred(), t = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(t); const pending = ask(t, '未确认');
  if (event === 'hide') t.page.onHide(); else if (event === 'unload') t.page.onUnload(); else if (event === 'refresh') await t.page.load(); else t.change(event);
  const renders = t.renders.length; d.resolve(reply()); await pending;
  assert.equal(t.page.data.qaMessages.length, 0); if (event === 'unload') assert.equal(t.renders.length, renders); if (event === 'hide' || event === 'unload') assert.equal(t.page.data.qaDraft, '');
});
test('hide removes visible private transcript; same-version fresh show restores only confirmed RAM, not late response', async () => {
  let delay = null; const t = harness(async name => name === 'knowledge-detail' ? detail() : delay ? delay.promise : reply()); await open(t); await ask(t, '确认的一题'); delay = deferred(); const pending = ask(t, '未确认');
  t.page.onHide(); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaDraft, ''); await t.page.onShow(); assert.equal(t.page.data.qaMessages.length, 2); assert.equal(t.page.data.qaDraft, '未确认'); assert.equal(t.page.data.qaBusy, true);
  delay.resolve(reply()); await pending; assert.equal(t.page.data.qaMessages.length, 2); assert.equal(t.page.data.qaBusy, false); const before = t.paid().length; await t.page.sendKnowledgeQuestion(); assert.equal(t.paid().length, before); assert.match(t.modals.at(-1).content, /额度/);
});
for (const change of ['version', 'revision', 'user', 'shop']) test('fresh detail with changed ' + change + ' clears prior page RAM and question', async () => {
  let version = VERSION; const t = harness(async name => name === 'knowledge-detail' ? detail({ raw: { updated_at: version } }) : reply()); await open(t); await ask(t); t.page.onKnowledgeQuestion(input('私有草稿')); t.page.onHide();
  if (change === 'version') version = '2026-10-16T09:02:00+08:00'; else t.change(change); await t.page.onShow(); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaDraft, '');
});
test('late401 cannot sign out a different actor or place a chat error on the article', async () => {
  const d = deferred(), t = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(t); const pending = ask(t); t.change('user'); d.reject(Object.assign(Error('SECRET'), { status: 401 })); await pending; assert.equal(t.launches.length, 0); assert.ok(t.app.session.get()); assert.equal(t.page.data.error, '');
});
test('current401 uses existing cleanup but never claims a reply; hidden late401 has no cleanup', async () => {
  const t = harness(async name => { if (name === 'knowledge-detail') return detail(); throw Object.assign(Error('SECRET'), { status: 401 }); }); await open(t); await ask(t); assert.equal(t.launches.length, 1); assert.equal(t.app.session.get(), null); assert.equal(t.page.data.qaMessages.length, 0);
  const d = deferred(), old = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(old); const pending = ask(old); old.page.onHide(); d.reject(Object.assign(Error('SECRET'), { status: 401 })); await pending; assert.equal(old.launches.length, 0);
});
test('a pending modal after hide/show, version refresh or identity change cannot submit a paid request', async () => {
  for (const event of ['hide', 'revision', 'refresh']) { const t = harness(); await open(t); await ask(t); t.page.newKnowledgeConversation(); const modal = t.modals.at(-1); if (event === 'hide') { t.page.onHide(); await t.page.onShow(); } else if (event === 'refresh') await t.page.load(); else { t.change(); await t.page.onShow(); } const before = clone(t.page.data.qaMessages); await modal.success({ confirm: true }); assert.equal(t.paid().length, 1); assert.deepEqual(clone(t.page.data.qaMessages), before); }
});
test('invalid overlong question is retained without calling API, empty question cannot submit', async () => {
  const t = harness(); await open(t); for (const q of [' ', '😀'.repeat(2001), '\ud800', 'a\0b']) { await ask(t, q); assert.equal(t.paid().length, 0); assert.equal(t.page.data.qaDraft, q); assert.ok(t.page.data.qaError); } assert.ok(t.page.data.item); assert.equal(t.page.data.error, '');
});
test('official panel is native, separately busy, untruncated and all dynamic conditions are bindings', () => {
  const xml = fs.readFileSync(path.join(root, 'pages/detail/index.wxml'), 'utf8'); assert.match(xml, /toggleKnowledgeChat/); assert.match(xml, /sendKnowledgeQuestion/); assert.match(xml, /showEarlierKnowledgeMessages/); assert.match(xml, /newKnowledgeConversation/); assert.match(xml, /maxlength="-1"/); assert.doesNotMatch(xml, /<web-view|&amp;&amp;/); for (const match of xml.matchAll(/wx:(?:if|elif)="([^"]+)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
});

test('same-version fresh return restores a sendable draft without requiring a dummy edit or collapse', async () => {
  const t = harness(); await open(t); t.page.onKnowledgeQuestion(input('原问题')); assert.equal(t.page.data.qaCanSend, true); t.page.onHide(); await t.page.onShow(); assert.equal(t.page.data.loading, false); assert.equal(t.page.data.qaDraft, '原问题'); assert.equal(t.page.data.qaCanSend, true);
});
test('new conversation can clear a version-blocked local draft but cannot restore generation authority', async () => {
  const t = harness(async name => name === 'knowledge-detail' ? detail() : reply({ source_updated_at: '2026-10-16T09:02:00+08:00' })); await open(t); await ask(t, '失败保稿'); assert.match(t.page.data.qaUnavailable, /重新读取/);
  t.page.newKnowledgeConversation(); await t.confirm(); assert.equal(t.page.data.qaDraft, ''); assert.equal(t.page.data.qaMessages.length, 0); assert.match(t.page.data.qaUnavailable, /重新读取/); await ask(t, '仍不可发送'); assert.equal(t.paid().length, 1);
});
test('an omission confirmation cannot send an edited question or a closed panel, and cancellation retains full history', async () => {
  const t = harness(async name => name === 'knowledge-detail' ? detail() : reply({ reply: 'a'.repeat(3000) })); await open(t); await ask(t); await ask(t, '旧问题'); const modal = t.modals.at(-1); t.page.onKnowledgeQuestion(input('变化')); await modal.success({ confirm: true }); assert.equal(t.paid().length, 1); assert.equal(t.page.data.qaDraft, '变化');
  await t.page.sendKnowledgeQuestion(); const close = t.modals.at(-1); t.page.toggleKnowledgeChat(); await close.success({ confirm: true }); assert.equal(t.paid().length, 1); t.page.toggleKnowledgeChat(); await t.page.sendKnowledgeQuestion(); await t.confirm(false); assert.equal(t.page.data.qaTotalCount, 2); assert.equal(t.page.data.qaDraft, '变化');
});
test('a late old response cannot erase a new-identity draft mounted while it was pending', async () => {
  const d = deferred(), t = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(t); const pending = ask(t, '旧用户'); t.change('user'); await t.page.onShow(); t.page.toggleKnowledgeChat();
  d.resolve(reply()); await pending; t.page.onKnowledgeQuestion(input('新用户的草稿')); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaDraft, '新用户的草稿'); assert.equal(t.page.data.qaCanSend, true);
});
test('collapse preserves confirmed RAM and accepts a current in-flight reply without exposing bubbles until expanded', async () => {
  const d = deferred(), t = harness(async name => name === 'knowledge-detail' ? detail() : d.promise); await open(t); const pending = ask(t); t.page.toggleKnowledgeChat(); d.resolve(reply()); await pending; assert.equal(t.page.data.qaOpen, false); assert.equal(t.page.data.qaMessages.length, 0); assert.equal(t.page.data.qaTotalCount, 2); t.page.toggleKnowledgeChat(); assert.equal(t.page.data.qaMessages.length, 2);
});
test('post-provider scope error blocks further send, preserves question, and never retries through article retry', async () => {
  const t = harness(async name => { if (name === 'knowledge-detail') return detail(); throw Object.assign(Error('SECRET source body'), { status: 403, code: 'knowledge_chat_scope_changed' }); }); await open(t); await ask(t, '保留问题'); assert.equal(t.page.data.qaDraft, '保留问题'); assert.ok(t.page.data.qaUnavailable); assert.doesNotMatch(t.page.data.qaError, /SECRET/); await t.page.sendKnowledgeQuestion(); assert.equal(t.paid().length, 1); await t.page.retry(); assert.equal(t.paid().length, 1); assert.equal(t.page.data.qaDraft, '保留问题');
});
test('missing, malformed or response-mismatched official UUID never enables a paid handler', async () => {
  for (const id of ['', 'not-a-uuid', '00000000-0000-4000-8000-000000000812']) {
    const t = harness(async name => name === 'knowledge-detail' ? detail({ id: id === 'not-a-uuid' ? id : ID }) : reply());
    await t.start({ id }); t.page.toggleKnowledgeChat(); await ask(t, '不能发送'); assert.equal(t.paid().length, 0); assert.equal(t.page.data.qaVisible, false);
    if (!id) assert.equal(t.calls.length, 0);
  }
});
test('duplicate native confirmation callbacks produce exactly one fresh paid request', async () => {
  const t = harness(async name => name === 'knowledge-detail' ? detail() : reply({ reply: 'a'.repeat(3000) })); await open(t); await ask(t); await ask(t, '第二题'); const modal = t.modals.at(-1); await modal.success({ confirm: true }); await modal.success({ confirm: true }); assert.equal(t.paid().length, 2); assert.equal(t.page.data.qaTotalCount, 4);
});
