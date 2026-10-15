const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDailyPractice } = require('../miniprogram/shared/daily-practice');
const root = path.join(__dirname, '../miniprogram/pages');
const id = '00000000-0000-4000-8000-000000000061';
const other = '00000000-0000-4000-8000-000000000062';
const event = (dataset) => ({ currentTarget: { dataset } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const library = () => ({ window_limit: 300, has_older: true, as_of: '2026-10-16T02:00:00Z', items: [id, other].map((value, i) => ({ id: value, source_type: 'official', source_id: other, snapshot: { name: '故事 ' + (i + 1) }, created_at: '2026-10-15T01:00:00Z', quiz_kind: 'favorite', quiz_available: true, passed: false })) });
const questions = () => ({ quiz_token: 'private-single-use', questions: [{ index: 0, stem: '观察什么？', options: ['品相', '价格', '尺寸', '用途'] }] });
const receipt = (extra = {}) => Object.assign({ kind: 'favorite', id, score: 0, total: 1, passed: false, submitted: [1], correct: [false], correct_answers: [0], persisted: true }, extra);

// Public-surface fake only. Selection, storage and receipt proof belong to main's helper tests.
function coordinator() {
  const state = { date: '2026-10-16', ready: false, libraryCount: 0, hasOlder: false, asOf: '', attemptedCount: 0, recommendations: [], current: null, queue: [], index: 0, active: false, finished: false, completedCount: 0, skippedCount: 0, progressError: '', preview: false };
  const calls = [], helper = {
    calls, state, generation: 1,
    stamp() { return 'guard-' + this.generation; },
    setLibrary(dto, stamp) {
      calls.push(['setLibrary', dto, stamp]);
      if (stamp !== this.stamp()) throw new Error('身份已变化');
      if (!dto || dto.window_limit !== 300 || !Array.isArray(dto.items)) throw new Error('窗口未确认');
      state.ready = true; state.libraryCount = dto.items.length; state.hasOlder = dto.has_older; state.asOf = dto.as_of;
      state.recommendations = dto.items.map((row) => ({ id: row.id, title: row.snapshot.name, state: 'ready' }));
    },
    view() { return structuredClone(state); },
    start() { calls.push(['start']); state.queue = structuredClone(state.recommendations); state.index = 0; state.current = state.queue[0] || null; state.active = !!state.current; state.finished = false; },
    matches(value) { return !!state.active && state.current && state.current.id === value && state.current.state === 'ready'; },
    recordAttempt(value, result, stamp) {
      calls.push(['recordAttempt', value, structuredClone(result), stamp]);
      if (stamp !== this.stamp() || result.kind !== 'favorite' || result.id !== value || result.persisted !== !state.preview || !Array.isArray(result.submitted)) return;
      state.attemptedCount++;
      if (state.current && state.current.id === value) { state.current.state = 'completed'; state.queue[state.index].state = 'completed'; state.completedCount++; }
    },
    next(value) { calls.push(['next', value]); if (!state.current || state.current.id !== value || state.current.state !== 'completed') return; advance(); },
    skip(value) { calls.push(['skip', value]); if (!this.matches(value)) return; state.queue[state.index].state = 'skipped'; state.skippedCount++; advance(); },
    exit() { calls.push(['exit']); state.queue = []; state.current = null; state.active = false; state.finished = false; },
    clear() { this.generation++; state.ready = false; state.queue = []; state.current = null; state.active = false; state.finished = false; }
  };
  function advance() { state.index++; state.current = state.queue[state.index] || null; state.finished = !state.current; state.active = state.queue.length > 0; }
  return helper;
}

function nativePage(name, action = async () => library(), helper = coordinator()) {
  let spec, revision = 1, employee = { userId: 'employee-a', shop: { id: 'shop-a' } };
  const app = { dailyPractice: helper }, redirects = [], navigations = [], modals = [];
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, redirectTo({ url }) { redirects.push(url); }, showModal(options) { modals.push(options); } };
  const file = path.join(root, name, 'index.js');
  assert.ok(fs.existsSync(file), name + ' page must exist');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(module) { return module === '../../shared/page' ? { definePage: (value) => value } : require(path.resolve(path.dirname(file), module)); },
    Page(value) { spec = value; }, getApp: () => app, wx, console
  }, { filename: file });
  const page = Object.assign({}, spec, {
    data: Object.assign({ loading: false, error: '', preview: false }, structuredClone(spec.data)), preview: false,
    session: { get: () => employee, revision: () => revision }, api: { action },
    setData(values) { Object.assign(this.data, values); }, navigate(url) { navigations.push(url); },
    async run(work, options = {}) { if (!options.silent) this.setData({ loading: true, error: '' }); try { return await work(); } catch (error) { this.setData({ error: error.message }); } finally { if (!options.silent) this.setData({ loading: false }); } },
    changeIdentity() { revision++; employee = { userId: 'employee-b', shop: { id: 'shop-b' } }; if (helper) helper.clear(); },
    app, helper, redirects, navigations, modals
  });
  return page;
}

function activate(helper) { helper.setLibrary(library(), helper.stamp()); helper.start(); helper.calls.length = 0; }

test('overview reads one bounded practice-library call, displays helper window and starts reading by redirect', async () => {
  const calls = [], page = nativePage('practice', async (action, params) => { calls.push({ action, params }); return library(); });
  await page.onLoad({});
  assert.equal(JSON.stringify(calls), JSON.stringify([{ action: 'practice-library', params: {} }]));
  assert.equal(page.data.practice.libraryCount, 2); assert.equal(page.data.practice.hasOlder, true);
  assert.equal(page.data.practice.asOf, '2026-10-16T02:00:00Z');
  assert.equal(page.redirects.length, 0, 'read alone must never start a queue or quiz');
  page.startPractice();
  assert.equal(page.redirects[0], '/pages/detail/index?kind=favorite&id=' + id + '&practice=1');
  page.startPractice(); assert.equal(page.helper.calls.filter((x) => x[0] === 'start').length, 1, 'double tap must not recreate queue');
});

test('overview read failure has real retry and cannot start unverified content', async () => {
  let fail = true, count = 0;
  const page = nativePage('practice', async () => { count++; if (fail) throw new Error('窗口读取失败'); return library(); });
  await page.onLoad({}); page.startPractice();
  assert.match(page.data.error, /窗口读取失败/); assert.equal(page.redirects.length, 0);
  fail = false; await page.retry(); assert.equal(count, 2); assert.equal(page.data.practice.ready, true);
});

test('overview loading and initial onShow do not duplicate the same read', async () => {
  const late = deferred(); let count = 0;
  const page = nativePage('practice', async () => { count++; return late.promise; });
  const loading = page.onLoad({}); await page.onShow(); page.startPractice();
  assert.equal(count, 1); assert.equal(page.redirects.length, 0);
  late.resolve(library()); await loading;
});

for (const transition of ['hide', 'unload', 'identity']) {
  test('overview ' + transition + ' rejects late list before installing it in helper', async () => {
    const late = deferred(), page = nativePage('practice', async () => late.promise);
    const loading = page.onLoad({});
    if (transition === 'hide') page.onHide(); else if (transition === 'unload') page.onUnload(); else page.changeIdentity();
    late.resolve(library()); await loading;
    assert.equal(page.helper.calls.filter((x) => x[0] === 'setLibrary').length, 0);
    assert.equal(page.data.practice.ready, false);
  });
}

test('overview visible return refreshes without automatically recreating or advancing active queue', async () => {
  let count = 0;
  const page = nativePage('practice', async () => { count++; return library(); });
  await page.onLoad({}); activate(page.helper); page.onHide(); await page.onShow();
  assert.equal(count, 2); assert.equal(page.data.practice.current.id, id);
  assert.equal(page.helper.calls.filter((x) => x[0] === 'start' || x[0] === 'next').length, 0);
  page.continuePractice(); assert.match(page.redirects[0], /kind=favorite.*practice=1/);
});

test('skip requires explicit confirmation; cancel and hidden callback never advance', async () => {
  const page = nativePage('practice'); await page.onLoad({}); activate(page.helper); page.syncPractice();
  page.skipPractice(); assert.equal(page.helper.state.current.id, id);
  assert.match(page.modals[0].content, /不计.*练过|不计.*掌握/);
  page.modals[0].success({ confirm: false }); assert.equal(page.helper.state.current.id, id);
  page.skipPractice(); page.onHide(); page.modals[1].success({ confirm: true });
  assert.equal(page.helper.state.current.id, id);
});

test('confirmed skip advances once with no completion or backend write; identity callback is discarded', async () => {
  let reads = 0;
  const page = nativePage('practice', async () => { reads++; return library(); }); await page.onLoad({}); activate(page.helper); page.syncPractice();
  page.skipPractice(); const modal = page.modals[0]; modal.success({ confirm: true }); modal.success({ confirm: true });
  assert.equal(page.helper.state.current.id, other); assert.equal(page.helper.state.attemptedCount, 0);
  assert.equal(page.helper.calls.filter((x) => x[0] === 'skip').length, 1); assert.equal(reads, 1);
  page.skipPractice(); page.changeIdentity(); page.modals[1].success({ confirm: true });
  assert.equal(page.helper.calls.filter((x) => x[0] === 'skip').length, 1);
});

test('exit clears only active queue through helper and retains local completed count', async () => {
  const page = nativePage('practice'); await page.onLoad({}); activate(page.helper); page.helper.state.attemptedCount = 2; page.syncPractice();
  page.exitPractice(); assert.equal(page.modals.length, 1); page.modals[0].success({ confirm: true });
  assert.equal(page.data.practice.current, null); assert.equal(page.data.practice.attemptedCount, 2);
  assert.equal(page.helper.calls.filter((x) => x[0] === 'clear').length, 0);
});

test('storage warning is rendered without saying durable progress was saved', async () => {
  const page = nativePage('practice'); page.helper.state.progressError = '本机记录保存失败，仅本次会话保留';
  await page.onLoad({}); assert.match(page.data.practice.progressError, /保存失败/);
});

test('reading valid current favorite uses bounded quiz redirect and shows queue position', async () => {
  const helper = coordinator(); activate(helper);
  const page = nativePage('detail', async () => ({ kind: 'favorite', id, title: '故事', body: '先阅读', quiz_kind: 'favorite', quiz_available: true, raw: {} }), helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' });
  assert.equal(page.data.practiceMode, true); assert.match(page.data.practiceNote, /1.*2/);
  page.openQuiz(event({ url: page.data.quizUrl }));
  assert.equal(page.redirects[0], '/pages/quiz/index?kind=favorite&id=' + id + '&practice=1');
  assert.equal(page.navigations.length, 0);
});

test('forged or expired practice marker cannot read another item or start quiz', async () => {
  for (const name of ['detail', 'quiz']) {
    const helper = coordinator(); activate(helper); let calls = 0;
    const page = nativePage(name, async () => { calls++; return questions(); }, helper);
    await page.onLoad({ kind: 'favorite', id: other, practice: '1' });
    assert.equal(calls, 0, name); assert.match(page.data.error, /本轮|连续练习/);
  }
});

test('missing source keeps actual error and offers return to overview, never automatic skip', async () => {
  const helper = coordinator(); activate(helper);
  const page = nativePage('detail', async () => { throw new Error('收藏源内容不可读取'); }, helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' });
  assert.match(page.data.error, /不可读取/); assert.equal(helper.state.current.id, id);
  page.returnPractice(); assert.equal(page.redirects[0], '/pages/practice/index');
  assert.equal(helper.calls.filter((x) => x[0] === 'skip' || x[0] === 'next').length, 0);
});

test('practice reading callback is revalidated after queue or identity changes', async () => {
  const helper = coordinator(); activate(helper);
  const page = nativePage('detail', async () => ({ kind: 'favorite', id, title: '故事', quiz_kind: 'favorite', quiz_available: true, raw: {} }), helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); const url = page.data.quizUrl;
  helper.exit(); page.openQuiz(event({ url })); assert.equal(page.redirects.length, 0);
});

test('ordinary favorite quiz records only validated saved result without advancing queue', async () => {
  const helper = coordinator(); activate(helper);
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt(), helper);
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
  const records = helper.calls.filter((x) => x[0] === 'recordAttempt');
  assert.equal(records.length, 1); assert.equal(records[0][1], id); assert.equal(records[0][2].passed, false);
  assert.equal(records[0][2].persisted, true); assert.deepEqual(records[0][2].submitted, [1]);
  assert.equal(helper.state.attemptedCount, 1); assert.equal(helper.calls.filter((x) => x[0] === 'next').length, 0);
  await page.submit(); assert.equal(helper.calls.filter((x) => x[0] === 'recordAttempt').length, 1);
});

test('quiz failure keeps same token and answers, cannot advance; saved retry enables explicit next only', async () => {
  const helper = coordinator(); activate(helper); let fail = true; const submissions = [];
  const page = nativePage('quiz', async (action, params) => {
    if (action === 'quiz-start') return questions(); submissions.push(structuredClone(params));
    if (fail) throw new Error('提交超时'); return receipt();
  }, helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
  page.nextPractice(); assert.equal(page.redirects.length, 0); assert.equal(helper.state.attemptedCount, 0);
  fail = false; await page.retry(); assert.deepEqual(submissions[0], submissions[1]);
  assert.equal(page.data.practiceCanNext, true); assert.equal(page.redirects.length, 0);
  page.nextPractice(); page.nextPractice();
  assert.equal(page.redirects.length, 1); assert.equal(page.redirects[0], '/pages/detail/index?kind=favorite&id=' + other + '&practice=1');
});

for (const bad of [{ persisted: false }, { persisted: undefined }, { kind: 'official' }, { id: other }, { score: 2 }, { submitted: [0] }]) {
  test('unconfirmed receipt never records practice: ' + JSON.stringify(bad), async () => {
    const helper = coordinator(); activate(helper);
    const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt(bad), helper);
    await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
    assert.equal(helper.calls.filter((x) => x[0] === 'recordAttempt').length, 0); assert.equal(helper.state.attemptedCount, 0);
    page.nextPractice(); assert.equal(page.redirects.length, 0);
  });
}

test('hidden or new identity saved quiz response cannot record an attempt or advance', async () => {
  for (const change of ['hide', 'identity']) {
    const helper = coordinator(); activate(helper); const late = deferred();
    const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : late.promise, helper);
    await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); const sending = page.submit();
    if (change === 'hide') page.onHide(); else page.changeIdentity();
    late.resolve(receipt()); await sending;
    assert.equal(helper.calls.filter((x) => x[0] === 'recordAttempt').length, 0);
    assert.equal(page.redirects.length, 0);
  }
});

test('last completed item explicitly returns to overview, without starting another round', async () => {
  const helper = coordinator(); activate(helper); helper.state.queue = [helper.state.queue[0]];
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt(), helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
  page.nextPractice(); assert.equal(page.redirects[0], '/pages/practice/index');
  assert.equal(helper.state.finished, true); assert.equal(helper.calls.filter((x) => x[0] === 'start').length, 0);
});

test('preview records only explicit synthetic persisted:false result in helper RAM', async () => {
  const helper = coordinator(); helper.state.preview = true; activate(helper);
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt({ persisted: false }), helper); page.preview = true;
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
  assert.equal(helper.state.attemptedCount, 1); assert.match(page.data.resultNote, /未保存真实/);
});

test('native UI has entry, four files, explicit local progress, real retry, skip and guarded next', () => {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, 'practice/index.' + ext)));
  const overview = fs.readFileSync(path.join(root, 'practice/index.wxml'), 'utf8');
  for (const term of ['preview', 'loading', 'error', 'retry', 'empty', '300', '本机', 'skipPractice', 'startPractice', 'continuePractice', 'exitPractice']) assert.ok(overview.includes(term), term);
  assert.match(overview, /不是每日限额/);
  assert.doesNotMatch(overview, /每日限额[：:]\s*\d|每日配额[：:]\s*\d|<web-view|\.includes\(|&amp;&amp;/);
  assert.match(fs.readFileSync(path.join(root, 'learn/index.wxml'), 'utf8'), /\/pages\/practice\/index/);
  assert.match(fs.readFileSync(path.join(root, 'quiz/index.wxml'), 'utf8'), /nextPractice/);
  assert.match(fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8'), /practiceNote/);
});

test('actual helper integrates overview, reading, two saved failed quizzes and bounded completion', async () => {
  const saved = new Map();
  const overview = nativePage('practice', async () => library(), null);
  const helper = createDailyPractice({ session: overview.session, now: () => Date.parse('2026-10-16T02:00:00Z'), wx: { getStorageSync: (key) => saved.get(key), setStorageSync: (key, value) => saved.set(key, structuredClone(value)) } });
  overview.app.dailyPractice = helper; await overview.onLoad({}); overview.startPractice();
  assert.equal(helper.view().queue.length, 2);
  for (const value of [id, other]) {
    const detail = nativePage('detail', async () => ({ kind: 'favorite', id: value, title: '真实形状合成故事', body: '先读，再答。', quiz_kind: 'favorite', quiz_available: true, raw: { source_available: true } }), helper);
    await detail.onLoad({ kind: 'favorite', id: value, practice: '1' }); detail.openQuiz(event({ url: detail.data.quizUrl }));
    assert.equal(detail.redirects[0], '/pages/quiz/index?kind=favorite&id=' + value + '&practice=1');
    const quiz = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt({ id: value }), helper);
    await quiz.onLoad({ kind: 'favorite', id: value, practice: '1' }); quiz.choose(event({ index: 1 })); await quiz.submit();
    assert.equal(quiz.data.result.passed, false); assert.equal(quiz.data.practiceCanNext, true);
    assert.equal(quiz.redirects.length, 0); quiz.nextPractice();
    assert.equal(quiz.redirects[0], value === id ? '/pages/detail/index?kind=favorite&id=' + other + '&practice=1' : '/pages/practice/index');
  }
  const view = helper.view();
  assert.equal(view.active, true); assert.equal(view.finished, true); assert.equal(view.current, null);
  assert.equal(view.attemptedCount, 2); assert.equal(view.completedCount, 2); assert.equal(view.recommendations.length, 0);
  const disk = JSON.stringify([...saved.values()]);
  assert.doesNotMatch(disk, /故事|private|token|answers|score|passed/);
  assert.equal(library().items[0].passed, false, 'local completion must not change source mastery');
});

test('actual helper storage failure is visible but preserves saved server result and explicit next', async () => {
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt(), null);
  const helper = createDailyPractice({ session: page.session, now: () => Date.parse('2026-10-16T02:00:00Z'), wx: { getStorageSync() {}, setStorageSync() { throw new Error('storage full'); } } });
  helper.setLibrary(library(), helper.stamp()); helper.start(); page.app.dailyPractice = helper;
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
  assert.equal(page.data.result.persisted, true); assert.equal(page.data.error, '');
  assert.match(page.data.practiceProgressError, /未能保存|内存/); assert.equal(page.data.practiceCanNext, true);
  page.nextPractice(); assert.match(page.redirects[0], new RegExp(other));
});

test('original request stamp rejects a midnight late result from local completion without denying its saved score', async () => {
  const late = deferred(); let now = Date.parse('2026-10-16T15:59:00Z'), writes = 0;
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : late.promise, null);
  const helper = createDailyPractice({ session: page.session, now: () => now, wx: { getStorageSync() {}, setStorageSync() { writes++; } } });
  helper.setLibrary(library(), helper.stamp()); helper.start(); page.app.dailyPractice = helper;
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); const sending = page.submit();
  now = Date.parse('2026-10-16T16:01:00Z'); late.resolve(receipt()); await sending;
  assert.equal(page.data.result.persisted, true); assert.equal(page.data.error, ''); assert.equal(writes, 0);
  assert.equal(page.data.practiceCanNext, false); assert.match(page.data.practiceProgressError, /日期/);
});

test('midnight timeout retries original frozen token and answers but never counts or advances the new day', async () => {
  let now = Date.parse('2026-10-16T15:59:00Z'), writes = 0;
  const submissions = [];
  const page = nativePage('quiz', async (action, params) => {
    if (action === 'quiz-start') return questions();
    submissions.push(structuredClone(params));
    if (submissions.length === 1) throw new Error('首次交卷超时，结果未知');
    return receipt({ replay: true });
  }, null);
  const helper = createDailyPractice({ session: page.session, now: () => now, wx: { getStorageSync() {}, setStorageSync() { writes++; } } });
  helper.setLibrary(library(), helper.stamp()); helper.start(); page.app.dailyPractice = helper;
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 }));
  await page.submit();
  assert.equal(submissions.length, 1); assert.equal(page.data.result, null); assert.equal(page.data.locked, true);
  const originalStamp = page._attemptPractice.stamp;
  now = Date.parse('2026-10-16T16:01:00Z');
  assert.equal(helper.view().date, '2026-10-17'); assert.equal(helper.matches(id), false);
  page.choose(event({ index: 3 }));
  await page.retry();
  assert.equal(submissions.length, 2, 'new day must not block the original uncertain answer retry');
  assert.deepEqual(submissions[1], submissions[0]);
  assert.deepEqual(submissions[1], { quiz_token: 'private-single-use', answers: [1] });
  assert.equal(page._attemptPractice.stamp, originalStamp, 'must not substitute a new-day stamp');
  assert.equal(page.data.result.persisted, true); assert.equal(page.data.error, '');
  assert.equal(helper.view().attemptedCount, 0); assert.equal(writes, 0);
  assert.equal(page.data.practiceCanNext, false); assert.match(page.data.practiceProgressError, /日期/);
  page.nextPractice(); assert.equal(page.redirects.length, 0);
});

test('first submission still requires current queue after midnight before any frozen answer exists', async () => {
  let now = Date.parse('2026-10-16T15:59:00Z'), submissions = 0;
  const page = nativePage('quiz', async (action) => { if (action === 'quiz-start') return questions(); submissions++; return receipt(); }, null);
  const helper = createDailyPractice({ session: page.session, now: () => now, wx: { getStorageSync() {}, setStorageSync() {} } });
  helper.setLibrary(library(), helper.stamp()); helper.start(); page.app.dailyPractice = helper;
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 }));
  now = Date.parse('2026-10-16T16:01:00Z'); await page.submit();
  assert.equal(submissions, 0); assert.equal(page._submittedAnswers, null);
  assert.match(page.data.error, /本轮/); assert.equal(helper.view().attemptedCount, 0);
});

test('frozen uncertain retry cannot reuse token after identity or same-user revision changes', async () => {
  for (const revisionOnly of [false, true]) {
    const submissions = [], helper = coordinator(); activate(helper);
    const page = nativePage('quiz', async (action, params) => {
      if (action === 'quiz-start') return questions(); submissions.push(structuredClone(params)); throw new Error('超时');
    }, helper);
    await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
    if (revisionOnly) page.session.revision = () => 2; else page.changeIdentity();
    await page.retry();
    assert.equal(submissions.length, 1); assert.equal(page.data.result, null);
    assert.equal(helper.calls.filter((x) => x[0] === 'recordAttempt').length, 0);
  }
});

test('normal favorite quiz remains valid with no coordinator; ordinary official result never records favorite progress', async () => {
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt(), null);
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
  assert.equal(page.data.result.persisted, true);
  const helper = coordinator(); activate(helper);
  const official = nativePage('quiz', async (action) => action === 'quiz-start' ? questions() : receipt({ kind: 'official' }), helper);
  await official.onLoad({ kind: 'official', id }); official.choose(event({ index: 1 })); await official.submit();
  assert.equal(official.data.result.persisted, true); assert.equal(helper.calls.filter((x) => x[0] === 'recordAttempt').length, 0);
});

test('explicit continuation can advance a confirmed item after native back; showing overview never does so itself', async () => {
  const page = nativePage('practice'); await page.onLoad({}); activate(page.helper);
  page.helper.recordAttempt(id, receipt(), page.helper.stamp()); page.syncPractice();
  assert.equal(page.helper.state.current.id, id); page.continuePractice();
  assert.equal(page.helper.state.current.id, other); assert.match(page.redirects[0], new RegExp(other));
});

test('leaving unknown quiz asks confirmation and never calls next or skip; hidden modal cannot redirect', async () => {
  const helper = coordinator(); activate(helper);
  const page = nativePage('quiz', async (action) => { if (action === 'quiz-start') return questions(); throw new Error('超时'); }, helper);
  await page.onLoad({ kind: 'favorite', id, practice: '1' }); page.choose(event({ index: 1 })); await page.submit();
  page.returnPractice(); assert.equal(page.redirects.length, 0); assert.match(page.modals[0].content, /未获.*确认/);
  page.onHide(); page.modals[0].success({ confirm: true }); assert.equal(page.redirects.length, 0);
  assert.equal(helper.calls.filter((x) => x[0] === 'next' || x[0] === 'skip' || x[0] === 'exit').length, 0);
});
