const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDailyPractice } = require('../miniprogram/shared/daily-practice');
const root = path.resolve(__dirname, '../miniprogram/pages/quiz');
const ID = '00000000-0000-4000-8000-000000000061';
const OTHER = '00000000-0000-4000-8000-000000000062';
const USER = '00000000-0000-4000-8000-000000000001';
const SHOP = '00000000-0000-4000-8000-000000000002';
const event = index => ({ currentTarget: { dataset: { index } } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
const fail = (status, code) => Object.assign(Error('synthetic ' + code), { status, code });
const questions = (token = 'attempt-1') => ({ quiz_token: token, questions: [{ index: 0, stem: '观察什么？', options: ['品相', '价格', '尺寸', '用途'], correctIndex: 0, explanation: 'private' }] });
const receipt = (extra = {}) => ({ kind: 'favorite', id: ID, score: 1, total: 1, passed: true, persisted: true, submitted: [0], correct: [true], correct_answers: [0], ...extra });

function harness(handler, options = {}) {
  let revision = 1, current = { userId: USER, shop: { id: SHOP, name: '合成门店' }, scopeVersion: 3 };
  let clock = Date.parse('2026-10-16T12:00:00+08:00'), starts = 0;
  const calls = [], modals = [], redirects = [], disk = {};
  const wx = { showModal(o) { modals.push(o); }, reLaunch(o) { redirects.push(o.url); }, redirectTo(o) { redirects.push(o.url); }, getStorageSync: k => disk[k], setStorageSync(k, v) { disk[k] = v; } };
  const session = { get: () => current, revision: () => revision, signOut() { current = null; revision++; } };
  const helper = options.practice ? createDailyPractice({ wx, session, preview: !!options.preview, now: () => clock }) : null;
  if (helper) {
    helper.setLibrary({ window_limit: 300, has_older: false, as_of: '2026-10-16T01:00:00Z', items: [ID, OTHER].map(id => ({ id, source_type: 'official', source_id: OTHER, snapshot: { name: '合成知识' }, created_at: '2026-10-15T01:00:00Z', passed: false, quiz_kind: 'favorite', quiz_available: true })) }, helper.stamp());
    helper.start();
  }
  const app = { session, dailyPractice: helper, preview: !!options.preview, ensureSession: async () => !!current };
  app.api = { async action(action, params) {
    calls.push({ action, params: structuredClone(params) });
    if (action === 'quiz-start') starts++;
    return handler ? handler(action, params, starts) : action === 'quiz-start' ? questions('attempt-' + starts) : receipt({ persisted: !options.preview });
  } };
  const shared = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: shared, wx, getApp: () => app });
  let spec;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), { require(id) { return id === '../../shared/page' ? shared.exports : require(path.resolve(root, id)); }, Page(p) { spec = p; }, wx, getApp: () => app });
  const page = { ...spec, data: structuredClone(spec.data), setData(x) { Object.assign(this.data, x); } };
  return { page, helper, app, calls, modals, redirects, async load() { await page.onLoad({ kind: 'favorite', id: ID, practice: options.practice ? '1' : undefined }); }, change(kind) { if (kind === 'date') clock += 86400000; else { revision++; if (kind === 'user') current = { ...current, userId: OTHER }; if (kind === 'shop') current = { ...current, shop: { id: OTHER } }; } }, starts: () => starts };
}
async function graded(handler, options, extra) {
  const h = harness(handler, options); await h.load(); h.page.choose(event(0)); await h.page.submit();
  if (!extra) assert.ok(h.page.data.result);
  return h;
}
async function confirm(h, method = 'retake') {
  assert.equal(typeof h.page[method], 'function', 'explicit ' + method + ' handler is required');
  const work = h.page[method](); assert.ok(h.modals.length); h.modals.at(-1).success({ confirm: true }); await work;
}

for (const passed of [true, false]) test('confirmed ' + passed + ' result explicitly retakes into a clean new private attempt', async () => {
  const h = await graded((a, p, n) => a === 'quiz-start' ? questions('attempt-' + n) : receipt({ score: passed ? 1 : 0, passed }));
  assert.equal(h.page.data.canRetake, true); const work = h.page.retake(); assert.equal(h.starts(), 1); assert.ok(h.page.data.result);
  h.modals[0].success({ confirm: true }); await work;
  assert.equal(h.starts(), 2); assert.equal(h.page._quizToken, 'attempt-2'); assert.equal(h.page._submittedAnswers, null); assert.equal(h.page.data.result, null);
  assert.deepEqual(Array.from(h.page.data.answers), [-1]); assert.equal(h.page.data.locked, false); assert.equal(h.page.data.review.length, 0);
  assert.equal(h.page.data.questions[0].correctIndex, undefined); assert.equal(h.page.data.questions[0].explanation, undefined);
  assert.equal(h.calls.some(c => 'force' in c.params), false); assert.equal(h.calls.filter(c => c.action === 'quiz-submit').length, 1);
});

test('cancel and duplicate retake taps open one modal and never start implicitly', async () => {
  const h = await graded(); assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake(); await h.page.retake();
  assert.equal(h.modals.length, 1); h.modals[0].success({ confirm: false }); await work;
  assert.equal(h.starts(), 1); assert.ok(h.page.data.result); assert.equal(h.page.data.confirming, false);
});

test('new-question start is single-flight and keeps the old result until complete DTO validation', async () => {
  const gate = deferred(); const h = await graded((a, p, n) => a === 'quiz-start' ? n === 1 ? questions() : gate.promise : receipt());
  const before = structuredClone(h.page.data.result); assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake(); h.modals[0].success({ confirm: true }); await tick();
  assert.equal(h.page.data.starting, true); assert.deepEqual(structuredClone(h.page.data.result), before); assert.equal(h.page._quizToken, 'attempt-1');
  await h.page.retake(); await h.page.load(); await h.page.submit(); assert.equal(h.starts(), 2);
  gate.resolve(questions('attempt-2')); await work; assert.equal(h.page.data.starting, false); assert.equal(h.page.data.result, null);
});

for (const kind of ['network', 'same-token', 'missing-token', 'bad-index', 'bad-option']) test('failed ' + kind + ' new start preserves the original confirmed result and review', async () => {
  const h = await graded((a, p, n) => {
    if (a !== 'quiz-start') return receipt(); if (n === 1) return questions();
    if (kind === 'network') throw Error('synthetic network');
    const q = questions(kind === 'same-token' ? 'attempt-1' : 'attempt-2');
    if (kind === 'missing-token') delete q.quiz_token; if (kind === 'bad-index') q.questions[0].index = 1; if (kind === 'bad-option') q.questions[0].options[0] = {};
    return q;
  });
  const old = structuredClone({ result: h.page.data.result, review: h.page.data.review, answers: h.page.data.answers }); await confirm(h);
  assert.deepEqual(structuredClone({ result: h.page.data.result, review: h.page.data.review, answers: h.page.data.answers }), old);
  assert.equal(h.page._quizToken, 'attempt-1'); assert.equal(h.page.data.canRetake, true); assert.equal(h.page.data.starting, false); assert.ok(h.page.data.error);
});

for (const mode of ['retake', 'restart']) test('current-identity ' + mode + ' 401 delegates to shared silent auth handling', async () => {
  const h = await graded((a, p, n) => {
    if (a === 'quiz-start') return n === 1 ? questions() : Promise.reject(fail(401, 'unauthorized'));
    return mode === 'retake' ? receipt() : Promise.reject(fail(410, 'quiz_expired'));
  }, undefined, mode === 'restart');
  const runs = [], run = h.page.run;
  h.page.run = function(task, options) { runs.push(options); return run.call(this, task, options); };
  await confirm(h, mode);
  assert.equal(h.app.session.get(), null); assert.deepEqual(h.redirects, ['/pages/login/index']);
  assert.equal(runs.length, 1); assert.equal(runs[0].silent, true);
  assert.equal(h.page.data.canRetake, false); assert.equal(h.page.data.canRestart, false);
  h.page.onUnload(); assert.equal(h.page._quizToken, null);
});

for (const mode of ['retake', 'restart']) for (const boundary of ['hide', 'unload', 'revision', 'user', 'shop', 'requestRevision']) test('late ' + mode + ' 401 after ' + boundary + ' cannot sign out the current session', async () => {
  const gate = deferred();
  const h = await graded((a, p, n) => {
    if (a === 'quiz-start') return n === 1 ? questions() : gate.promise;
    return mode === 'retake' ? receipt() : Promise.reject(fail(410, 'quiz_expired'));
  }, undefined, mode === 'restart');
  const work = h.page[mode](); h.modals[0].success({ confirm: true }); await tick();
  if (boundary === 'hide') h.page.onHide(); else if (boundary === 'unload') h.page.onUnload(); else if (boundary !== 'requestRevision') h.change(boundary);
  const current = h.app.session.get(), error = fail(401, 'unauthorized');
  if (boundary === 'requestRevision') error.requestRevision = 0;
  const before = structuredClone(h.page.data);
  gate.reject(error); await work;
  assert.equal(h.app.session.get(), current); assert.deepEqual(h.redirects, []);
  if (['hide', 'unload', 'revision', 'user', 'shop'].includes(boundary)) assert.equal(h.page.data.error, before.error);
  if (boundary === 'requestRevision') {
    assert.equal(h.page._quizToken, 'attempt-1'); assert.equal(h.page.data[mode === 'retake' ? 'canRetake' : 'canRestart'], true);
  }
});

for (const boundary of ['hide', 'unload', 'revision', 'user', 'shop']) test('retake modal ' + boundary + ' callback cannot start a new attempt', async () => {
  const h = await graded(); assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake();
  if (boundary === 'hide') h.page.onHide(); else if (boundary === 'unload') h.page.onUnload(); else h.change(boundary);
  h.modals[0].success({ confirm: true }); await work; assert.equal(h.starts(), 1);
});

for (const boundary of ['hide', 'unload', 'revision', 'user', 'shop']) test('late new questions after ' + boundary + ' never replace the original attempt', async () => {
  const gate = deferred(); const h = await graded((a, p, n) => a === 'quiz-start' ? n === 1 ? questions() : gate.promise : receipt());
  assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake(); h.modals[0].success({ confirm: true }); await tick();
  if (boundary === 'hide') h.page.onHide(); else if (boundary === 'unload') h.page.onUnload(); else h.change(boundary);
  gate.resolve(questions('late-attempt')); await work; assert.notEqual(h.page._quizToken, 'late-attempt'); assert.equal(h.page.data.questions.some(q => q.stem === 'late'), false);
});

test('old retake reply cannot settle or replace a newer visible retake', async () => {
  const old = deferred(), latest = deferred();
  const h = await graded((a, p, n) => a === 'quiz-start' ? n === 1 ? questions() : n === 2 ? old.promise : latest.promise : receipt());
  assert.equal(typeof h.page.retake, 'function'); const first = h.page.retake(); h.modals[0].success({ confirm: true }); await tick();
  h.page.onHide(); await h.page.onShow(); const second = h.page.retake(); h.modals[1].success({ confirm: true }); await tick();
  old.reject(Error('old error')); await first; assert.equal(h.page.data.starting, true);
  latest.resolve(questions('latest')); await second; assert.equal(h.page._quizToken, 'latest'); assert.equal(h.page.data.starting, false); assert.equal(h.page.data.error, '');
});

test('only a first exact server expiry enables an explicit restart, without an automatic start', async () => {
  const h = await graded((a, p, n) => a === 'quiz-start' ? questions('attempt-' + n) : Promise.reject(fail(410, 'quiz_expired')), undefined, true);
  assert.equal(h.page.data.canRestart, true); assert.equal(h.starts(), 1); assert.deepEqual(Array.from(h.page._submittedAnswers), [0]);
  await confirm(h, 'restart'); assert.equal(h.starts(), 2); assert.equal(h.page.data.canRestart, false); assert.equal(h.page._quizToken, 'attempt-2'); assert.equal(h.page.data.locked, false);
});

for (const first of ['timeout', '500', 'malformed', 'unpersisted']) test(first + ' then exact 410 stays unknown with the original UUID and answers', async () => {
  let submits = 0; const h = await graded((a) => {
    if (a === 'quiz-start') return questions();
    if (++submits > 1) throw fail(410, 'quiz_expired');
    if (first === 'timeout') throw Error('timeout'); if (first === '500') throw fail(500, 'db_error');
    return first === 'malformed' ? receipt({ total: 5 }) : receipt({ persisted: false });
  }, undefined, true);
  await h.page.retry(); assert.equal(h.page.data.canRestart, false); assert.equal(h.page.data.canRetake, false);
  assert.equal(typeof h.page.restart, 'function'); await h.page.restart(); await h.page.load();
  assert.equal(h.starts(), 1); assert.equal(h.page._quizToken, 'attempt-1'); assert.deepEqual(Array.from(h.page._submittedAnswers), [0]);
  const sent = h.calls.filter(c => c.action === 'quiz-submit'); assert.deepEqual(sent[0].params, sent[1].params);
});

for (const e of [fail(410, 'other'), fail(500, 'quiz_expired'), fail(403, 'forbidden')]) test('non-exact expiry ' + e.status + '/' + e.code + ' cannot release a frozen attempt', async () => {
  const h = await graded(a => a === 'quiz-start' ? questions() : Promise.reject(e), undefined, true);
  assert.equal(h.page.data.canRestart, false); assert.equal(typeof h.page.restart, 'function'); await h.page.restart(); assert.equal(h.starts(), 1);
});

test('continuous completed-current retake preserves the real helper queue and counts the item only once', async () => {
  const h = await graded(undefined, { practice: true }); const original = h.helper.view();
  assert.equal(original.current.state, 'completed'); assert.equal(original.attemptedCount, 1); await confirm(h);
  assert.equal(h.page.data.practiceCanNext, false); h.page.nextPractice(); assert.equal(h.redirects.length, 0);
  assert.deepEqual(h.helper.view().queue, original.queue); assert.equal(h.helper.view().index, original.index);
  h.page.choose(event(0)); await h.page.submit(); assert.ok(h.page.data.result); assert.equal(h.helper.view().attemptedCount, 1); assert.equal(h.helper.view().index, 0);
  assert.equal(h.page.data.practiceCanNext, true); assert.equal(h.redirects.length, 0); h.page.nextPractice(); assert.equal(h.helper.view().index, 1);
});

for (const change of ['helper', 'date', 'current']) test('continuous retake refuses changed ' + change + ' proof, including a late modal', async () => {
  const h = await graded(undefined, { practice: true }); assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake();
  if (change === 'helper') h.app.dailyPractice = { ...h.helper }; else if (change === 'date') h.change('date'); else h.helper.next(ID);
  h.modals[0].success({ confirm: true }); await work; assert.equal(h.starts(), 1); assert.equal(h.page.data.confirming, false);
});

test('initial question requests are single-flight even when retry is tapped before the first start settles', async () => {
  const gate = deferred(), h = harness(() => gate.promise); const work = h.load();
  const duplicate = h.page.retry(), third = h.page.load(); const count = h.starts();
  gate.resolve(questions()); await Promise.all([work, duplicate, third]); assert.equal(count, 1); assert.equal(h.page._quizToken, 'attempt-1');
});

test('an old initial question flight cannot block a fresh revision from loading or overwrite it later', async () => {
  const gate = deferred(), h = harness((a, p, n) => n === 1 ? gate.promise : questions('new-identity'));
  const old = h.load(); h.change('revision'); await h.page.onShow(); const next = h.page.retry();
  const count = h.starts(); gate.resolve(questions('old-identity')); await Promise.all([old, next]);
  assert.equal(count, 2); assert.equal(h.page._quizToken, 'new-identity'); assert.equal(h.page.data.loading, false);
});

test('continuous first expiry can restart a ready item without advancing or counting an attempt', async () => {
  let submits = 0;
  const h = await graded((a, p, n) => a === 'quiz-start' ? questions('attempt-' + n) : ++submits === 1 ? Promise.reject(fail(410, 'quiz_expired')) : receipt(), { practice: true }, true);
  assert.equal(h.page.data.canRestart, true); await confirm(h, 'restart');
  assert.equal(h.helper.view().attemptedCount, 0); assert.equal(h.helper.view().index, 0); assert.equal(h.helper.view().current.state, 'ready');
  h.page.choose(event(0)); await h.page.submit(); assert.equal(h.page.data.result.persisted, true); assert.equal(h.helper.view().attemptedCount, 1);
});

test('unknown submit followed by 401 never restarts and retains the existing global sign-out boundary', async () => {
  let submits = 0;
  const h = await graded(a => a === 'quiz-start' ? questions() : ++submits === 1 ? Promise.reject(Error('timeout')) : Promise.reject(fail(401, 'unauthorized')), undefined, true);
  await h.page.retry(); assert.equal(h.starts(), 1); assert.equal(h.page.data.canRestart, false);
  assert.deepEqual(h.redirects, ['/pages/login/index']); assert.equal(h.app.session.get(), null);
  h.page.onUnload(); assert.equal(h.page._quizToken, null);
});

test('practice proof changing during start refuses installation without mutating or advancing helper', async () => {
  const gate = deferred(); const h = await graded((a, p, n) => a === 'quiz-start' ? n === 1 ? questions() : gate.promise : receipt(), { practice: true });
  assert.equal(typeof h.page.retake, 'function'); const work = h.page.retake(); h.modals[0].success({ confirm: true }); await tick();
  h.helper.next(ID); gate.resolve(questions('late')); await work; assert.equal(h.page._quizToken, 'attempt-1'); assert.equal(h.helper.view().index, 1);
});

test('preview retake remains explicitly unsaved and never changes real progress', async () => {
  const h = await graded(undefined, { preview: true }); await confirm(h); assert.equal(h.page._quizToken, 'attempt-2');
  h.page.choose(event(0)); await h.page.submit(); assert.equal(h.page.data.result.persisted, false); assert.match(h.page.data.resultNote, /预览.*未保存/);
});

test('native templates bind guarded retake/restart and preserve 44px-sized controls', () => {
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'), css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8');
  assert.match(wxml, /bindtap="retake"/); assert.match(wxml, /bindtap="restart"/); assert.match(wxml, /canRetake/); assert.match(wxml, /canRestart/); assert.match(wxml, /starting/);
  for (const m of wxml.matchAll(/\bwx:(?:if|elif)="([^"]*)"/g)) assert.match(m[1], /^\{\{[\s\S]+\}\}$/);
  assert.match(css, /min-height:\s*88rpx/); assert.doesNotMatch(wxml, /web-view/);
});
