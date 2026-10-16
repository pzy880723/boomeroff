const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../miniprogram/pages');
const names = ['workbench', 'learn', 'messages', 'mine', 'schedule', 'list', 'detail', 'quiz', 'sales'];
const event = (dataset) => ({ currentTarget: { dataset } });
const employee = { userId: 'employee-a', shop: { id: 'shop-a', name: '测试门店' }, profile: { display_name: '同事' } };
const pendingExpId = '00000000-0000-4000-8000-000000000091';

// Native lifecycle/handler harness: only the shared shell and wx platform are mocked.
function nativePage(name, action = async () => ({ items: [] }), extra = {}) {
  const file = path.join(root, name, 'index.js');
  assert.ok(fs.existsSync(file), name + ' native page must exist');
  let definition;
  const navigations = [];
  const wx = {
    showToast() {}, stopPullDownRefresh() {},
    showModal(options) { options.success({ confirm: true }); },
    navigateTo(options) { navigations.push(options.url); },
    switchTab(options) { navigations.push(options.url); },
    reLaunch(options) { navigations.push({ method: 'reLaunch', url: options.url }); },
    setNavigationBarTitle() {}, setClipboardData() {}
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(id) {
      if (id === '../../shared/page') return { definePage: (page) => page };
      return require(path.resolve(path.dirname(file), id));
    },
    Page(page) { definition = page; }, wx, console, Date, setTimeout, clearTimeout,
    getApp: () => ({ session: { get: () => employee } })
  }, { filename: file });
  const page = Object.assign({}, definition, {
    data: structuredClone(definition.data), preview: false,
    session: { get: () => employee },
    api: { action, sales: async () => ({}), leaderboard: async () => ({ items: [] }) },
    setData(values) { Object.assign(this.data, values); },
    navigate(url) { navigations.push(url); },
    async run(work, options = {}) {
      if (!options.silent) this.setData({ loading: true, error: '' });
      try { return await work(); }
      catch (error) { this.setData({ error: error.message }); }
      finally { if (!options.silent) this.setData({ loading: false }); }
    },
    ...extra
  });
  page.navigations = navigations;
  page.platform = wx;
  return page;
}

test('all employee screens have native quartet, explicit preview, loading/error/empty and retry', () => {
  for (const name of names) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(root, name, 'index.' + ext)), name + '.' + ext);
    }
    const wxml = fs.readFileSync(path.join(root, name, 'index.wxml'), 'utf8');
    assert.match(wxml, /preview/);
    assert.match(wxml, /loading/);
    assert.match(wxml, /error/);
    assert.match(wxml, /retry/);
    assert.match(wxml, /empty/);
    assert.doesNotMatch(wxml, /\.includes\(|\{\{\s*\{|<web-view/);
    assert.doesNotMatch(wxml, /\{\{[^}]*&amp;/, 'WXML expressions require raw operators, not XML entities: ' + name);
    JSON.parse(fs.readFileSync(path.join(root, name, 'index.json')));
  }
});

test('learning sends search and category filters to adapter, not synthetic local content', async () => {
  const calls = [];
  const page = nativePage('learn', async (action, params) => {
    calls.push({ action, params });
    return { items: [{ id: 'k1', title: '陶瓷' }], categories: [{ id: 'c1', name: '器物' }] };
  });
  await page.onLoad({});
  page.onSearchInput({ detail: { value: '陶瓷' } });
  await page.onSearch();
  await page.onCategory(event({ id: 'c1' }));
  assert.equal(calls.at(-1).params.q, '陶瓷');
  assert.equal(calls.at(-1).params.category, 'c1');
  await page.onFilter(event({ kind: 'quiz-history' }));
  assert.equal(calls.at(-1).action, 'quiz-history');
  assert.equal(page.data.items.length, 1);
});

test('learning failures clear prior items and retry performs a fresh request', async () => {
  let fail = false;
  const page = nativePage('learn', async () => {
    if (fail) throw new Error('知识接口暂不可用');
    return { items: [{ id: 'a', title: 'A' }] };
  });
  await page.onLoad({});
  fail = true;
  await page.retry();
  assert.equal(page.data.items.length, 0);
  assert.match(page.data.error, /接口/);
  fail = false;
  await page.retry();
  assert.equal(page.data.error, '');
  assert.equal(page.data.items.length, 1);
});

test('late search responses cannot replace the latest category results', async () => {
  let finish;
  const page = nativePage('learn', async (action, params) => {
    if (params.q === '旧') return new Promise((resolve) => { finish = resolve; });
    return { items: [{ id: 'new', title: '新结果' }] };
  });
  await page.onLoad({});
  page.onSearchInput({ detail: { value: '旧' } });
  const old = page.onSearch();
  page.onSearchInput({ detail: { value: '新' } });
  await page.onSearch();
  finish({ items: [{ id: 'old', title: '旧结果' }] });
  await old;
  assert.equal(page.data.items[0].id, 'new');
});

test('notifications remain unread until the server confirms the write and failure is retryable', async () => {
  let fail = true;
  let writes = 0;
  const page = nativePage('messages', async (action) => {
    if (action === 'notifications') return { items: [{ id: 'n1', title: '通知', read: false }] };
    writes++;
    if (fail) throw new Error('写入失败');
    return { marked: 1 };
  });
  await page.onLoad({});
  await page.markRead(event({ id: 'n1' }));
  assert.equal(page.data.items[0].read, false);
  assert.match(page.data.error, /失败/);
  fail = false;
  await page.markRead(event({ id: 'n1' }));
  assert.equal(page.data.items[0].read, true);
  assert.equal(page.data.error, '');
  assert.equal(writes, 2);
});

test('month schedule renders every day and every shift without a five-day cap', async () => {
  const calls = [];
  const shifts = Array.from({ length: 12 }, (_, index) => ({ id: String(index), date: '2026-10-' + String(index + 1).padStart(2, '0'), title: '早班' }));
  const page = nativePage('schedule', async (action, params) => {
    calls.push({ action, params });
    return { items: shifts };
  });
  await page.onLoad({ month: '2026-10' });
  assert.equal(calls[0].params.month, '2026-10');
  assert.equal(page.data.items.length, 12);
  assert.equal(page.data.days.filter((day) => day.date).length, 31);
  await page.onMonthChange({ detail: { value: '2026-11' } });
  assert.equal(calls.at(-1).params.month, '2026-11');
  assert.equal(page.data.days.filter((day) => day.date).length, 30);
});

test('quiz strips answer keys and explanation before grading; duplicate submission is single-flight', async () => {
  let finish;
  const submits = [];
  const page = nativePage('quiz', async (action, params) => {
    if (action === 'quiz-start') return {
      quiz_token: 'private-quiz-capability', title: '练习', questions: [
        { index: 0, stem: '材质？', options: ['陶', '木', '铜', '铁'], correctIndex: 0, answer: '陶', explanation: 'secret' }
      ]
    };
    submits.push(params);
    return new Promise((resolve) => { finish = resolve; });
  });
  await page.onLoad({ kind: 'favorite', id: 'f1' });
  assert.doesNotMatch(JSON.stringify(page.data), /correctIndex|secret|private-quiz-capability|"answer":/);
  await page.submit();
  assert.equal(submits.length, 0, 'incomplete attempt must not submit');
  page.choose(event({ index: 0 }));
  const first = page.submit();
  const duplicate = page.submit();
  assert.equal(submits.length, 1);
  assert.equal(submits[0].quiz_token, 'private-quiz-capability');
  assert.equal(submits[0].answers[0], 0);
  finish({ score: 1, total: 1, passed: false, persisted: true });
  await first;
  await duplicate;
  assert.equal(page.data.result.score, 1, 'only valid server count is rendered; passing is not inferred');
  assert.equal(page.data.result.passed, false);
  await page.submit();
  assert.equal(submits.length, 1, 'completed attempts must not be submitted again');
});

test('quiz retry preserves answers and attempt identity and never fabricates a score on failure', async () => {
  let fail = true;
  const calls = [];
  const page = nativePage('quiz', async (action, params) => {
    if (action === 'quiz-start') return { quiz_token: 'a1', questions: [{ index: 0, stem: 'Q', options: ['A', 'B', 'C', 'D'] }] };
    calls.push(params);
    if (fail) throw new Error('提交超时');
    return { score: 1, total: 1, passed: true, persisted: true };
  });
  await page.onLoad({ id: 'fav' });
  page.choose(event({ index: 1 }));
  await page.submit();
  assert.equal(page.data.result, null);
  assert.equal(page.data.answers[0], 1);
  assert.match(page.data.error, /超时/);
  fail = false;
  await page.retry();
  assert.equal(calls[0].quiz_token, calls[1].quiz_token);
  assert.equal(page.data.result.score, 1);
});

test('sales missing values are not zero and freshness is explicit', async () => {
  const page = nativePage('sales', undefined, {
    api: { sales: async () => ({ revenue: null, order_count: 0 }), leaderboard: async () => ({ items: [] }) }
  });
  await page.onLoad({});
  assert.equal(page.data.metrics[0].value, '暂无数据');
  assert.equal(page.data.metrics[1].value, '0');
  assert.match(page.data.freshness, /未提供/);
});

test('generic native list covers original employee entry routes and preserves encoded ids', async () => {
  const kinds = ['sop', 'qa', 'objectives', 'tasks', 'community', 'activities', 'vouchers', 'my-library', 'favorites', 'history', 'quiz-history'];
  for (const kind of kinds) {
    const contentId = kind === 'tasks' ? pendingExpId : (kind === 'quiz-history' ? '00000000-0000-4000-8000-000000000012' : 'a/b ?中');
    const page = nativePage('list', async () => kind === 'tasks' ? roundSixTasks() : ({ items: [{ id: 'a/b ?中', title: '条目', ...(kind === 'quiz-history' ? { item_kind: 'official', item_id: contentId, passed_at: null } : {}) }] }));
    await page.onLoad({ kind });
    page.openItem(event({ id: kind === 'tasks' ? pendingExpId : 'a/b ?中' }));
    assert.match(page.navigations[0], kind === 'community' ? /\/pages\/community\/index\?id=/ : kind === 'activities' ? /\/pages\/activity\/index\?id=/ : /\/pages\/detail\/index\?kind=/);
    assert.ok(page.navigations[0].includes(encodeURIComponent(contentId)));
    if (kind === 'quiz-history') assert.match(page.navigations[0], /kind=official/, 'result ID is not a content ID');
  }
});

test('native detail reads rich text rather than launching article urls', async () => {
  const calls = [];
  const page = nativePage('detail', async (action, params) => {
    calls.push({ action, params });
    return { item: { id: 'k1', title: '工艺', body: '<p>知识正文</p>' } };
  });
  await page.onLoad({ kind: 'knowledge', id: 'k1' });
  assert.equal(calls[0].action, 'knowledge-detail');
  assert.equal(calls[0].params.id, 'k1');
  assert.equal(page.data.nodes, '<p>知识正文</p>');
  assert.match(fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8'), /<rich-text\b/);
});

test('identity changes during request discard employee data', async () => {
  let finish;
  let session = employee;
  const page = nativePage('learn', () => new Promise((resolve) => { finish = resolve; }), { session: { get: () => session } });
  const pending = page.onLoad({});
  session = null;
  finish({ items: [{ id: 'private', title: '前用户资料' }] });
  await pending;
  assert.equal(page.data.items.length, 0);
});

test('unmounted pages do not accept a late response', async () => {
  let finish;
  const page = nativePage('learn', () => new Promise((resolve) => { finish = resolve; }));
  const pending = page.onLoad({});
  page._gone = true;
  finish({ items: [{ id: 'late', title: 'Late' }] });
  await pending;
  assert.equal(page.data.items.length, 0);
});

test('scope-version changes invalidate a pending employee response', async () => {
  let finish;
  let session = { ...employee, scopeVersion: 1 };
  const page = nativePage('learn', () => new Promise((resolve) => { finish = resolve; }), { session: { get: () => session } });
  const pending = page.onLoad({});
  session = { ...employee, scopeVersion: 2 };
  finish({ items: [{ id: 'old-scope', title: 'Old' }] });
  await pending;
  assert.equal(page.data.items.length, 0);
});

test('real schedule DTO joins shift definitions on store and code', async () => {
  const page = nativePage('schedule', async () => ({
    schedules: [{ id: 'shift', work_date: '2026-10-22', shift_code: 'early', shop_id: 'shop-a' }],
    shift_defs: [{ code: 'early', shop_id: 'shop-b', name: '错误门店' }, { code: 'early', shop_id: 'shop-a', name: '早班', start_time: '10:00', end_time: '18:00' }]
  }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items[0].title, '早班');
  assert.equal(page.data.items[0].start, '10:00');
});

test('explicit preview can show unpersisted demo score but never claims a saved result', async () => {
  const action = async (name) => name === 'quiz-start'
    ? { quiz_token: 'demo-only', questions: [{ index: 0, stem: 'Demo?', options: ['A', 'B', 'C', 'D'] }] }
    : { score: 1, total: 1, passed: true, persisted: false };
  const live = nativePage('quiz', action);
  await live.onLoad({ id: 'demo' });
  live.choose(event({ index: 0 }));
  await live.submit();
  assert.equal(live.data.result, null);
  assert.match(live.data.error, /确认/);
  const preview = nativePage('quiz', action, { preview: true });
  await preview.onLoad({ id: 'demo' });
  preview.choose(event({ index: 0 }));
  await preview.submit();
  assert.equal(preview.data.result.score, 1);
  assert.equal(preview.data.result.persisted, false);
  assert.match(preview.data.resultNote, /未保存/);
});

test('sales displays attribution block reason and uses neutral gross-payment label', async () => {
  const page = nativePage('sales', undefined, {
    api: {
      sales: async () => ({ revenue: null, complete: false, message: '尚无完整金额' }),
      leaderboard: async () => ({ items: [], complete: false, message: '员工销售归属尚未接通' })
    }
  });
  await page.onLoad({ kind: 'leaderboard' });
  assert.match(page.data.leaderboardNotice, /归属/);
  assert.equal(page.data.metrics[0].label, '付款毛额（未扣退款）');
});

test('list paginates server pages and does not drop a failed page or duplicate ids', async () => {
  let fail = true;
  const calls = [];
  const page = nativePage('list', async (action, params) => {
    calls.push(params);
    if (params.page === 1) {
      if (fail) throw new Error('分页超时');
      return { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], page: 1, has_more: false };
    }
    return { items: [{ id: 'a', title: 'A' }], page: 0, has_more: true };
  });
  await page.onLoad({ kind: 'community' });
  assert.equal(page.data.hasMore, true);
  await page.loadMore();
  assert.match(page.data.error, /超时/);
  assert.equal(page.data.items.length, 1);
  fail = false;
  await page.loadMore();
  assert.equal(page.data.items.length, 2);
  assert.equal(calls.at(-1).page, 1);
  assert.equal(page.data.hasMore, false);
});

test('native detail can display existing list-style responses by matching id, never the wrong item', async () => {
  const page = nativePage('detail', async () => ({ items: [{ id: 'a', title: 'Wrong' }, { id: 'b', title: 'Correct', body: 'Body' }] }));
  await page.onLoad({ kind: 'activities', id: 'b' });
  assert.equal(page.data.item.title, 'Correct');
  await page.onLoad({ kind: 'activities', id: 'missing' });
  assert.equal(page.data.item, null);
  assert.match(page.data.error, /详情/);
});

test('mine only switches stores from the verified headquarters allowlist', async () => {
  const selected = [];
  const session = { ...employee, isHeadquarters: true, shops: [{ id: 'shop-a', name: 'A' }, { id: 'shop-b', name: 'B' }] };
  const page = nativePage('mine', async () => ({ profile: employee.profile }), {
    session: { get: () => session, selectShop(id) { selected.push(id); session.shop = session.shops.find((shop) => shop.id === id); } }
  });
  await page.onLoad({});
  await page.onShopChange({ detail: { value: 1 } });
  assert.equal(selected[0], 'shop-b');
  await page.onShopChange({ detail: { value: 999 } });
  assert.equal(selected.length, 1);
  assert.match(page.data.error, /不可/);
});

test('workbench paints its shift before a slow financial request completes', async () => {
  let finishSales;
  const page = nativePage('workbench', async () => ({ shift: { title: '早班', start_time: '10:00', end_time: '18:00' }, tasks: [], learning: [] }), {
    api: {
      action: async () => ({ shift: { title: '早班', start_time: '10:00', end_time: '18:00' }, tasks: [], learning: [] }),
      sales: () => new Promise((resolve) => { finishSales = resolve; })
    }
  });
  const pending = page.onLoad({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.data.shift && page.data.shift.title, '早班');
  assert.equal(page.data.loading, false);
  finishSales({ revenue: 100, source_label: '付款毛额（未扣退款）' });
  await pending;
  assert.equal(page.data.salesValue, '¥100.00');
});

test('learning source switch preserves official identity for native details and quiz entry', async () => {
  const calls = [];
  const page = nativePage('learn', async (action, params) => {
    calls.push({ action, params });
    return { items: [{ id: 'off1', title: '官方知识', quiz_kind: 'official' }] };
  });
  await page.onLoad({});
  await page.onSource(event({ source: 'official' }));
  assert.equal(calls.at(-1).params.source, 'official');
  page.openItem(event({ id: 'off1' }));
  assert.match(page.navigations[0], /kind=official/);
  await page.onFilter(event({ kind: 'quiz' }));
  assert.equal(calls.at(-1).action, 'my-library');
});

test('learning can load every server page and keeps the current query and category', async () => {
  const calls = [];
  const page = nativePage('learn', async (action, params) => {
    calls.push(params);
    return { items: [{ id: 'page-' + params.page, title: '知识' }], page: params.page, has_more: params.page < 1 };
  });
  await page.onLoad({});
  page.onSearchInput({ detail: { value: '器物' } });
  await page.onCategory(event({ id: 'ceramic' }));
  await page.loadMore();
  assert.equal(calls.at(-1).page, 1);
  assert.equal(calls.at(-1).q, '器物');
  assert.equal(calls.at(-1).category, 'ceramic');
  assert.equal(page.data.items.length, 2);
});

test('official favorites and product library writes use their real source contracts', async () => {
  const calls = [];
  let favorite = false;
  const page = nativePage('detail', async (action, params) => {
    calls.push({ action, params });
    if (action === 'knowledge-favorite') { favorite = params.favorite; return { favorite }; }
    if (action === 'knowledge-save') return { saved: true };
    if (params.kind === 'official') return { kind: 'official', id: 'official-a', title: '官方知识', raw: { is_favorite: favorite } };
    return { kind: 'knowledge', id: 'knowledge-a', title: '杯子', body: '说明', raw: { is_favorite: favorite, product_id: 'product-a' } };
  });
  await page.onLoad({ kind: 'official', id: 'official-a' });
  await page.toggleFavorite();
  assert.equal(calls.find((call) => call.action === 'knowledge-favorite').params.id, 'official-a');
  assert.equal(page.data.favorite, true);
  await page.onLoad({ kind: 'knowledge', id: 'knowledge-a' });
  await page.saveKnowledge();
  assert.equal(calls.find((call) => call.action === 'knowledge-save').params.product_id, 'product-a');
});

test('task claim failure never changes progress or claims a successful reward', async () => {
  const page = nativePage('detail', async (action) => {
    if (action === 'task-claim') throw new Error('云端尚未确认任务完成');
    return { items: [{ id: 'daily_quiz', task_key: 'daily_quiz', title: '知识测验', progress: 1, target: 1, completed: true, claimed: false, amount: 15 }], pending_items: [] };
  });
  await page.onLoad({ kind: 'tasks', id: 'daily_quiz' });
  await page.claimTask();
  assert.match(page.data.error, /尚未确认/);
  assert.equal(page.data.claimed, false);
  assert.equal(page.data.actionNotice, '');
});

test('objective form writes key actions and results only after explicit save', async () => {
  const writes = [];
  let row = { id: 'o1', shop_id: employee.shop.id, title: '服务协作', key_actions: '旧行动', key_results: [{ title: '学习', done: false }], updated_at: '2026-10-16T01:00:00Z' };
  const page = nativePage('detail', async (action, params) => {
    if (action === 'objective-update') {
      writes.push(params);
      row = Object.assign({}, row, params, { updated_at: '2026-10-16T01:01:00Z' });
      return { id: row.id, key_actions: row.key_actions, key_results: row.key_results, updated_at: row.updated_at };
    }
    return { shop_id: employee.shop.id, page: params.page, page_size: params.page_size, has_more: false, items: [row] };
  });
  await page.onLoad({ kind: 'objectives', id: 'o1' });
  page.onKeyActionsInput({ detail: { value: '核对价签' } });
  page.onKeyResultChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: true } });
  assert.equal(writes.length, 0);
  await page.saveObjective();
  assert.equal(writes[0].key_actions, '核对价签');
  assert.equal(writes[0].key_results[0].done, true);
  assert.match(page.data.actionNotice, /已核对一致/);
});

test('community share submits the existing product id and is single-flight', async () => {
  let finish;
  const writes = [];
  const page = nativePage('detail', async (action, params) => {
    if (action === 'community-post') { writes.push(params); return new Promise((resolve) => { finish = resolve; }); }
    return { kind: 'knowledge', id: 'k1', title: '瓷器', raw: { product_id: 'p1' } };
  });
  await page.onLoad({ kind: 'knowledge', id: 'k1' });
  const first = page.shareCommunity();
  const second = page.shareCommunity();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].product_id, 'p1');
  finish({ id: 'post1' });
  await first;
  await second;
});

test('activities and vouchers use their dedicated native detail actions', async () => {
  for (const [kind, expected] of [['activities', 'activity-detail'], ['vouchers', 'voucher-detail']]) {
    const calls = [];
    const page = nativePage('detail', async (action) => { calls.push(action); return { item: { id: 'one', title: '详情' } }; });
    await page.onLoad({ kind, id: 'one' });
    assert.equal(calls[0], expected);
  }
});
test('legacy activity detail exposes only its currently loaded native activity entry', async () => {
  const id='00000000-0000-4000-8000-000000000031';
  const page=nativePage('detail',async()=>({item:{id,title:'活动'}}));
  await page.onLoad({kind:'activities',id});
  assert.equal(typeof page.openActivity,'function');
  page.openActivity();assert.equal(page.navigations[0],'/pages/activity/index?id='+id);
  page._identity='old-scope';page.openActivity();assert.equal(page.navigations.length,1);
  page._identity=require('../miniprogram/pages/list/model').scope(page);page.data.item={id:'foreign'};
  page.openActivity();assert.equal(page.navigations.length,1);
});

test('conversation native send preserves draft on failure and clears only after confirmed reply', async () => {
  let fail = true;
  const calls = [];
  const page = nativePage('detail', async (action, params) => {
    calls.push({ action, params });
    if (action === 'conversation-send') {
      if (fail) throw new Error('发送失败');
      return { conversation_id: 'conv1', reply: '已收到' };
    }
    return { items: [{ id: 'm1', role: 'assistant', content: '已收到' }] };
  });
  await page.onLoad({ kind: 'conversation', id: 'conv1' });
  page.onMessageInput({ detail: { value: '你好' } });
  await page.sendMessage();
  assert.equal(page.data.messageDraft, '你好');
  assert.match(page.data.error, /失败/);
  fail = false;
  await page.sendMessage();
  assert.equal(page.data.messageDraft, '');
  assert.equal(calls.find((call) => call.action === 'conversation-send').params.conversation_id, 'conv1');
  assert.equal(page.data.messages[0].content, '已收到');
});

test('logout discards the private page stack with reLaunch, never navigateTo', async () => {
  let cleared = false;
  const page = nativePage('mine', async () => ({ profile: employee.profile }), {
    session: { get: () => employee, signOut() { cleared = true; } }
  });
  await page.onLoad({});
  page.logout();
  assert.equal(cleared, true);
  assert.equal(page.data.profile, null);
  assert.equal(page.navigations.at(-1).method, 'reLaunch');
  assert.equal(page.navigations.at(-1).url, '/pages/login/index');
});

test('freshness is China-local compact time and invalid timestamps never become now', () => {
  const model = require('../miniprogram/pages/list/model');
  assert.equal(model.freshness({ as_of: '2026-10-16T02:05:00Z' }), '数据更新 · 10-16 10:05');
  assert.match(model.freshness({ as_of: 'bad timestamp' }), /未提供/);
  assert.doesNotMatch(model.freshness({ as_of: 'bad timestamp' }), /NaN|现在|刚刚/);
});

test('favorite aliases and recognition history fetch real details, never search a list page', async () => {
  for (const [routeKind, apiKind] of [['favorite', 'favorite'], ['favorites', 'favorite'], ['my-library', 'favorite'], ['history', 'history']]) {
    const calls = [];
    const page = nativePage('detail', async (action, params) => {
      calls.push({ action, params });
      return { kind: apiKind, id: 'remote-id', title: '完整内容', body: '正文', raw: {} };
    });
    await page.onLoad({ kind: routeKind, id: 'remote-id' });
    assert.equal(calls[0] && calls[0].action, 'knowledge-detail');
    assert.equal(calls[0].params.kind, apiKind);
    assert.equal(calls[0].params.id, 'remote-id');
    assert.equal(page.data.item && page.data.item.title, '完整内容');
  }
});

test('round-three detail displays raw business facts, complete rich card and story without leaking raw metadata', async () => {
  const page = nativePage('detail', async () => ({
    kind: 'knowledge', id: 'k1', title: '陶瓷杯', body: '<p>完整正文</p>', cover_url: 'https://example.com/cup.jpg', quiz_available: true, quiz_kind: 'knowledge',
    raw: {
      product_id: 'product-real', material: '瓷', craft: '釉下彩', era: '年代未确认', origin: '日本',
      selling_points: ['轻巧杯型', { text: '手绘装饰', tag: '工艺', detail: '笔触可见' }],
      tips: '{"memory":"先看底款","objection":"年代不作保证"}',
      card: {
        one_liner: '一只适合日常用的杯子', pronunciation: 'táo cí', aliases: ['茶杯'],
        quick_facts: [{ label: '容量', value: '约 200ml' }],
        customer_pitches: [{ scene: '客人问用途', line: '日常喝茶很合适' }],
        selling_points_rich: [{ text: '手绘装饰', tag: '工艺', detail: '笔触可见' }],
        comparisons: [{ name: '印花杯', diff: '观察图案边缘与笔触' }]
      },
      ai_analysis: { result: { story: '商品背后的完整故事', pitch: { opener: '欢迎看看这只杯子', highlight: '可见的手绘细节', story: '话术中的补充故事' } } },
      access_token: 'private-not-for-view', quiz: { answer: 'never-project' }
    }
  }));
  await page.onLoad({ kind: 'knowledge', id: 'k1' });
  assert.equal(page.data.item && page.data.item.title, '陶瓷杯');
  assert.equal(page.data.nodes, '<p>完整正文</p>');
  const view = JSON.stringify(page.data);
  for (const text of ['瓷', '釉下彩', '年代未确认', '日本', '轻巧杯型', '手绘装饰', '笔触可见', '先看底款', '年代不作保证', '一只适合日常用的杯子', '约 200ml', '日常喝茶很合适', '观察图案边缘与笔触', '商品背后的完整故事', '欢迎看看这只杯子', '可见的手绘细节', '话术中的补充故事']) assert.ok(view.includes(text), text);
  assert.doesNotMatch(view, /private-not-for-view|never-project|\[object Object\]/);
  const wxml = fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8');
  assert.match(wxml, /businessSections/);
  assert.match(page.data.quizUrl, /kind=knowledge/);
});

test('flat recognition analysis and enriched card remain visible after round four', async () => {
  const page = nativePage('detail', async () => ({
    kind: 'history', id: 'history-id', title: '识物历史', body: '', quiz_available: false, quiz_kind: 'favorite',
    raw: { product_id: 'product-id', ai_analysis: { story: '平铺故事', pitch: '平铺推介话术', enriched: { one_liner: '平铺知识卡', selling_points_rich: [{ text: '卡片卖点' }] } } }
  }));
  await page.onLoad({ kind: 'history', id: 'history-id' });
  const view = JSON.stringify(page.data);
  for (const text of ['平铺故事', '平铺推介话术', '平铺知识卡', '卡片卖点']) assert.ok(view.includes(text), text);
  assert.equal(page.data.quizUrl, '');
});

test('save and community share require raw products id, never a knowledge row or guessed source id', async () => {
  const writes = [];
  const page = nativePage('detail', async (action, params) => {
    if (action === 'knowledge-save' || action === 'community-post') { writes.push(params); return { ok: true }; }
    return { kind: 'knowledge', id: 'knowledge-only', title: '知识条目', product_id: 'untrusted-top-level', raw: { id: 'knowledge-only', source_id: 'guessed' } };
  });
  await page.onLoad({ kind: 'knowledge', id: 'knowledge-only' });
  assert.equal(page.data.canSave, false);
  assert.equal(page.data.canShare, false);
  await page.saveKnowledge();
  await page.shareCommunity();
  assert.equal(writes.length, 0);
});

test('quiz links require explicit availability and kind, including orphaned favorites', async () => {
  for (const flags of [{}, { quiz_kind: 'favorite' }, { quiz_available: false, quiz_kind: 'favorite' }, { quiz_available: true }, { quiz_available: true, quiz_kind: '' }]) {
    const page = nativePage('detail', async () => ({ kind: 'favorite', id: 'f1', title: '历史收藏', raw: { source_missing: true }, ...flags }));
    await page.onLoad({ kind: 'favorites', id: 'f1' });
    assert.equal(page.data.quizUrl, '', JSON.stringify(flags));
  }
  const available = nativePage('detail', async () => ({ kind: 'favorite', id: 'f1', title: '收藏', quiz_available: true, quiz_kind: 'favorite', raw: {} }));
  await available.onLoad({ kind: 'my-library', id: 'f1' });
  assert.match(available.data.quizUrl, /kind=favorite&id=f1/);
  const missing = nativePage('detail', async () => { throw new Error('收藏源内容不存在，无法开始测验'); });
  await missing.onLoad({ kind: 'favorites', id: 'gone' });
  assert.equal(missing.data.item, null);
  assert.equal(missing.data.quizUrl, '');
  assert.match(missing.data.error, /不存在/);
});

test('message cards use Chinese categories and compact China time, never raw ISO or enum labels', async () => {
  const page = nativePage('messages', async () => ({ items: [
    { id: 'n1', title: '门店提醒', category: 'notice', created_at: '2026-10-16T09:20:00+08:00' },
    { id: 'n2', title: '排班更新', category: 'schedule', created_at: '2026-10-16T02:30:00Z' },
    { id: 'n3', title: '新培训', category: 'learning', created_at: 'invalid' }
  ] }));
  await page.onLoad({});
  assert.equal(page.data.items[0].category, '工作通知');
  assert.equal(page.data.items[1].category, '排班通知');
  assert.equal(page.data.items[2].category, '学习通知');
  assert.equal(page.data.items[0].time, '10-16 09:20');
  assert.equal(page.data.items[1].time, '10-16 10:30');
  assert.match(page.data.items[2].time, /未提供/);
  assert.doesNotMatch(JSON.stringify(page.data.visibleItems), /T09:20:00|T02:30:00|"notice"|"schedule"|"learning"/);
});

test('quiz list and workbench cannot bypass detail availability checks for stale favorites', async () => {
  const learn = nativePage('learn', async () => ({ items: [{ id: 'orphan', title: '旧收藏', quiz_available: false }] }));
  await learn.onLoad({});
  await learn.onFilter(event({ kind: 'quiz' }));
  learn.openItem(event({ id: 'orphan' }));
  assert.match(learn.navigations[0], /\/pages\/detail\/index\?kind=favorite/);
  assert.doesNotMatch(learn.navigations[0], /\/pages\/quiz\//);
  const workbench = nativePage('workbench', async () => ({ learning: [{ id: 'orphan', title: '旧收藏', kind: 'quiz', quiz_available: false }] }));
  await workbench.onLoad({});
  assert.equal(workbench.data.agenda.length, 0, 'recommended articles are not required tasks');
});

test('SOP and QA use real learning row ids and type/category_id filters, not product knowledge', async () => {
  for (const kind of ['sop', 'qa']) {
    const calls = [];
    const page = nativePage('list', async (action, params) => {
      calls.push({ action, params });
      assert.equal(action, 'learning');
      return { items: [{ id: 'shop-kb-' + kind, title: kind === 'sop' ? '开店流程' : '价格问答', body: '门店知识正文', type: kind, category_id: 'service' }], categories: [{ id: 'service', name: '服务' }], page: 0, has_more: false };
    });
    await page.onLoad({ kind });
    await page.onCategory(event({ id: 'service' }));
    assert.equal(calls.at(-1).params.type, kind);
    assert.equal(calls.at(-1).params.category_id, 'service');
    page.openItem(event({ id: 'shop-kb-' + kind }));
    assert.ok(page.navigations[0].includes('kind=' + kind));
    assert.ok(page.navigations[0].includes('shop-kb-' + kind));
    assert.equal(page.data.error, '');
  }
});

test('raw knowledge searches send q for both learning tab and generic list, including subsequent pages', async () => {
  for (const name of ['learn', 'list']) {
    const calls = [];
    const page = nativePage(name, async (action, params) => {
      calls.push({ action, params });
      return { items: [{ id: 'knowledge-row-' + params.page, product_name: '釉下彩茶杯', description: '观察釉面与品相', image_url: 'https://example.com/cup.jpg', created_at: '2026-10-16T09:20:00+08:00' }], page: params.page, has_more: params.page === 0 };
    });
    await page.onLoad({ kind: 'knowledge' });
    page.onSearchInput({ detail: { value: '釉下彩' } });
    await page.onSearch();
    await page.loadMore();
    assert.equal(calls.at(-1).action, 'knowledge');
    assert.equal(calls.at(-1).params.q, '釉下彩');
    assert.equal(calls.at(-1).params.query, undefined);
    assert.equal(page.data.items[0].title, '釉下彩茶杯');
    assert.equal(page.data.items[0].cover_url, 'https://example.com/cup.jpg');
    assert.equal(page.data.items[0].time, '10-16 09:20');
  }
});

test('real product, product_knowledge and favorite snapshot list shapes project readable fields', () => {
  const model = require('../miniprogram/pages/list/model');
  const entries = model.items({ items: [
    { id: 'knowledge-id', product_name: '知识中的茶杯', description: '商品知识说明', image_url: 'https://example.com/k.jpg', created_at: '2026-10-16T01:20:00Z' },
    { id: 'product-id', name: '已识别杯子', story: '商品完整故事', image_url: 'https://example.com/p.jpg', updated_at: '2026-10-16T10:20:00+08:00' },
    { id: 'favorite-id', kind: 'favorite', source_type: 'official', source_id: 'official-id', snapshot: { name: '收藏快照名称', summary: '收藏快照摘要', cover_url: 'https://example.com/f.jpg' }, created_at: '2026-10-16T11:20:00+08:00' }
  ] });
  assert.equal(entries[0].body, '商品知识说明');
  assert.equal(entries[1].body, '商品完整故事');
  assert.equal(entries[2].title, '收藏快照名称');
  assert.equal(entries[2].body, '收藏快照摘要');
  assert.equal(entries[2].cover_url, 'https://example.com/f.jpg');
  assert.equal(entries[2].time, '10-16 11:20');
  assert.doesNotMatch(JSON.stringify(entries), /T01:20:00|T10:20:00|T11:20:00/);
});

test('real recognition products and product-backed favorite sources carry reliable products ids', async () => {
  const cases = [
    ['history', { id: 'products-history', name: '识物商品' }, 'products-history'],
    ['recognition', { id: 'products-recognition', name: '识物商品' }, 'products-recognition'],
    ['favorites', { favorite: { id: 'favorite-a', source_type: 'recognition', source_id: 'products-a' }, source: { id: 'products-a', name: '源商品' } }, 'products-a'],
    ['my-library', { favorite: { id: 'favorite-b', source_type: 'product', source_id: 'products-b' }, source: { id: 'products-b', name: '源商品' } }, 'products-b']
  ];
  for (const [kind, raw, productId] of cases) {
    const writes = [];
    const page = nativePage('detail', async (action, params) => {
      if (action === 'knowledge-save' || action === 'community-post') { writes.push({ action, params }); return { ok: true }; }
      return { kind, id: 'display-row-id', title: '商品详情', body: '', raw };
    });
    await page.onLoad({ kind, id: 'display-row-id' });
    assert.equal(page.data.canSave, true, kind);
    assert.equal(page.data.canShare, true, kind);
    await page.saveKnowledge();
    await page.shareCommunity();
    assert.equal(writes[0].params.product_id, productId);
    assert.equal(writes[1].params.product_id, productId);
  }
});

test('every favorite source removes by user_favorites row id, never by the original official or product id', async () => {
  for (const sourceType of ['official', 'product', 'recognition']) {
    const writes = [];
    const page = nativePage('detail', async (action, params) => {
      if (action === 'knowledge-favorite') throw new Error('收藏详情禁止使用官方知识 ID 移除收藏');
      if (action === 'favorite-remove') { writes.push(params); return { id: params.id, removed: true }; }
      return { kind: 'favorite', id: 'favorite-row', title: '收藏详情', raw: { favorite: { id: 'favorite-row', source_type: sourceType, source_id: 'source-' + sourceType }, source: { id: 'source-' + sourceType } } };
    });
    await page.onLoad({ kind: 'favorites', id: 'favorite-row' });
    assert.equal(page.data.canFavorite, false);
    assert.equal(page.data.canRemoveFavorite, true);
    await page.toggleFavorite();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'favorite-row');
    assert.equal(page.data.item, null);
    assert.match(page.data.resolvedMessage, /服务器.*移除/);
  }
  const blocked = nativePage('detail', async () => ({ kind: 'knowledge', id: 'product-knowledge-id', title: '商品知识', raw: { id: 'product-knowledge-id' } }));
  await blocked.onLoad({ kind: 'knowledge', id: 'product-knowledge-id' });
  assert.equal(blocked.data.canFavorite, false);
  assert.equal(blocked.data.canSave, false);
  assert.equal(blocked.data.canShare, false);
  const wxml = fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8');
  assert.match(wxml, /wx:if="\{\{canFavorite\}\}"/);
});

test('tasks raw counters without task items are an explicit contract gap, not a successful empty list', async () => {
  const raw = { date: '2026-10-16', pending_exp: 10, claimed_today: [], today_counts: { scans: 2, quiz_attempts: 1, community_posts: 0 } };
  const list = nativePage('list', async () => raw);
  await list.onLoad({ kind: 'tasks' });
  assert.match(list.data.error, /任务.*统计.*条目/);
  assert.equal(list.data.items.length, 0);
  const detail = nativePage('detail', async () => raw);
  await detail.onLoad({ kind: 'tasks', id: 'daily_quiz' });
  assert.match(detail.data.error, /任务.*统计.*条目/);
  assert.equal(detail.data.item, null);
});

test('conversation surfaces explicitly identify BOOMER assistant, never an employee private-message product', async () => {
  const list = nativePage('list', async () => ({ items: [{ id: 'conversation-a', title: '商品问题' }] }));
  await list.onLoad({ kind: 'conversations' });
  assert.match(list.data.title, /BOOMER.*助手/);
  const detail = nativePage('detail', async () => ({ items: [{ id: 'message-a', role: 'assistant', content: '助手回复' }] }));
  await detail.onLoad({ kind: 'conversation', id: 'conversation-a' });
  assert.match(detail.data.item.title, /BOOMER.*助手/);
  assert.match(fs.readFileSync(path.join(root, 'messages/index.wxml'), 'utf8'), /BOOMER 助手会话/);
});

test('growth check-in status renders the real nested history, streak and experience without attendance claims', async () => {
  const calls = [];
  const page = nativePage('list', async (action, params) => {
    calls.push({ action, params });
    return { date: '2026-10-16', timezone: 'Asia/Shanghai', checked_today: false, today: null,
      stats: { current_streak: 2, longest_streak: 5, total_check_ins: 8 },
      history: { items: [{ id: 'check1', check_in_date: '2026-10-15', checked_at: '2026-10-15T01:10:00Z', streak: 2, exp_gained: 10 }], page: 0, page_size: 20, has_more: false }
    };
  });
  await page.onLoad({ kind: 'check-ins' });
  assert.equal(calls[0].action, 'checkin-status');
  assert.equal(page.data.checkin.currentStreak, '2');
  assert.equal(page.data.checkin.checkedToday, false);
  assert.equal(page.data.items[0].time, '10-15 09:10');
  assert.match(page.data.items[0].body, /2.*10/);
  page.openItem(event({ id: 'check1' }));
  assert.equal(page.navigations.length, 0);
  const wxml = fs.readFileSync(path.join(root, 'list/index.wxml'), 'utf8');
  assert.match(wxml, /不是考勤|非考勤/);
  assert.match(wxml, /不用于出勤判断/);
});

test('growth check-in is single-flight and only completes after matching server status readback', async () => {
  let complete = false;
  let finish;
  let writes = 0;
  const record = { id: 'check-today', check_in_date: '2026-10-16', checked_at: '2026-10-16T01:10:00Z', streak: 3, exp_gained: 10 };
  const page = nativePage('list', async (action) => {
    if (action === 'checkin-submit') {
      writes++;
      await new Promise((resolve) => { finish = resolve; });
      complete = true;
      return { already: false, checked_today: true, record, experience: {}, exp_gained: 10, bonus: 0 };
    }
    return { date: '2026-10-16', timezone: 'Asia/Shanghai', checked_today: complete, today: complete ? record : null,
      stats: { current_streak: complete ? 3 : 2, longest_streak: 5, total_check_ins: complete ? 9 : 8 },
      history: { items: complete ? [record] : [], page: 0, page_size: 20, has_more: false }
    };
  });
  await page.onLoad({ kind: 'check-ins' });
  const first = page.submitCheckin();
  const duplicate = page.submitCheckin();
  assert.equal(writes, 1);
  assert.equal(page.data.checkin.checkedToday, false);
  finish();
  await first;
  await duplicate;
  assert.equal(page.data.checkin.checkedToday, true);
  assert.match(page.data.checkinNotice, /云端|服务器/);
  await page.submitCheckin();
  assert.equal(writes, 1);
});

test('check-in write and readback failures never fabricate a growth reward', async () => {
  for (const failWrite of [true, false]) {
    let submitted = false;
    const page = nativePage('list', async (action) => {
      if (action === 'checkin-submit') {
        if (failWrite) throw new Error('签到写入失败');
        submitted = true;
        return { checked_today: true, record: { id: 'server-record' } };
      }
      if (submitted) throw new Error('签到回读失败');
      return { date: '2026-10-16', checked_today: false, today: null, stats: { current_streak: 0, longest_streak: 0, total_check_ins: 0 }, history: { items: [], page: 0, has_more: false } };
    });
    await page.onLoad({ kind: 'check-ins' });
    await page.submitCheckin();
    assert.equal(page.data.checkin.checkedToday, false);
    assert.equal(page.data.checkinNotice, '');
    assert.match(page.data.error, /失败/);
  }
});

test('profile update sends only nickname and adapter-owned avatar path; confirms nickname/avatar readback', async () => {
  let profile = { display_name: '旧昵称', avatar_url: 'https://example.com/old.jpg', real_name: 'ERP真实姓名' };
  const calls = [];
  const page = nativePage('detail', async (action, params) => {
    calls.push({ action, params });
    if (action === 'profile-update') { profile = { ...profile, display_name: params.display_name, avatar_url: 'https://example.com/new.jpg' }; return { profile, real_name_readonly: true }; }
    return { profile, staff: { real_name: 'ERP真实姓名', phone: '13800000000' }, role: { role_code: 'staff' } };
  });
  await page.onLoad({ kind: 'profile' });
  page.platform.chooseImage = (options) => {
    assert.deepEqual(Array.from(options.sourceType), ['album']);
    options.success({ tempFilePaths: ['wxfile://avatar.jpg'] });
  };
  await page.chooseAvatar();
  page.onProfileNameInput({ detail: { value: '新昵称' } });
  await page.saveProfile();
  const write = calls.find((call) => call.action === 'profile-update');
  assert.deepEqual(Object.keys(write.params).sort(), ['avatar_path', 'display_name']);
  assert.equal(write.params.avatar_path, 'wxfile://avatar.jpg');
  assert.equal(page.data.profileNameDraft, '新昵称');
  assert.equal(page.data.avatarPreview, 'https://example.com/new.jpg');
  assert.match(page.data.actionNotice, /确认|核对/);
  assert.equal(calls.at(-1).action, 'profile');
});

test('failed profile writes or mismatched readback retain nickname and selected avatar without success', async () => {
  for (const failure of ['write', 'readback']) {
    const page = nativePage('detail', async (action) => {
      if (action === 'profile-update') {
        if (failure === 'write') throw new Error('资料保存失败');
        return { profile: { display_name: '新昵称', avatar_url: 'https://example.com/new.jpg', real_name: '真实姓名' }, real_name_readonly: true };
      }
      return { profile: { display_name: '旧昵称', avatar_url: 'https://example.com/old.jpg', real_name: '真实姓名' } };
    });
    await page.onLoad({ kind: 'profile' });
    page.platform.chooseImage = (options) => options.success({ tempFilePaths: ['wxfile://pending.jpg'] });
    await page.chooseAvatar();
    page.onProfileNameInput({ detail: { value: '新昵称' } });
    await page.saveProfile();
    assert.equal(page.data.profileNameDraft, '新昵称');
    assert.equal(page.data.avatarPreview, 'wxfile://pending.jpg');
    assert.equal(page.data.actionNotice, '');
    assert.match(page.data.error, /失败|核对|一致/);
  }
});

test('profile nickname validates 1-30 characters before making any write', async () => {
  let writes = 0;
  const page = nativePage('detail', async (action) => {
    if (action === 'profile-update') writes++;
    return { profile: { display_name: '昵称', real_name: '真实姓名' } };
  });
  await page.onLoad({ kind: 'profile' });
  for (const name of ['', '   ', '字'.repeat(31)]) {
    page.onProfileNameInput({ detail: { value: name } });
    await page.saveProfile();
    assert.match(page.data.error, /1.*30/);
  }
  assert.equal(writes, 0);
});

test('mixed personal-library rows preserve authoritative knowledge versus favorite kind in native navigation', async () => {
  const data = { items: [
    { id: 'knowledge-row', kind: 'knowledge', product_name: '手建知识' },
    { id: 'favorite-row', kind: 'favorite', snapshot: { name: '收藏内容' } }
  ] };
  for (const name of ['list', 'learn']) {
    const page = nativePage(name, async () => data);
    await page.onLoad({ kind: 'my-library' });
    if (name === 'learn') await page.onFilter(event({ kind: 'quiz' }));
    page.openItem(event({ id: 'knowledge-row' }));
    page.openItem(event({ id: 'favorite-row' }));
    assert.match(page.navigations[0], /kind=knowledge&id=knowledge-row/);
    assert.match(page.navigations[1], /kind=favorite&id=favorite-row/);
  }
});

test('growth check-in history pagination unwraps real nested history instead of treating status as rows', async () => {
  const calls = [];
  const page = nativePage('list', async (action, params) => {
    calls.push(params);
    return { date: '2026-10-16', checked_today: false, today: null, stats: { current_streak: 1, longest_streak: 3, total_check_ins: 4 }, history: {
      items: [{ id: 'record-' + params.page, check_in_date: '2026-10-15', checked_at: '2026-10-15T01:00:00Z', streak: 1, exp_gained: 0 }], page: params.page, page_size: 20, has_more: params.page === 0
    } };
  });
  await page.onLoad({ kind: 'check-ins' });
  await page.loadMore();
  assert.equal(calls.at(-1).page, 1);
  assert.equal(calls.at(-1).page_size, 20);
  assert.equal(page.data.items.length, 2);
  assert.equal(page.data.hasMore, false);
  assert.match(page.data.items[1].body, /经验 0/);
});

test('profile error retry retries the preserved draft instead of reloading and discarding it', async () => {
  let fail = true;
  let currentName = '旧昵称';
  let writes = 0;
  const page = nativePage('detail', async (action, params) => {
    if (action === 'profile-update') {
      writes++;
      if (fail) throw new Error('保存失败');
      currentName = params.display_name;
      return { profile: { display_name: currentName, real_name: 'ERP姓名' }, real_name_readonly: true };
    }
    return { profile: { display_name: currentName, real_name: 'ERP姓名' } };
  });
  await page.onLoad({ kind: 'profile' });
  page.onProfileNameInput({ detail: { value: '保留的昵称' } });
  await page.saveProfile();
  fail = false;
  await page.retry();
  assert.equal(writes, 2);
  assert.equal(page.data.profileNameDraft, '保留的昵称');
  assert.equal(currentName, '保留的昵称');
});

function roundSixTasks() {
  return { date: '2026-10-16', pending_exp: [{ id: pendingExpId, source: 'growth', amount: 20, title: '学习经验', created_at: '2026-10-16T01:00:00Z' }], claimed_today: [],
    today_counts: { scans: 1, quiz_passed: 0, quiz_attempts: 0, community_posts: 0 },
    items: [
      { id: 'daily_first_scan', task_key: 'daily_first_scan', title: '完成 1 次识别', progress: 1, target: 1, completed: true, claimed: false, amount: 5 },
      { id: 'daily_3_scans', task_key: 'daily_3_scans', title: '完成 3 次识别', progress: 1, target: 3, completed: false, claimed: false, amount: 10 },
      { id: 'daily_quiz', task_key: 'daily_quiz', title: '通过一次知识测试', progress: 0, target: 1, completed: false, claimed: false, amount: 15 },
      { id: 'daily_post', task_key: 'daily_post', title: '发一条BOOMER 圈帖子', progress: 0, target: 1, completed: false, claimed: false, amount: 5 }
    ], pending_items: [{ id: pendingExpId, pending_id: pendingExpId, title: '学习经验', amount: 20, completed: true, claimed: false, source: 'growth', created_at: '2026-10-16T01:00:00Z' }]
  };
}

test('round-six task list includes all four real tasks plus pending experience, amounts and cloud status', async () => {
  const page = nativePage('list', async () => roundSixTasks());
  await page.onLoad({ kind: 'tasks' });
  assert.equal(page.data.items.length, 5);
  assert.equal(page.data.items[0].amount, 5);
  assert.equal(page.data.items[0].completed, true);
  assert.equal(page.data.items[1].completed, false);
  assert.equal(page.data.items[4].pendingId, pendingExpId);
  assert.equal(page.data.items[4].amount, 20);
  assert.equal(page.data.items[4].progress, null, 'pending experience is not fabricated task progress');
  assert.equal(page.data.error, '');
});

test('synthetic individual reward detail cannot submit even through its direct claim handler', async () => {
  let writes = 0;
  const page = nativePage('detail', async action => {
    if (action === 'task-claim') { writes++; return { ok: true, amount: 5 }; }
    return roundSixTasks();
  }, { preview: true });
  await page.onLoad({ kind: 'tasks', id: 'daily_first_scan' });
  page.data.preview = true;
  await page.claimTask();
  assert.equal(writes, 0);
  const source = fs.readFileSync(path.join(root, 'detail/index.wxml'), 'utf8');
  assert.match(source, /bindtap="claimTask" disabled="\{\{[^}]*preview/);
});

test('daily task claim is single-flight and waits for claimed true in server readback', async () => {
  const snapshot = roundSixTasks();
  let finish;
  const writes = [];
  const page = nativePage('detail', async (action, params) => {
    if (action === 'task-claim') {
      writes.push(params);
      await new Promise((resolve) => { finish = resolve; });
      snapshot.items[0].claimed = true;
      return { ok: true, amount: 5 };
    }
    return snapshot;
  });
  await page.onLoad({ kind: 'tasks', id: 'daily_first_scan' });
  const first = page.claimTask();
  const duplicate = page.claimTask();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].task_key, 'daily_first_scan');
  assert.equal(page.data.claimed, false);
  finish();
  await first;
  await duplicate;
  assert.equal(page.data.claimed, true);
  assert.match(page.data.actionNotice, /服务器.*确认/);
  await page.claimTask();
  assert.equal(writes.length, 1);
});

test('pending experience detail matches pending_items and confirms consumption without an invalid detail reload', async () => {
  const snapshot = roundSixTasks();
  const writes = [];
  const page = nativePage('detail', async (action, params) => {
    if (action === 'task-claim') { writes.push(params); snapshot.pending_items = []; return { ok: true, amount: 20 }; }
    return snapshot;
  });
  await page.onLoad({ kind: 'tasks', id: pendingExpId });
  assert.equal(page.data.item && page.data.item.title, '学习经验');
  assert.equal(page.data.completed, true);
  await page.claimTask();
  assert.equal(writes[0].pending_id, pendingExpId);
  assert.equal(writes[0].task_key, undefined);
  assert.equal(page.data.error, '');
  assert.equal(page.data.item, null);
  assert.match(page.data.resolvedMessage, /服务器.*领取/);
});

test('task rejection 409, unconfirmed readback and incomplete task never fabricate claim success', async () => {
  for (const failure of ['409', 'readback', 'incomplete']) {
    const snapshot = roundSixTasks();
    let writes = 0;
    const page = nativePage('detail', async (action) => {
      if (action === 'task-claim') {
        writes++;
        if (failure === '409') throw Object.assign(new Error('claim_rejected: already_claimed'), { status: 409 });
        return { ok: true, amount: 5 };
      }
      return snapshot;
    });
    await page.onLoad({ kind: 'tasks', id: failure === 'incomplete' ? 'daily_3_scans' : 'daily_first_scan' });
    await page.claimTask();
    assert.equal(page.data.claimed, false);
    assert.equal(page.data.actionNotice, '');
    if (failure === 'incomplete') assert.equal(writes, 0);
    else assert.match(page.data.error, /claim_rejected|确认|回读/);
  }
});

test('favorite removal rejection or wrong receipt retains the source and quiz state for retry', async () => {
  for (const failure of ['network', 'receipt']) {
    const page = nativePage('detail', async (action) => {
      if (action === 'favorite-remove') {
        if (failure === 'network') throw new Error('收藏移除失败');
        return { id: 'another-favorite', removed: true };
      }
      return { kind: 'favorite', id: 'favorite-id', title: '收藏', quiz_available: true, quiz_kind: 'favorite', raw: { favorite: { id: 'favorite-id', source_type: 'product', source_id: 'product-id' }, source: { id: 'product-id' } } };
    });
    await page.onLoad({ kind: 'favorites', id: 'favorite-id' });
    await page.removeFavorite();
    assert.equal(page.data.item.title, '收藏');
    assert.match(page.data.quizUrl, /favorite-id/);
    assert.equal(page.data.resolvedMessage, '');
    assert.match(page.data.error, /失败|确认/);
  }
});

test('orphaned favorites can be removed by their own row id without offering a quiz', async () => {
  let writes = 0;
  const page = nativePage('detail', async (action, params) => {
    if (action === 'favorite-remove') { writes++; return { id: params.id, removed: true }; }
    return { kind: 'favorite', id: 'orphan-id', title: '历史快照', quiz_available: false, quiz_kind: null, raw: { favorite: { id: 'orphan-id', source_type: 'official', source_id: 'gone-source' }, source: null, source_available: false, is_favorite: true, favorite_id: 'orphan-id' } };
  });
  await page.onLoad({ kind: 'favorites', id: 'orphan-id' });
  assert.equal(page.data.quizUrl, '');
  assert.equal(page.data.canRemoveFavorite, true);
  await page.removeFavorite();
  assert.equal(writes, 1);
  assert.equal(page.data.item, null);
});

test('pending claim cannot confuse a missing pending_items field with confirmed consumption', async () => {
  let submitted = false;
  const page = nativePage('detail', async (action) => {
    if (action === 'task-claim') { submitted = true; return { ok: true, amount: 20 }; }
    const snapshot = roundSixTasks();
    if (submitted) delete snapshot.pending_items;
    return snapshot;
  });
  await page.onLoad({ kind: 'tasks', id: pendingExpId });
  await page.claimTask();
  assert.equal(page.data.item.title, '学习经验');
  assert.equal(page.data.claimed, false);
  assert.equal(page.data.resolvedMessage, '');
  assert.match(page.data.error, /回读|确认/);
});

test('workbench HQ picker uses only verified shops and clears previous shop data before reloading', async () => {
  const shops = [{ id: 'shop-a', name: '门店 A' }, { id: 'shop-b', name: '门店 B' }];
  let current = { ...employee, shop: shops[0], shops, isHeadquarters: true };
  let revision = 0;
  let finish;
  const selected = [];
  const page = nativePage('workbench', undefined, {
    session: { get: () => current, revision: () => revision, selectShop(id) { selected.push(id); current = { ...current, shop: shops.find((shop) => shop.id === id) }; revision++; } },
    api: {
      action: async (action) => action === 'tasks' ? ({ items: [{ id: current.shop.id === 'shop-a' ? 'a-task' : 'b-task', title: current.shop.id === 'shop-a' ? 'A 待办' : 'B 待办' }], pending_items: [] }) : current.shop.id === 'shop-b' ? new Promise((resolve) => { finish = resolve; }) : ({ shift: { title: 'A 班次' }, tasks: [{ id: 'a-task', title: 'A 待办' }] }),
      sales: async () => ({ revenue: current.shop.id === 'shop-a' ? 100 : 200, as_of: '2026-10-16T02:00:00Z' })
    }
  });
  await page.onLoad({});
  assert.equal(page.data.isHeadquarters, true);
  assert.deepEqual(Array.from(page.data.shops, (shop) => shop.id), ['shop-a', 'shop-b']);
  assert.equal(page.data.salesValue, '¥100.00');
  const switching = page.onShopChange({ detail: { value: 1 } });
  assert.equal(selected[0], 'shop-b');
  assert.equal(page.data.shopName, '门店 B');
  assert.equal(page.data.salesValue, '暂无数据');
  assert.equal(page.data.salesFreshness, '');
  assert.equal(page.data.agenda.length, 0);
  assert.equal(page.data.shift, null);
  finish({ shift: { title: 'B 班次' }, tasks: [{ id: 'b-task', title: 'B 待办' }] });
  await switching;
  assert.equal(page.data.shopIndex, 1);
  assert.equal(page.data.salesValue, '¥200.00');
  assert.equal(page.data.agenda[0].title, 'B 待办');
  assert.match(fs.readFileSync(path.join(root, 'workbench/index.wxml'), 'utf8'), /<picker[^>]*wx:if="\{\{isHeadquarters && shops.length\}\}"/);
});

test('workbench employees cannot switch stores even with a forged picker event and cached options', async () => {
  let selections = 0;
  const page = nativePage('workbench', undefined, {
    session: { get: () => ({ ...employee, isHeadquarters: false, shops: [{ id: 'shop-b', name: 'B' }] }), selectShop() { selections++; } }
  });
  await page.onLoad({});
  assert.equal(page.data.isHeadquarters, false);
  assert.equal(page.data.shops.length, 0);
  page.setData({ shops: [{ id: 'shop-b', name: 'B' }] });
  await page.onShopChange({ detail: { value: 0 } });
  assert.equal(selections, 0);
  assert.equal(page.data.shopName, employee.shop.name);
  assert.match(page.data.error, /不可|授权/);
});

test('failed HQ store selection keeps the verified current store and does not load a fake new scope', async () => {
  let loads = 0;
  const shops = [{ id: 'shop-a', name: 'A' }, { id: 'shop-b', name: 'B' }];
  const page = nativePage('workbench', undefined, {
    session: { get: () => ({ ...employee, shops, shop: shops[0], isHeadquarters: true }), selectShop() { throw new Error('授权门店已变化，请刷新权限'); } },
    api: { action: async (action) => { if (action === 'dashboard') loads++; return action === 'tasks' ? { items: [{ id: 'old', title: 'A 待办' }], pending_items: [] } : { tasks: [{ id: 'old', title: 'A 待办' }] }; }, sales: async () => ({ revenue: 100 }) }
  });
  await page.onLoad({});
  await page.onShopChange({ detail: { value: 1 } });
  assert.equal(loads, 1);
  assert.equal(page.data.shopName, 'A');
  assert.equal(page.data.shopIndex, 0);
  assert.equal(page.data.salesValue, '¥100.00');
  assert.equal(page.data.agenda[0].id, 'old');
  assert.match(page.data.error, /授权门店已变化/);
});

test('HQ empty or reduced allowlists cannot gain options from the previous current store or cached picker', async () => {
  for (const empty of [true, false]) {
    let selections = 0;
    let current = { ...employee, shop: empty ? null : employee.shop, isHeadquarters: true, shops: empty ? [] : [{ id: 'shop-a', name: 'A' }, { id: 'shop-b', name: 'B' }] };
    const page = nativePage('workbench', undefined, { session: { get: () => current, selectShop() { selections++; } } });
    await page.onLoad({});
    if (empty) assert.equal(page.data.shops.length, 0);
    else current = { ...current, shops: [{ id: 'shop-a', name: 'A' }] };
    await page.onShopChange({ detail: { value: empty ? 0 : 1 } });
    assert.equal(selections, 0);
    assert.match(page.data.error, /不可|授权/);
  }
});

test('late workbench sales from the previous store cannot overwrite a successful HQ switch', async () => {
  const shops = [{ id: 'shop-a', name: 'A' }, { id: 'shop-b', name: 'B' }];
  let current = { ...employee, shop: shops[0], shops, isHeadquarters: true };
  let finishSales;
  const page = nativePage('workbench', undefined, {
    session: { get: () => current, selectShop(id) { current = { ...current, shop: shops.find((shop) => shop.id === id) }; } },
    api: { action: async (action) => action === 'tasks' ? ({ items: [{ id: current.shop.id, title: current.shop.name }], pending_items: [] }) : ({ tasks: [{ id: current.shop.id, title: current.shop.name }] }), sales: () => current.shop.id === 'shop-a' ? new Promise((resolve) => { finishSales = resolve; }) : Promise.resolve({ revenue: 200 }) }
  });
  const original = page.onLoad({});
  await new Promise((resolve) => setImmediate(resolve));
  await page.onShopChange({ detail: { value: 1 } });
  finishSales({ revenue: 9999 });
  await original;
  assert.equal(page.data.shopName, 'B');
  assert.equal(page.data.salesValue, '¥200.00');
  assert.equal(page.data.agenda[0].id, 'shop-b');
});

test('session revision discards old success and failure after the same employee logs out and back in', async () => {
  for (const fails of [false, true]) {
    let revision = 1;
    let finish;
    const page = nativePage('learn', () => new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('旧会话失败')) : resolve({ items: [{ id: 'old-session', title: '旧会话内容' }] }); }), {
      session: { get: () => employee, revision: () => revision }
    });
    const pending = page.onLoad({});
    revision = 3;
    finish();
    await pending;
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.error, '');
  }
});

test('workbench real bootstrap without agenda paints before independent tasks and sales, once per lifecycle', async () => {
  const calls = [];
  let finishTasks;
  let finishSales;
  const page = nativePage('workbench', undefined, {
    api: {
      action: async (action) => {
        calls.push(action);
        if (action === 'dashboard') return { shifts: [], shift_definitions: [], shift: { title: '早班', start_time: '10:00' } };
        assert.equal(action, 'tasks');
        return new Promise((resolve) => { finishTasks = resolve; });
      },
      sales: () => { calls.push('sales'); return new Promise((resolve) => { finishSales = resolve; }); }
    }
  });
  const pending = page.onLoad({});
  page.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.data.shift.title, '早班');
  assert.equal(page.data.loading, false);
  assert.deepEqual(calls.slice().sort(), ['dashboard', 'sales', 'tasks']);
  assert.equal(page.data.agendaLoading, true);
  finishSales({ revenue: 100 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.data.salesValue, '¥100.00', 'sales must not await tasks');
  finishTasks(roundSixTasks());
  await pending;
  assert.equal(page.data.agenda.length, 5);
  assert.equal(page.data.agenda[0].id, 'daily_first_scan');
  assert.equal(page.data.agenda.at(-1).pendingId, pendingExpId);
  assert.equal(page.data.agenda.at(-1).status, '可领取');
  assert.equal(page.data.agenda.at(-1).url, '/pages/detail/index?kind=tasks&id=' + pendingExpId);
  assert.equal(page.data.agendaLoading, false);
});

test('workbench task failure preserves real bootstrap tasks and retry refreshes only agenda without guessing completion', async () => {
  const calls = [];
  let fails = true;
  const seed = { id: 'daily_quiz', title: '云端任务', progress: 1, target: 1, completed: false, claimed: false };
  const page = nativePage('workbench', undefined, {
    api: {
      action: async (action) => {
        calls.push(action);
        if (action === 'dashboard') return { tasks: [seed], learning: [{ id: 'recommendation', title: '推荐文章' }] };
        if (fails) throw new Error('任务接口暂不可用');
        return { date: '2026-10-16', items: [seed, { ...seed, id: 'claimed', completed: true, claimed: true }], pending_items: [] };
      },
      sales: async () => { calls.push('sales'); return { revenue: 200 }; }
    }
  });
  await page.onLoad({});
  assert.match(page.data.agendaError, /任务接口暂不可用/);
  assert.equal(page.data.error, '');
  assert.equal(page.data.salesValue, '¥200.00');
  assert.equal(page.data.agenda.length, 1);
  assert.equal(page.data.agenda[0].completed, false);
  assert.equal(page.data.agenda[0].status, '进行中');
  fails = false;
  await page.loadAgenda();
  assert.equal(page.data.agendaError, '');
  assert.equal(page.data.agenda[0].status, '进行中', 'progress must not override server completion');
  assert.equal(page.data.agenda[1].status, '已领取');
  assert.deepEqual(calls.slice().sort(), ['dashboard', 'sales', 'tasks', 'tasks']);
  fails = true;
  await page.loadAgenda();
  assert.equal(page.data.agenda.length, 2, 'failed refresh preserves last real response');
  const wxml = fs.readFileSync(path.join(root, 'workbench/index.wxml'), 'utf8');
  assert.match(wxml, /\{\{item.status\}\}/, 'category must not hide completion/claim state');
  assert.match(wxml, /bindtap="loadAgenda"/);
});

test('workbench failed real tasks has no synthetic fallback or false completed state', async () => {
  const page = nativePage('workbench', undefined, {
    api: { action: async (action) => {
      if (action === 'dashboard') return { learning: [{ id: 'article', title: '推荐文章' }] };
      return { today_counts: { scans: 999 }, claimed_today: [] };
    }, sales: async () => ({ revenue: null }) }
  });
  await page.onLoad({});
  assert.equal(page.data.agenda.length, 0);
  assert.match(page.data.agendaError, /任务|条目/);
  assert.equal(page.data.error, '');
  assert.equal(page.data.agendaLoading, false);
});

test('workbench late task success and failure cannot overwrite newer requests, stores or session revisions', async () => {
  for (const change of ['request', 'store', 'revision']) {
    for (const fails of [false, true]) {
      let current = employee;
      let revision = 1;
      let finish;
      let taskCalls = 0;
      const page = nativePage('workbench', undefined, {
        session: { get: () => current, revision: () => revision },
        api: {
          action: async (action) => {
            if (action === 'dashboard') return {};
            if (++taskCalls === 1) return new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('旧请求失败')) : resolve({ items: [{ id: 'old', title: '旧任务' }], pending_items: [] }); });
            return { items: [{ id: 'new', title: '新任务', completed: false, claimed: false }], pending_items: [] };
          }, sales: async () => ({})
        }
      });
      const old = page.onLoad({});
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(typeof finish, 'function');
      if (change === 'store') current = { ...employee, shop: { id: 'shop-b', name: 'B' } };
      if (change === 'revision') revision++;
      await page.load();
      finish();
      await old;
      assert.equal(page.data.agenda[0].id, 'new');
      assert.equal(page.data.agendaError, '');
      assert.equal(page.data.agendaLoading, false);
    }
  }
});

test('native list eyebrow does not render an HTML entity literally', () => {
  const markup = require('node:fs').readFileSync(require('node:path').join(__dirname, '../miniprogram/pages/list/index.wxml'), 'utf8');
  assert.doesNotMatch(markup, /WORK &amp; LEARN/);
  assert.match(markup, /WORK · LEARN/);
});

test('workbench superseded bootstrap does not launch extra sales or task requests', async () => {
  let finish;
  let dashboardCalls = 0;
  let tasks = 0;
  let sales = 0;
  const page = nativePage('workbench', undefined, {
    api: {
      action: async (action) => {
        if (action === 'tasks') { tasks++; return { items: [], pending_items: [] }; }
        if (++dashboardCalls === 1) return new Promise((resolve) => { finish = resolve; });
        return { shift: { title: '最新班次' } };
      }, sales: async () => { sales++; return {}; }
    }
  });
  const old = page.onLoad({});
  await page.load();
  finish({ shift: { title: '旧班次' } });
  await old;
  assert.equal(page.data.shift.title, '最新班次');
  assert.equal(tasks, 1);
  assert.equal(sales, 1);
});

test('workbench agenda auth expiry reaches the shared session handler instead of a local task error', async () => {
  const expired = Object.assign(new Error('登录已过期'), { status: 401 });
  const page = nativePage('workbench', undefined, {
    api: { action: async (action) => { if (action === 'tasks') throw expired; return {}; }, sales: async () => ({}) }
  });
  const run = page.run;
  let handled = false;
  page.run = async function (work, options) {
    if (options && options.silent) {
      await assert.rejects(work, (error) => error === expired);
      handled = true;
      return null;
    }
    return run.call(this, work, options);
  };
  await page.onLoad({});
  assert.equal(handled, true);
  assert.equal(page.data.agendaError, '');
});
