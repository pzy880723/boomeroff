const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages');
test('history cards render attempt time once rather than repeating it in the footer', () => {
  for (const page of ['learn', 'list']) {
    const template = fs.readFileSync(path.join(root, page, 'index.wxml'), 'utf8');
    assert.match(template, /<text wx:if="\{\{kind !== 'quiz-history'\}\}" class="muted">\{\{item.time\}\}<\/text>/);
  }
});
const id = '00000000-0000-4000-8000-000000000011';
const sourceId = '00000000-0000-4000-8000-000000000012';
const event = (dataset) => ({ currentTarget: { dataset } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function nativePage(name, action) {
  let spec, revision = 1, employee = { userId: 'employee-a', shop: { id: 'shop-a' } };
  const file = path.join(root, name, 'index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(module) { return module === '../../shared/page' ? { definePage: (value) => value } : require(path.resolve(path.dirname(file), module)); },
    Page(value) { spec = value; }, wx: { setNavigationBarTitle() {}, stopPullDownRefresh() {} }, console
  }, { filename: file });
  const page = Object.assign({}, spec, {
    data: Object.assign({ error: '', loading: false }, structuredClone(spec.data)), preview: false,
    api: { action }, session: { get: () => employee, revision: () => revision }, navigations: [],
    setData(values) { Object.assign(this.data, values); }, navigate(url) { this.navigations.push(url); },
    async run(work, options = {}) {
      if (!options.silent) this.setData({ loading: true, error: '' });
      try { return await work(); } catch (error) { this.setData({ error: error.message }); }
      finally { if (!options.silent) this.setData({ loading: false }); }
    },
    changeIdentity(value = { userId: 'employee-b', shop: { id: 'shop-a' } }) { employee = value; revision++; }
  });
  return page;
}
function libraryRow(overrides = {}) { return Object.assign({ id, source_type: 'official', source_id: sourceId, snapshot: { name: '器物的故事', summary: '学习内容' }, created_at: '2026-10-16T01:00:00Z', quiz_kind: 'favorite', quiz_available: true, passed: false }, overrides); }
function pageData(items, page = 0, has_more = false) { return { items, page, page_size: 20, has_more }; }
function start() { return { quiz_token: 'private-capability', questions: [{ index: 0, stem: '哪种材质？', options: ['陶', '木', '铜', '铁'], correctIndex: 3, explanation: 'never expose' }] }; }
function result(overrides = {}) { return Object.assign({ kind: 'favorite', id, score: 0, total: 1, passed: false, persisted: true, submitted: [1], correct: [false], correct_answers: [2] }, overrides); }

for (const name of ['learn', 'list']) {
  test(name + ' filters only loaded own-library rows while continuing real pages', async () => {
    const calls = [];
    const page = nativePage(name, async (action, params) => {
      calls.push({ action, params });
      return params.page === 0 ? pageData([libraryRow({ passed: true })], 0, true) : pageData([libraryRow({ id: sourceId, passed: false })], 1, false);
    });
    await page.onLoad({ kind: 'my-library' });
    if (name === 'learn') await page.onFilter(event({ kind: 'quiz' }));
    await page.onMastery(event({ mastery: 'pending' }));
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.hasMore, true, 'empty filtered page is not the end');
    assert.match(page.data.loadedSummary, /已加载 1/);
    await page.loadMore();
    assert.equal(page.data.items.length, 1);
    assert.equal(page.data.items[0].id, sourceId);
    assert.equal(calls.at(-1).params.page, 1);
    assert.equal(calls.at(-1).params.passed, undefined, 'server does not support pending filtering');
    assert.match(page.data.loadedSummary, /已加载 2/);
    await page.onMastery(event({ mastery: 'mastered' }));
    assert.equal(page.data.items[0].id, id);
    assert.equal(page.data.items[0].quizKind, 'favorite');
    assert.doesNotMatch(page.data.loadedSummary, /共计|全部收藏|总计/);
  });
}

test('unknown mastery and absent dates never become pending, passed, or now', async () => {
  const page = nativePage('list', async () => pageData([libraryRow({ passed: undefined })]));
  await page.onLoad({ kind: 'my-library' });
  assert.match(page.data.items[0].passedText, /待确认/);
  assert.equal(page.data.items[0].passedAt, '');
  assert.equal(page.data.items[0].lastAttemptAt, '');
  await page.onMastery(event({ mastery: 'pending' }));
  assert.equal(page.data.items.length, 0);
});

test('personal-library search is explicitly loaded-only and does not send unsupported query', async () => {
  const calls = [];
  const page = nativePage('list', async (action, params) => { calls.push(params); return pageData([libraryRow(), libraryRow({ id: sourceId, snapshot: { name: '陶瓷' } })]); });
  await page.onLoad({ kind: 'my-library' });
  page.onSearchInput({ detail: { value: '陶瓷' } });
  await page.onSearch();
  assert.equal(page.data.items.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, undefined);
});

for (const kind of ['official', 'favorite', 'knowledge']) {
  test('history ' + kind + ' routes content ID, not result ID; renders separate server dates', async () => {
    const page = nativePage('learn', async () => pageData([{ id, item_kind: kind, item_id: sourceId, score: 4, total: 5, passed_at: '2026-10-15T02:00:00Z', last_attempt_at: '2026-10-16T01:00:00Z' }]));
    await page.onLoad({});
    await page.onFilter(event({ kind: 'quiz-history' }));
    const row = page.data.items[0];
    assert.equal(row.passedAt, '10-15 10:00');
    assert.equal(row.lastAttemptAt, '10-16 09:00');
    assert.equal(row.passedText, '已掌握');
    page.openItem(event({ id }));
    assert.equal(page.navigations[0], '/pages/detail/index?kind=' + kind + '&id=' + sourceId);
  });
}

for (const row of [{ item_kind: 'unknown', item_id: sourceId }, { item_kind: '__proto__', item_id: sourceId }, { item_kind: 'constructor', item_id: sourceId }, { item_kind: 'official', item_id: '../wrong' }, { item_kind: 'favorite' }]) {
  test('history malformed source never substitutes result ID: ' + JSON.stringify(row), async () => {
    const page = nativePage('list', async () => pageData([Object.assign({ id, score: 1, total: 1, passed_at: null }, row)]));
    await page.onLoad({ kind: 'quiz-history' });
    page.openItem(event({ id }));
    assert.equal(page.navigations.length, 0);
    assert.match(page.data.error, /来源/);
    assert.notEqual(page.data.items[0].passedText, '已掌握');
  });
}

test('unexpected other-employee library row is rejected before display', async () => {
  const page = nativePage('list', async () => pageData([libraryRow({ user_id: 'employee-b' })]));
  await page.onLoad({ kind: 'my-library' });
  assert.equal(page.data.items.length, 0);
  assert.match(page.data.error, /身份/);
});

test('library onShow refreshes archive from server rather than local quiz guesses', async () => {
  let passed = false;
  const page = nativePage('list', async () => pageData([libraryRow({ passed })]));
  await page.onLoad({ kind: 'my-library' });
  page.onHide();
  passed = true;
  await page.onShow();
  assert.equal(page.data.items[0].passedText, '已掌握');
});

test('hidden initial response cannot populate learning; show requests fresh data', async () => {
  const old = deferred(); let calls = 0;
  const page = nativePage('learn', async () => ++calls === 1 ? old.promise : pageData([]));
  const loading = page.onLoad({});
  page.onHide();
  old.resolve(pageData([libraryRow()]));
  await loading;
  assert.equal(page.data.items.length, 0);
  await page.onShow();
  assert.equal(calls, 2);
});

test('failed next page keeps loaded rows and retries same page; stale next page never joins refreshed list', async () => {
  const late = deferred(); let mode = 'fail'; const pages = [];
  const page = nativePage('list', async (action, params) => {
    pages.push(params.page);
    if (params.page === 1 && mode === 'fail') throw new Error('续页失败');
    if (params.page === 1) return late.promise;
    return pageData([libraryRow({ snapshot: { name: mode === 'late' ? '新列表' : '旧列表' } })], 0, true);
  });
  await page.onLoad({ kind: 'my-library' });
  await page.loadMore();
  assert.equal(page.data.items.length, 1);
  assert.match(page.data.error, /续页失败/);
  mode = 'late';
  const more = page.loadMore();
  await page.load();
  late.resolve(pageData([libraryRow({ id: sourceId })], 1));
  await more;
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.items[0].title, '新列表');
  assert.deepEqual(pages, [0, 1, 1, 0]);
});

test('wrong page metadata and other identity response do not append or advance', async () => {
  const page = nativePage('list', async (action, params) => pageData([libraryRow({ id: params.page ? sourceId : id })], 0, true));
  await page.onLoad({ kind: 'my-library' });
  await page.loadMore();
  assert.equal(page.data.items.length, 1);
  assert.match(page.data.error, /分页/);
  assert.equal(page._nextPage, 1);
});

test('identity revision invalidates a late library response even for same user/shop', async () => {
  const late = deferred();
  const page = nativePage('list', async () => late.promise);
  const loading = page.onLoad({ kind: 'my-library' });
  page.changeIdentity({ userId: 'employee-a', shop: { id: 'shop-a' } });
  late.resolve(pageData([libraryRow()]));
  await loading;
  assert.equal(page.data.items.length, 0);
});

test('identity change cannot append new employee page to an old archive or refilter old rows', async () => {
  let calls = 0;
  const page = nativePage('list', async () => { calls++; return pageData([libraryRow()], 0, true); });
  await page.onLoad({ kind: 'my-library' }); page.changeIdentity(); await page.loadMore();
  assert.equal(calls, 1);
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.allItems.length, 0);
  assert.match(page.data.error, /身份|登录/);
  await page.onMastery(event({ mastery: 'all' }));
  assert.equal(page.data.items.length, 0);
});

test('detail rejects wrong source identity and unknown quiz_kind even when available=true', async () => {
  for (const dto of [
    { kind: 'official', id: sourceId, quiz_kind: 'official' },
    { kind: 'knowledge', id, quiz_kind: 'official' },
    { kind: 'knowledge', id, quiz_kind: 'mystery' },
    { kind: 'knowledge', id, quiz_kind: 'knowledge', user_id: 'employee-b' }
  ]) {
    const page = nativePage('detail', async () => Object.assign({ title: '内容', quiz_available: true, raw: {} }, dto));
    await page.onLoad({ kind: 'knowledge', id });
    assert.equal(page.data.quizUrl, '');
  }
});

test('detail returns from quiz by fresh read and honors quiz_available=false', async () => {
  let calls = 0;
  const page = nativePage('detail', async () => { calls++; return { kind: 'favorite', id, title: '收藏内容', quiz_available: calls === 1, quiz_kind: 'favorite', raw: { source_available: calls === 1 } }; });
  await page.onLoad({ kind: 'favorite', id });
  assert.match(page.data.quizUrl, /kind=favorite/);
  page.onHide();
  await page.onShow();
  assert.equal(calls, 2);
  assert.equal(page.data.quizUrl, '');
});

test('only post-submit server arrays build answer review without client scoring or invented explanation', async () => {
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : result());
  await page.onLoad({ kind: 'favorite', id });
  assert.doesNotMatch(JSON.stringify(page.data), /never expose|correctIndex|private-capability/);
  page.choose(event({ index: 1 }));
  await page.submit();
  assert.equal(page.data.result.score, 0, 'render the supplied server count');
  assert.equal(page.data.review.length, 1);
  assert.equal(page.data.review[0].selectedText, 'B · 木');
  assert.equal(page.data.review[0].correctText, 'C · 铜');
  assert.equal(page.data.review[0].verdict, '本题未答对');
  assert.doesNotMatch(JSON.stringify(page.data.review), /explanation|解析|never expose/);
});

test('missing or malformed review arrays never invent correct options', async () => {
  for (const extra of [{ correct: undefined }, { correct: [true], correct_answers: [9] }, { correct: ['false'] }]) {
    const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : result(extra));
    await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
    assert.equal(page.data.result.persisted, true);
    assert.equal(page.data.review.length, 0);
    assert.match(page.data.reviewNote, /未提供完整/);
  }
});

test('persisted false or absent never claims saved; failure preserves same token and answers', async () => {
  const submits = []; let saved = false;
  const page = nativePage('quiz', async (action, params) => {
    if (action === 'quiz-start') return start();
    submits.push(structuredClone(params)); return result({ persisted: saved ? true : undefined });
  });
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
  assert.equal(page.data.result, null);
  assert.doesNotMatch(page.data.resultNote, /已.*保存/);
  saved = true; await page.retry();
  assert.deepEqual(submits[0], submits[1]);
  assert.equal(page.data.result.persisted, true);
});

test('hidden grading response is ignored; explicit visible retry uses same frozen answer once', async () => {
  const late = deferred(); let submits = 0;
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : (++submits === 1 ? late.promise : result()));
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 }));
  const sending = page.submit(); page.onHide();
  late.resolve(result()); await sending;
  assert.equal(page.data.result, null);
  await page.submit(); assert.equal(submits, 1, 'hidden never resends');
  await page.onShow();
  assert.equal(page.data.submitting, false, 'visible retry button must not stay disabled after hidden completion');
  await Promise.all([page.retry(), page.retry()]);
  assert.equal(submits, 2);
  assert.equal(page.data.result.persisted, true);
});

test('old identity quiz token is cleared before any new submit after same-user relogin', async () => {
  let submits = 0;
  const page = nativePage('quiz', async (action) => { if (action === 'quiz-start') return start(); submits++; return result(); });
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 }));
  page.onHide(); page.changeIdentity({ userId: 'employee-a', shop: { id: 'shop-a' } }); await page.onShow();
  await page.submit();
  assert.equal(submits, 0);
  assert.equal(page._quizToken, null);
  assert.equal(page.data.questions.length, 0);
});

test('same-user relogin can load a fresh attempt while old grading settles without unlocking the new submit', async () => {
  const old = deferred(), current = deferred(); let starts = 0, submits = 0;
  const page = nativePage('quiz', async (action) => {
    if (action === 'quiz-start') return Object.assign(start(), { quiz_token: 'private-' + (++starts) });
    return ++submits === 1 ? old.promise : current.promise;
  });
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 }));
  const first = page.submit(); page.onHide();
  page.changeIdentity({ userId: 'employee-a', shop: { id: 'shop-a' } }); await page.onShow();
  assert.equal(page.data.submitting, false);
  await page.retry(); assert.equal(starts, 2);
  page.choose(event({ index: 1 })); const second = page.submit();
  old.resolve(result()); await first;
  assert.equal(page.data.result, null);
  assert.equal(page.data.submitting, true);
  await page.submit(); assert.equal(submits, 2);
  current.resolve(result()); await second;
  assert.equal(page.data.result.persisted, true);
});

test('mismatched scored content or submitted answers cannot be shown as this attempt', async () => {
  for (const extra of [{ id: sourceId }, { kind: 'official' }, { submitted: [3] }]) {
    const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : result(extra));
    await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
    assert.equal(page.data.result, null);
    assert.match(page.data.error, /回执|答卷/);
  }
});

test('score must be an integer count bounded by this attempt total; server passed is never inferred', async () => {
  for (const extra of [{ score: 77, total: 100 }, { total: 0 }, { total: 2 }, { score: -1 }, { score: 2 }, { score: 0.5 }, { score: NaN }, { score: Infinity }]) {
    const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : result(extra));
    await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
    assert.equal(page.data.result, null, JSON.stringify(extra));
    assert.match(page.data.error, /评分|回执/);
  }
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : result({ score: 1, passed: false, correct: [true], correct_answers: [1] }));
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 })); await page.submit();
  assert.equal(page.data.result.score, 1);
  assert.equal(page.data.result.passed, false, 'must not infer passing from perfect score');
});

test('empty questions or out-of-order server question index cannot start', async () => {
  for (const questions of [[], [{ index: 2, stem: 'Q', options: ['A', 'B', 'C', 'D'] }]]) {
    const page = nativePage('quiz', async () => ({ quiz_token: 'private', questions }));
    await page.onLoad({ kind: 'favorite', id });
    assert.equal(page._quizToken, null);
    assert.match(page.data.error, /题目/);
  }
});

test('library unknown source cannot be reclassified as a favorite content route', async () => {
  const page = nativePage('list', async () => pageData([libraryRow({ source_type: 'other' })]));
  await page.onLoad({ kind: 'my-library' }); page.openItem(event({ id }));
  assert.equal(page.navigations.length, 0);
  assert.match(page.data.error, /来源/);
});

test('late detail and stale quiz-entry callback cannot expose or open old employee content', async () => {
  const late = deferred();
  const page = nativePage('detail', async () => late.promise);
  const loading = page.onLoad({ kind: 'official', id }); page.onHide();
  late.resolve({ kind: 'official', id, title: '旧内容', quiz_available: true, quiz_kind: 'official' }); await loading;
  assert.equal(page.data.item, null);
  page.openQuiz(event({ url: '/pages/quiz/index?kind=official&id=' + id }));
  assert.equal(page.navigations.length, 0);
});

test('UI exposes loaded-only filters, genuine server answer review and guarded quiz entry', () => {
  for (const name of ['learn', 'list']) {
    const text = fs.readFileSync(path.join(root, name, 'index.wxml'), 'utf8');
    assert.match(text, /bindtap="onMastery"/);
    assert.match(text, /已加载/);
    assert.match(text, /passedAt/);
    assert.match(text, /lastAttemptAt/);
  }
  const quiz = fs.readFileSync(path.join(root, 'quiz/index.wxml'), 'utf8');
  assert.match(quiz, /selectedText/); assert.match(quiz, /correctText/);
  assert.doesNotMatch(quiz, /item\.explanation/);
  assert.match(fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8'), /bindtap="openQuiz"/);
});

test('non-timestamp passed_at is unknown rather than an invented pass date', async () => {
  const page = nativePage('list', async () => pageData([libraryRow({ passed_at: 12, passed: true })]));
  await page.onLoad({ kind: 'my-library' });
  assert.equal(page.data.items[0].passedAt, '');
  assert.equal(page.data.items[0].masteryState, 'unknown');
});

test('visible return while old submit is still pending unlocks explicit retry only after settlement', async () => {
  const late = deferred(); let submits = 0;
  const page = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : (++submits === 1 ? late.promise : result()));
  await page.onLoad({ kind: 'favorite', id }); page.choose(event({ index: 1 }));
  const sending = page.submit(); page.onHide(); await page.onShow();
  assert.equal(page.data.submitting, true);
  await page.retry(); assert.equal(submits, 1);
  late.resolve(result()); await sending;
  assert.equal(page.data.result, null, 'old visible epoch still cannot render its result');
  assert.equal(page.data.submitting, false);
  await page.retry(); assert.equal(submits, 2);
});

test('unloaded or hidden failed page and old grading error cannot repaint a new view', async () => {
  const late = deferred();
  const page = nativePage('learn', async () => late.promise);
  const loading = page.onLoad({}); page.onUnload(); late.reject(new Error('old error')); await loading;
  assert.equal(page.data.items.length, 0); assert.equal(page.data.error, '');
  const submit = deferred();
  const quiz = nativePage('quiz', async (action) => action === 'quiz-start' ? start() : submit.promise);
  await quiz.onLoad({ kind: 'favorite', id }); quiz.choose(event({ index: 1 }));
  const sending = quiz.submit(); quiz.onHide(); submit.reject(new Error('old grading error')); await sending;
  assert.equal(quiz.data.error, '');
});

test('favorite unavailable or malformed source has no quiz and an explicit explanation', async () => {
  for (const raw of [{ source_available: false }, { source_available: true, favorite: { source_type: 'other' } }]) {
    const page = nativePage('detail', async () => ({ kind: 'favorite', id, title: '旧收藏快照', quiz_available: true, quiz_kind: 'favorite', raw }));
    await page.onLoad({ kind: 'favorite', id });
    assert.equal(page.data.quizUrl, '');
    assert.match(page.data.learningNotice, /来源|源内容/);
  }
});

test('read, single quiz, saved server result, archive refresh and history source reopen form one loop', async () => {
  let passed = false;
  const calls = [];
  const api = async (action, params) => {
    calls.push({ action, params });
    if (action === 'my-library') return pageData([libraryRow({ passed })]);
    if (action === 'knowledge-detail') return { kind: 'favorite', id, title: '器物的故事', body: '先观察，再介绍。', quiz_available: true, quiz_kind: 'favorite', raw: { favorite: { id, source_type: 'official', source_id: sourceId }, source_available: true } };
    if (action === 'quiz-start') return start();
    if (action === 'quiz-submit') { passed = true; return result({ score: 1, passed: true, correct: [true], correct_answers: [1] }); }
    if (action === 'quiz-history') return pageData([{ id: sourceId, item_kind: 'favorite', item_id: id, score: 1, total: 1, passed_at: '2026-10-16T01:00:00Z', last_attempt_at: '2026-10-16T01:00:00Z' }]);
    throw new Error('unexpected action');
  };
  const library = nativePage('list', api); await library.onLoad({ kind: 'my-library' }); library.openItem(event({ id })); library.onHide();
  const detail = nativePage('detail', api); await detail.onLoad({ kind: 'favorite', id }); detail.openQuiz(event({ url: detail.data.quizUrl })); detail.onHide();
  const quiz = nativePage('quiz', api); await quiz.onLoad({ kind: 'favorite', id }); quiz.choose(event({ index: 1 })); await quiz.submit();
  assert.equal(quiz.data.result.persisted, true);
  await detail.onShow(); await library.onShow();
  assert.equal(library.data.items[0].masteryState, 'mastered');
  const history = nativePage('list', api); await history.onLoad({ kind: 'quiz-history' }); history.openItem(event({ id: sourceId }));
  assert.equal(history.navigations[0], library.navigations[0]);
  assert.equal(detail.navigations[0], '/pages/quiz/index?kind=favorite&id=' + id);
  assert.equal(calls.filter((entry) => entry.action === 'quiz-submit').length, 1);
});
