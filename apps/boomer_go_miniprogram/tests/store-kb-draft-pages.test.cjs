const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages/store-kb-edit');
const SHOP = '00000000-0000-4000-8000-000000000001', USER = '00000000-0000-4000-8000-000000000002', ID = '00000000-0000-4000-8000-000000000003', CAT = '00000000-0000-4000-8000-000000000004', OTHER = '00000000-0000-4000-8000-000000000005';
const NOW = '2026-10-16T09:20:00+08:00', V1 = '1'.repeat(64);
const caps = extra => ({ shop_id: SHOP, type: 'sop', can_write: true, limits: { title_chars: 200, body_chars: 40000, tags: 20, tag_chars: 40, query_chars: 200 }, ...extra });
const category = extra => ({ id: CAT, shop_id: SHOP, type: 'sop', name: '流程', sort_order: 0, ...extra });
const entry = extra => ({ id: ID, shop_id: SHOP, type: 'sop', category_id: CAT, title: '开店', body: '原正文', tags: ['okr-highlight', '原标签'], sort_order: 7, created_by: USER, created_at: NOW, updated_at: NOW, ...extra });
const detail = extra => ({ shop_id: SHOP, type: 'sop', entry: entry(), categories: [category()], version: V1, can_edit: true, can_delete: true, as_of: NOW, ...extra });
const candidate = (p = { shop_id: SHOP, type: 'sop', topic: '开店', hint: '' }, extra) => ({ ...p, draft: { title: '开店操作指引', body: '# 完整候选\n**重点**\n- 核对灯光\n\n|项目|说明|\n|---|---|\n|清点|确认|', tags: ['新标签'], category_id: CAT }, categories: [category()], sources: [{ id: ID, source_type: 'shop_sop', source_id: OTHER, shop_id: null, title: '参考流程', content: 'DO_NOT_EXPOSE_SOURCE_CONTENT', metadata: { private: 'DO_NOT_EXPOSE_METADATA' } }], reference_state: 'matched', generated_at: NOW, persisted: false, provider_trace: 'DO_NOT_EXPOSE_PROVIDER_TRACE', ...extra });
const ev = value => ({ detail: { value } });
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const error = (status, code) => Object.assign(Error(code), { status, code });
function parser() { assert.ok(fs.existsSync(path.join(root, 'ai-draft.js')), 'strict native candidate parser must exist'); return require(path.join(root, 'ai-draft')); }
function harness(handler, options = {}) {
  const env = options.env || { revision: 1, current: { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } };
  const calls = [], modals = [];
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, reLaunch(o) { wx.login = o.url; } };
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  app.api = { async action(a, p) { calls.push({ action: a, params: structuredClone(p) }); return handler(a, p); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), { require(id) {
    if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
    return require(path.resolve(root, id));
  }, Page(x) { spec = x; }, wx, getApp: () => app });
  const page = { ...spec, data: structuredClone(spec.data), setData(values) { Object.assign(this.data, values); } };
  return { page, calls, modals, app, env, wx, async start(q = { type: 'sop', id: ID }) { await page.onLoad(q); await page.onShow(); assert.equal(typeof page.generateDraft, 'function', 'editor must implement explicit candidate generation'); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER } }; if (kind === 'scope') env.current = { ...env.current, scopeVersion: 2 }; } };
}
async function loaded(handler, options, query) { const h = harness(handler || (async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? candidate(p) : detail()), options); await h.start(query); return h; }
async function generated(options, dto) { const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? candidate(p, dto) : detail(), options); await h.page.generateDraft(); return h; }
const aiCalls = h => h.calls.filter(x => x.action === 'kb-draft');

test('AI panel is collapsed initially; generation is explicit and frozen params contain only shop/type/topic/hint', async () => {
  const h = await loaded(); assert.equal(h.page.data.aiOpen, false); assert.equal(aiCalls(h).length, 0);
  h.page.toggleAI(); assert.equal(h.page.data.aiOpen, true); h.page.onTitle(ev(' 开店 ')); h.page.onAIHint(ev(' 写成核对清单 '));
  await h.page.generateDraft(); assert.deepEqual(aiCalls(h)[0].params, { shop_id: SHOP, type: 'sop', topic: '开店', hint: '写成核对清单' });
  assert.equal(h.page.data.title, ' 开店 '); assert.equal(h.page.data.body, '原正文'); assert.equal(h.page.data.saved, false);
  assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
});

test('topic and hint use codepoint bounds without truncation or paid calls on invalid input', async () => {
  for (const [title, hint] of [[' ', ''], ['😀'.repeat(201), ''], ['开店', '😀'.repeat(2001)]]) {
    const h = await loaded(); h.page.onTitle(ev(title)); h.page.onAIHint(ev(hint)); await h.page.generateDraft();
    assert.equal(aiCalls(h).length, 0); assert.equal(h.page.data.title, title); assert.equal(h.page.data.aiHint, hint); assert.ok(h.page.data.aiInputError);
  }
  const h = await loaded(); h.page.onTitle(ev('😀'.repeat(200))); h.page.onAIHint(ev('😀'.repeat(2000))); await h.page.generateDraft(); assert.equal(aiCalls(h).length, 1);
});

test('independent AI singleflight keeps manual editing enabled but blocks save/delete while generation is running', async () => {
  const gate = deferred(); const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? gate.promise : detail());
  const work = h.page.generateDraft(); await tick(); assert.equal(h.page.data.aiBusy, true); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  h.page.onBody(ev('生成时继续写')); assert.equal(h.page.data.body, '生成时继续写'); await h.page.generateDraft(); await h.page.save(); await h.page.remove();
  assert.equal(aiCalls(h).length, 1); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
  gate.resolve(candidate(aiCalls(h)[0].params)); await work; assert.equal(h.page.data.aiBusy, false); assert.equal(h.page.data.aiStale, true); assert.equal(h.page.data.canAdopt, false); assert.equal(h.page.data.canSave, true);
});

test('candidate projection includes full safe Markdown and at most source titles, never content/provider metadata', async () => {
  const h = await generated(); const c = h.page.data.aiCandidate;
  assert.equal(c.title, '开店操作指引'); assert.match(c.body, /完整候选/); assert.ok(c.blocks.some(x => x.kind === 'table')); assert.equal(c.categoryName, '流程'); assert.deepEqual(structuredClone(c.tags), ['新标签', 'okr-highlight']);
  assert.deepEqual(structuredClone(c.sources), [{ title: '参考流程' }]); assert.doesNotMatch(JSON.stringify(h.page.data), /DO_NOT_EXPOSE|provider_trace|metadata|source_id/);
  assert.equal(h.page.data.aiStale, false); assert.equal(h.page.data.canAdopt, true);
});

test('strict parser rejects mismatched scope/type/topic/hint, persisted flags, timestamp and invalid draft fields', () => {
  const m = parser(), p = { shop_id: SHOP, type: 'sop', topic: '开店', hint: '' };
  for (const patch of [{ shop_id: OTHER }, { type: 'qa' }, { topic: '其他' }, { hint: '其他' }, { hint: undefined }, { persisted: true }, { persisted: undefined }, { generated_at: 'bad' }, { reference_state: 'unknown' }]) assert.throws(() => m.parse(candidate(p, patch), p, []));
  for (const patch of [{ title: '' }, { title: '😀'.repeat(201) }, { body: ' ' }, { body: '文'.repeat(40001) }, { tags: 'not-array' }, { tags: ['tag', 'tag'] }, { tags: [' x '] }, { tags: [''] }, { tags: [5] }, { tags: ['😀'.repeat(41)] }, { tags: Array.from({ length: 21 }, (_, i) => 'tag' + i) }, { category_id: OTHER }, { category_id: undefined }]) {
    const d = candidate(p); d.draft = { ...d.draft, ...patch }; assert.throws(() => m.parse(d, p, []));
  }
});

test('strict parser rejects invalid categories, reference bindings, more than five sources and reference_state contradictions', () => {
  const m = parser(), p = { shop_id: SHOP, type: 'sop', topic: '开店', hint: '' }, d = candidate(p);
  for (const patch of [{ categories: [category({ shop_id: OTHER })] }, { categories: [category({ type: 'qa' })] }, { categories: [category(), category()] }, { sources: [{ ...d.sources[0], shop_id: OTHER }] }, { sources: [{ ...d.sources[0], id: 'bad' }] }, { sources: [{ ...d.sources[0], source_id: {} }] }, { sources: [{ ...d.sources[0], source_type: null }] }, { sources: [{ ...d.sources[0], title: null }] }, { sources: Array(6).fill(d.sources[0]) }, { sources: [] }, { reference_state: 'none' }]) assert.throws(() => m.parse(candidate(p, patch), p, []));
  const none = m.parse(candidate(p, { sources: [], reference_state: 'none', draft: { ...d.draft, category_id: null } }), p, []); assert.equal(none.categoryName, '不分类'); assert.deepEqual(none.sources, []);
});

test('reference source_id accepts actual text or null and is never projected as text, links or source metadata', async () => {
  const m = parser(), p = { shop_id: SHOP, type: 'sop', topic: '开店', hint: '' }, d = candidate(p);
  for (const sourceId of ['manual-source-id', 'guides/opening-checklist', '', null, 'javascript:SOURCE_ID_MUST_NOT_RENDER()']) {
    const sources = [{ ...d.sources[0], source_id: sourceId }];
    assert.deepEqual(m.parse(candidate(p, { sources }), p, []).sources, [{ title: '参考流程' }]);
    const h = await generated(undefined, { sources }); assert.ok(h.page.data.aiCandidate); assert.equal(h.page.data.canAdopt, true);
    assert.deepEqual(structuredClone(h.page.data.aiCandidate.sources), [{ title: '参考流程' }]); assert.doesNotMatch(JSON.stringify(h.page.data), /source_id|manual-source-id|guides\/opening-checklist|SOURCE_ID_MUST_NOT_RENDER/);
  }
  for (const sourceId of [{}, [], 7, false, undefined]) assert.throws(() => m.parse(candidate(p, { sources: [{ ...d.sources[0], source_id: sourceId }] }), p, []));
});

const AI_MESSAGES = {
  ai_budget_exhausted: 'AI 额度不足，请联系管理员；原稿未改动',
  ai_rate_limited: 'AI 起草请求过于频繁，请稍后再试；原稿未改动',
  ai_unavailable: 'AI 起草服务暂不可用；原稿未改动',
  ai_invalid_response: 'AI 未返回完整草稿，请重试；原稿未改动',
  reference_unavailable: '门店知识参考暂时无法读取；原稿未改动',
  ai_timeout: 'AI 起草超时；原稿未改动，请确认后再次生成',
  draft_scope_changed: '生成过程中门店或权限已变化，候选已停止接收；原稿未改动'
};
test('AI error helper maps only exact known codes to fixed safe text and never echoes provider messages', () => {
  const m = parser(); assert.equal(typeof m.errorMessage, 'function');
  for (const [code, message] of Object.entries(AI_MESSAGES)) assert.equal(m.errorMessage({ code, message: 'SECRET_PROVIDER_TRACE' }), message);
  for (const e of [null, {}, { code: '__proto__' }, { code: 'constructor' }, { code: 'ai_timeout_extra' }, { code: 'AI_TIMEOUT' }, { code: 'unknown', message: 'SECRET_PROVIDER_TRACE' }, Error('SECRET_PROVIDER_TRACE')]) {
    const text = m.errorMessage(e); assert.equal(typeof text, 'string'); assert.ok(text); assert.doesNotMatch(text, /SECRET_PROVIDER_TRACE/); assert.ok(!Object.values(AI_MESSAGES).includes(text));
  }
});

test('known AI errors remain distinguishable in the page while preserving draft/hint and issuing no automatic retry', async () => {
  for (const [http, code] of [[402, 'ai_budget_exhausted'], [429, 'ai_rate_limited'], [504, 'ai_timeout'], [502, 'reference_unavailable'], [502, 'ai_unavailable'], [502, 'ai_invalid_response'], [403, 'draft_scope_changed']]) {
    const h = await loaded(async a => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? Promise.reject(Object.assign(error(http, code), { message: 'SECRET_PROVIDER_TRACE' })) : detail());
    h.page.onBody(ev('区分错误但保稿')); h.page.onAIHint(ev('保留说明')); await h.page.generateDraft(); await tick();
    assert.equal(http === 403 ? h.page.data.error : h.page.data.aiError, AI_MESSAGES[code]); assert.equal(h.page._draft.body, '区分错误但保稿'); assert.equal(h.page._aiHint, '保留说明');
    assert.equal(h.page.data.aiCandidate, null); assert.equal(aiCalls(h).length, 1); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0); assert.doesNotMatch(JSON.stringify(h.page.data), /SECRET_PROVIDER_TRACE/);
  }
});

test('unknown AI errors containing secret messages use a generic safe notice, keep draft and do not retry', async () => {
  for (const code of ['unknown', 'ai_timeout_extra', '__proto__']) {
    const h = await loaded(async a => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? Promise.reject(Object.assign(Error('SECRET_PROVIDER_TRACE'), { status: 502, code })) : detail());
    h.page.onBody(ev('未知错误保稿')); h.page.onAIHint(ev('保留说明')); await h.page.generateDraft(); await tick();
    assert.ok(h.page.data.aiError); assert.doesNotMatch(JSON.stringify(h.page.data), /SECRET_PROVIDER_TRACE/); assert.equal(h.page.data.body, '未知错误保稿'); assert.equal(h.page.data.aiHint, '保留说明'); assert.equal(aiCalls(h).length, 1);
  }
});

test('AI cannot invent okr-highlight, preservation is visible and merged tag limit is enforced', async () => {
  const m = parser(), p = { shop_id: SHOP, type: 'sop', topic: '开店', hint: '' }, d = candidate(p);
  assert.throws(() => m.parse(candidate(p, { draft: { ...d.draft, tags: ['okr-highlight'] } }), p, []));
  assert.throws(() => m.parse(candidate(p, { draft: { ...d.draft, tags: ['okr-highlight'] } }), p, ['okr-highlight']));
  assert.throws(() => m.parse(candidate(p, { draft: { ...d.draft, tags: Array.from({ length: 20 }, (_, i) => 'tag' + i) } }), p, ['okr-highlight']));
  const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? candidate(p) : detail({ entry: entry({ tags: ['原标签'] }) })); await h.page.generateDraft(); assert.deepEqual(structuredClone(h.page.data.aiCandidate.tags), ['新标签']);
});

test('every manual field and hint makes an in-flight or ready candidate stale even if input is restored', async () => {
  const edits = [p => p.onTitle(ev('变化标题')), p => p.onBody(ev('变化正文')), p => p.onTags(ev('变化标签')), p => p.onCategory(ev(0)), p => p.onAIHint(ev('变化说明'))];
  for (const inFlight of [true, false]) for (const edit of edits) {
    const gate = deferred(); const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? inFlight ? gate.promise : candidate(p) : detail());
    const work = h.page.generateDraft(); await tick(); if (!inFlight) await work; edit(h.page);
    if (inFlight) { gate.resolve(candidate(aiCalls(h)[0].params)); await work; }
    assert.ok(h.page.data.aiCandidate); assert.equal(h.page.data.aiStale, true); assert.equal(h.page.data.canAdopt, false);
    const oldTitle = h.page.data.title; await h.page.adoptDraft(); assert.equal(h.page.data.title, oldTitle); assert.equal(h.modals.length, 0);
  }
  const h = await generated(); h.page.onTitle(ev('改动')); h.page.onTitle(ev('开店')); assert.equal(h.page.data.aiStale, true);
});

test('only explicit regeneration replaces a stale candidate and can become adoptable again', async () => {
  const h = await generated(); h.page.onBody(ev('改正文')); assert.equal(h.page.data.aiStale, true); await h.page.generateDraft();
  assert.equal(aiCalls(h).length, 2); assert.equal(h.page.data.aiStale, false); assert.equal(h.page.data.canAdopt, true); assert.equal(h.page.data.body, '改正文');
});

test('adoption is atomic RAM-only after a second confirmation and synchronizes tags array/text/categories without changing CAS', async () => {
  const c = category({ id: OTHER, name: '新出现的已有分类' });
  const h = await generated({ manualModal: true }, { categories: [category(), c], draft: { ...candidate().draft, category_id: OTHER } });
  const base = h.page._base, oldEdit = h.page._edit;
  assert.equal(h.page.data.categories.some(x => x.id === OTHER), false); assert.equal(h.page.data.title, '开店');
  const work = h.page.adoptDraft(); assert.equal(h.modals.length, 1); assert.match(h.modals[0].content, /不会保存|不.*保存/); h.modals[0].success({ confirm: true }); await work;
  assert.equal(h.page.data.title, '开店操作指引'); assert.equal(h.page.data.body, candidate().draft.body); assert.equal(h.page.data.categoryId, OTHER); assert.equal(h.page.data.categoryNames[h.page.data.categoryIndex], c.name);
  assert.deepEqual(structuredClone(h.page._draft.tags), ['新标签', 'okr-highlight']); assert.equal(h.page.data.tagsText, '新标签, okr-highlight');
  assert.equal(h.page._base, base); assert.equal(h.page._edit, oldEdit + 1); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.aiCandidate, null); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
  const normalized = require('../miniprogram/pages/store-kb/model').normalizeDraft(h.page._draft, h.page._categories); assert.deepEqual(normalized.tags, ['新标签', 'okr-highlight']); assert.equal(normalized.category_id, OTHER);
});

test('adoption cancellation, edited modal and lifecycle/identity changes refuse replacement', async () => {
  for (const kind of ['cancel', 'title', 'body', 'hint', 'hide', 'unload', 'user', 'shop', 'revision', 'scope']) {
    const h = await generated({ manualModal: true }); const work = h.page.adoptDraft(); assert.equal(h.modals.length, 1);
    if (kind === 'title') h.page.onTitle(ev('确认时修改')); else if (kind === 'body') h.page.onBody(ev('确认时修改正文')); else if (kind === 'hint') h.page.onAIHint(ev('确认时修改说明')); else if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else if (kind !== 'cancel') h.change(kind);
    h.modals[0].success({ confirm: kind !== 'cancel' }); await work; assert.notEqual(h.page.data.title, '开店操作指引', kind); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
  }
});

test('refresh/latest/pending restoration invalidates candidate and late AI response even without an edit/epoch change', async () => {
  for (const kind of ['refresh', 'latest', 'pending']) for (const inFlight of [true, false]) {
    const gate = deferred(); const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? inFlight ? gate.promise : candidate(p) : detail());
    const work = h.page.generateDraft(); await tick(); if (!inFlight) await work;
    if (kind === 'pending') {
      const p = { shop_id: SHOP, type: 'sop', request_id: OTHER, operation: 'update', entry_id: ID, expected_version: V1, category_id: CAT, title: '冻结请求', body: '冻结正文', tags: ['冻结标签'] };
      h.app._storeKbPending = { [JSON.stringify([false, USER, SHOP, 'sop', ID])]: { payload: p, unknown: true, retryBlocked: false, receipt: null } }; h.page.restorePending(); h.page.render();
    } else if (kind === 'latest') await h.page.reloadLatest(); else await h.page.refresh();
    if (inFlight) { gate.resolve(candidate(aiCalls(h)[0].params)); await work; }
    assert.equal(h.page.data.aiCandidate, null, kind); assert.equal(h.page.data.canAdopt, false); assert.equal(h.page.data.aiBusy, false);
  }
});

test('hide invalidates candidates, keeps same-page hint privately and never starts new requests on show', async () => {
  const h = await generated(); h.page.onAIHint(ev('私有说明')); h.page.onHide(); assert.equal(h.page.data.aiCandidate, null); assert.equal(h.page.data.aiHint, '');
  await h.page.onShow(); assert.equal(h.page.data.aiHint, '私有说明'); assert.equal(aiCalls(h).length, 1); assert.equal(h.page.data.aiCandidate, null);
});

test('hidden/unloaded and old-identity late candidates/errors cannot paint or sign out a new session', async () => {
  for (const fail of [false, true]) for (const kind of ['hide', 'unload', 'user', 'shop', 'revision', 'scope']) {
    const gate = deferred(); const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? gate.promise : detail()); const work = h.page.generateDraft(); await tick();
    if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
    if (fail) gate.reject(error(401, 'old')); else gate.resolve(candidate(aiCalls(h)[0].params)); await work;
    assert.equal(h.page.data.aiCandidate, null); assert.equal(h.page.data.canAdopt, false); assert.ok(h.env.current); assert.equal(h.wx.login, undefined);
  }
});

test('read-only/shared/conflict/pending/receipt/saved/unverified/preview direct handlers cannot generate or adopt', async () => {
  const modes = ['readonly', 'shared', 'canEdit', 'conflict', 'writeConflict', 'pending', 'receipt', 'saved', 'completed', 'unverified', 'preview'];
  for (const mode of modes) {
    const h = await loaded(async a => a === 'kb-capabilities' ? caps({ can_write: mode !== 'readonly' }) : detail(mode === 'shared' ? { entry: entry({ shop_id: null }) } : mode === 'canEdit' ? { can_edit: false } : {}), { preview: mode === 'preview' });
    if (mode === 'conflict') h.page._server = { ...h.page._server, version: '2'.repeat(64) }; if (mode === 'writeConflict') h.page._writeConflict = true;
    if (mode === 'pending' || mode === 'receipt') h.page._pending = { receipt: mode === 'receipt' ? {} : null };
    if (mode === 'saved') h.page.setData({ saved: true }); if (mode === 'completed') h.page._completed = {}; if (mode === 'unverified') h.page._authorized = false;
    await h.page.generateDraft(); await h.page.adoptDraft(); assert.equal(aiCalls(h).length, 0, mode); assert.equal(h.modals.length, 0, mode);
  }
});

test('a ready candidate cannot be adopted once permission, conflict or pending/receipt state changes', async () => {
  for (const kind of ['permission', 'shared', 'conflict', 'pending', 'receipt', 'saved', 'unverified', 'preview']) {
    const h = await generated();
    if (kind === 'permission') h.page._caps.canWrite = false; if (kind === 'shared') h.page._server.entry.shop_id = null; if (kind === 'conflict') h.page._writeConflict = true;
    if (kind === 'pending' || kind === 'receipt') h.page._pending = { receipt: kind === 'receipt' ? {} : null };
    if (kind === 'saved') h.page.setData({ saved: true }); if (kind === 'unverified') h.page._authorized = false; if (kind === 'preview') h.app.preview = true;
    await h.page.adoptDraft(); assert.equal(h.modals.length, 0, kind); assert.equal(h.page.data.title, '开店');
  }
});

test('malformed candidate and provider errors keep the manual draft/hint without automatic retry or writes', async () => {
  for (const failure of ['malformed', error(402, 'ai_budget_exhausted'), error(429, 'ai_rate_limited'), error(502, 'ai_unavailable'), error(502, 'ai_invalid_response'), error(502, 'reference_unavailable'), error(504, 'ai_timeout'), Error('transport')]) {
    const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? failure === 'malformed' ? candidate(p, { persisted: true }) : Promise.reject(failure) : detail()); h.page.onBody(ev('手写保稿')); h.page.onAIHint(ev('保留说明')); await h.page.generateDraft(); await tick();
    assert.equal(h.page.data.body, '手写保稿'); assert.equal(h.page.data.aiHint, '保留说明'); assert.equal(h.page.data.aiCandidate, null); assert.ok(h.page.data.aiError); assert.equal(h.page.data.aiBusy, false); assert.equal(aiCalls(h).length, 1); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
  }
});

test('403 draft_scope_changed discards candidate and disables AI, preserving draft/hint privately until fresh authorization', async () => {
  let denied = false;
  const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? denied ? Promise.reject(error(403, 'draft_scope_changed')) : candidate(p) : detail());
  h.page.onBody(ev('原稿保留')); h.page.onAIHint(ev('权限变化前说明')); await h.page.generateDraft(); assert.ok(h.page.data.aiCandidate);
  denied = true; await h.page.generateDraft(); assert.equal(h.page.data.aiCandidate, null); assert.equal(h.page.data.canGenerate, false); assert.equal(h.page.data.canAdopt, false);
  assert.equal(h.page._draft.body, '原稿保留'); await h.page.generateDraft(); assert.equal(aiCalls(h).length, 2);
  await h.page.refresh(); assert.equal(h.page.data.body, '原稿保留'); assert.equal(h.page.data.aiHint, '权限变化前说明'); assert.equal(h.page.data.aiCandidate, null);
});

test('native candidate UI uses actual conditional bindings, full Markdown tables and a nontruncating hint field', () => {
  const source = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8');
  assert.match(source, /bindtap="toggleAI"/); assert.match(source, /bindtap="generateDraft"/); assert.match(source, /bindtap="adoptDraft"/); assert.match(source, /bindinput="onAIHint"/); assert.match(source, /2000/);
  const hint = source.match(/<textarea\b[^>]*bindinput="onAIHint"[^>]*>/); assert.ok(hint); assert.match(hint[0], /maxlength="-1"/);
  assert.match(source, /aiCandidate\.blocks/); assert.match(source, /aiCandidate\.sources/); assert.match(source, /未.*采用|尚未采用/); assert.doesNotMatch(source, /web-view|&amp;&amp;/);
  for (const m of source.matchAll(/\bwx:(?:if|elif)\s*=\s*(["'])([\s\S]*?)\1/g)) assert.match(m[2].trim(), /^\{\{[\s\S]+\}\}$/);
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8'); assert.match(css, /\.ai-hint\{[^}]*width:calc\(100% - 40rpx\)/, 'hint width must include its horizontal margins');
});

test('same-page hide/show while a request remains unresolved does not start another generation or falsely unlock saves', async () => {
  const gate = deferred(); const h = await loaded(async a => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? gate.promise : detail());
  const work = h.page.generateDraft(); await tick(); h.page.onHide(); await h.page.onShow(); await h.page.generateDraft(); await h.page.save();
  assert.equal(aiCalls(h).length, 1); assert.equal(h.page.data.aiBusy, true); assert.equal(h.page.data.canSave, false);
  gate.resolve(candidate(aiCalls(h)[0].params)); await work; assert.equal(h.page.data.aiCandidate, null); assert.equal(h.page.data.aiBusy, false); assert.equal(h.page.data.canSave, true);
});

test('old generation completion cannot clear a newer identity generation or its candidate', async () => {
  const oldGate = deferred(), newGate = deferred(); let count = 0;
  const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-draft' ? ++count === 1 ? oldGate.promise : newGate.promise : detail());
  const old = h.page.generateDraft(); await tick(); h.change('revision'); await h.page.refresh(); const fresh = h.page.generateDraft(); await tick();
  oldGate.resolve(candidate(aiCalls(h)[0].params)); await old; assert.equal(h.page.data.aiBusy, true); assert.equal(h.page.data.aiCandidate, null);
  newGate.resolve(candidate(aiCalls(h)[1].params)); await fresh; assert.equal(h.page.data.aiBusy, false); assert.equal(h.page.data.canAdopt, true); assert.ok(h.page.data.aiCandidate);
});

test('permission/conflict/preview changes inside the adoption modal cannot overwrite the editor', async () => {
  for (const kind of ['permission', 'conflict', 'preview']) {
    const h = await generated({ manualModal: true }); const work = h.page.adoptDraft();
    if (kind === 'permission') h.page._caps.canWrite = false; else if (kind === 'conflict') h.page._writeConflict = true; else h.app.preview = true;
    h.modals[0].success({ confirm: true }); await work; assert.equal(h.page.data.title, '开店'); assert.equal(h.page.data.tagsText, 'okr-highlight, 原标签');
  }
});

test('adopted candidate passes through the unchanged manual save receipt and exact readback flow', async () => {
  let sent;
  const c = category({ id: OTHER, name: '已有分类二' });
  const h = await loaded(async (a, p) => {
    if (a === 'kb-capabilities') return caps();
    if (a === 'kb-draft') return candidate(p, { categories: [category(), c], draft: { ...candidate().draft, category_id: OTHER } });
    if (a === 'kb-write') { sent = p; return { shop_id: SHOP, type: 'sop', request_id: p.request_id, operation: 'update', actor_id: USER, entry_id: ID, version: '2'.repeat(64), deleted: false, recorded_at: NOW, replay: false }; }
    return sent ? detail({ entry: entry({ title: sent.title, body: sent.body, tags: sent.tags, category_id: sent.category_id }), categories: [category(), c], version: '2'.repeat(64) }) : detail();
  });
  await h.page.generateDraft(); await h.page.adoptDraft(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
  await h.page.save(); assert.equal(sent.expected_version, V1); assert.deepEqual(structuredClone(sent.tags), ['新标签', 'okr-highlight']); assert.equal(sent.category_id, OTHER); assert.equal(h.page.data.saved, true);
  assert.equal(h.modals.length, 2); assert.equal(Object.keys(h.app._storeKbPending).length, 0);
});

test('new QA entry supports explicit generation with NULL category and no matched sources', async () => {
  const h = await loaded(async (a, p) => a === 'kb-capabilities' ? caps({ type: 'qa' }) : a === 'kb-list' ? { shop_id: SHOP, type: 'qa', query: '', category_id: null, page: 0, page_size: 20, has_more: false, categories: [], items: [], as_of: NOW } : candidate(p, { categories: [], sources: [], reference_state: 'none', draft: { title: '顾客问答', body: '如实回答可核实的信息。', tags: [], category_id: null } }), undefined, { type: 'qa' });
  h.page.onTitle(ev('年代不确定时怎么说')); await h.page.generateDraft(); assert.equal(h.page.data.aiCandidate.categoryName, '不分类'); assert.equal(h.page.data.aiCandidate.sources.length, 0);
  await h.page.adoptDraft(); assert.equal(h.page.data.title, '顾客问答'); assert.equal(h.page.data.categoryId, null); assert.equal(h.page.data.canSave, true); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
});
