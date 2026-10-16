const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function object(value) { return value !== null && Object.prototype.toString.call(value) === '[object Object]'; }
function text(value, max) {
  if (typeof value !== 'string' || value.indexOf('\0') >= 0) fail('invalid_params', '问题或对话文字不合法，原文未截断');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail('invalid_params', '文字编码不合法，原文未截断'); }
    else if (code >= 0xdc00 && code <= 0xdfff) fail('invalid_params', '文字编码不合法，原文未截断');
  }
  const out = value.trim();
  if (!out || max != null && Array.from(out).length > max) fail('invalid_params', '问题最多 2000 个字，不能为空；原文未截断');
  return out;
}
function pairsOf(pairs) {
  if (!Array.isArray(pairs)) fail('invalid_params', '本页对话记录不完整，请开启新对话');
  return pairs.map(pair => {
    if (!object(pair) || Object.keys(pair).length !== 2 || !Object.prototype.hasOwnProperty.call(pair, 'question') || !Object.prototype.hasOwnProperty.call(pair, 'answer')) fail('invalid_params', '本页对话记录不完整，请开启新对话');
    return { question: text(pair.question), answer: text(pair.answer) };
  });
}
function buildContext(pairs, question) {
  const history = pairsOf(pairs), q = text(question, 2000), selected = [];
  let total = Array.from(q).length, reason = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const pair = history[i], a = Array.from(pair.question).length, b = Array.from(pair.answer).length;
    if (selected.length === 5) { reason = 'pair_limit'; break; }
    if (a > 2000 || b > 2000) { reason = 'message_limit'; break; }
    if (total + a + b > 10000) { reason = 'total_limit'; break; }
    selected.unshift(pair); total += a + b;
  }
  const messages = [];
  selected.forEach(pair => { messages.push(Object.freeze({ role: 'user', content: pair.question }), Object.freeze({ role: 'assistant', content: pair.answer })); });
  messages.push(Object.freeze({ role: 'user', content: q }));
  const omittedPairs = history.length - selected.length;
  let confirmation = null;
  if (omittedPairs) confirmation = !selected.length && Array.from(history[history.length - 1].answer).length > 2000
    ? '最近一条回答超过 2000 字，本次仅携带当前问题和本条知识，已显示记录仍保留。继续提问？'
    : '本次仅携带最近 ' + selected.length + ' 轮完整对话，已显示记录仍保留。继续提问？';
  return Object.freeze({ messages: Object.freeze(messages), includedPairs: selected.length, omittedPairs, reason, confirmation });
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10);
}
function parseReply(data, id, version) {
  if (!object(data) || Object.keys(data).length !== 4 || data.knowledge_id !== id.toLowerCase() || !UUID.test(data.knowledge_id) || data.knowledge_id !== data.knowledge_id.toLowerCase() || data.persisted !== false) fail('invalid_response', '回答绑定或临时会话回执未通过核对');
  if (!timestamp(version) || !timestamp(data.source_updated_at) || data.source_updated_at !== version) fail('knowledge_chat_version_changed', '知识版本已变化，请重新读取文章后再提问');
  try { return text(data.reply, 4000); } catch (_) { fail('invalid_response', '回答文字未通过核对，问题已保留'); }
}
function appendConfirmed(pairs, question, answer) { return pairsOf(pairs).concat({ question: text(question, 2000), answer: text(answer, 4000) }); }
function historyView(pairs, visibleMessages = 20) {
  const history = pairsOf(pairs), all = [];
  history.forEach((pair, i) => { all.push({ id: String(i) + '-user', role: 'user', content: pair.question }, { id: String(i) + '-assistant', role: 'assistant', content: pair.answer }); });
  const count = Math.max(20, Number.isInteger(visibleMessages) ? visibleMessages : 20), messages = all.slice(-count);
  return { messages, hasEarlier: messages.length < all.length, shownCount: messages.length, totalCount: all.length };
}
const ERRORS = {
  ai_budget_exhausted: 'AI 额度暂不可用，问题与本页对话已保留。', ai_rate_limited: '提问过于频繁，请稍后再明确提问。', ai_timeout: '等待回答超时，结果未确认；不会自动重发。',
  ai_unavailable: 'AI 服务暂不可用，问题与本页对话已保留。', ai_invalid_response: 'AI 回答格式未通过核对，问题已保留。',
  knowledge_chat_scope_changed: '员工授权或知识访问状态已变化，请重新读取文章后再提问。', knowledge_chat_version_changed: '知识版本已变化，请重新读取文章后再提问。',
  not_found: '本条知识当前不可读取，请重新读取文章核对。', db_unavailable: '知识读取暂不可用，问题已保留。', scope_unavailable: '员工授权暂无法核验，请重新读取文章核对。',
  account_suspended: '当前员工账号无法提问，请核对授权。', erp_scope_not_ready: '员工授权尚未就绪，请重新读取文章核对。', invalid_response: '回答未通过来源核对，问题与已确认对话保留。', invalid_params: '问题最多 2000 个字，不能为空且须为有效文字；原文未截断。'
};
function errorText(error) { return error && Object.prototype.hasOwnProperty.call(ERRORS, error.code) ? ERRORS[error.code] : '本次回答未确认，问题与已确认对话保留；不会自动重发。'; }
const fields = { qaVisible: false, qaOpen: false, qaDraft: '', qaMessages: [], qaHasEarlier: false, qaShownCount: 0, qaTotalCount: 0, qaBusy: false, qaModal: false, qaCanSend: false, qaError: '', qaUnavailable: '', qaNotice: '仅本页临时对话，离开页面后不保存；AI 回答仅供参考。' };
function create(page, { scope, wx }) {
  let state = null, binding = null, reading = null, epoch = 0, edit = 0, flight = null, modal = null;
  const identity = () => scope();
  function paint(patch) { if (page._gone) Object.assign(page.data, patch); else page.setData(patch); }
  function current() { return !page._gone && !page._hidden && !!state && !!binding && !!binding.identity && binding.identity === identity() && binding.id === page.data.id.toLowerCase() && page.data.kind === 'official' && binding.request === page._request && page._loadedIdentity === binding.identity; }
  function allowed() { return current() && !!binding.version && !state.blocked && !page.preview && !page.data.preview; }
  function writable() { return allowed() && !page.data.loading && !page.data.error; }
  function render() {
    if (!current()) return;
    const view = historyView(state.pairs, state.shown), preview = page.preview || page.data.preview;
    paint({ qaVisible: true, qaOpen: state.open, qaDraft: state.question, qaMessages: state.open ? view.messages : [], qaHasEarlier: state.open && view.hasEarlier, qaShownCount: state.open ? view.shownCount : 0, qaTotalCount: view.totalCount, qaBusy: !!flight, qaModal: !!modal,
      qaCanSend: allowed() && state.open && !flight && !modal && !!state.question.trim(), qaError: state.error, qaUnavailable: preview ? '开发预览只展示界面，不调用 AI，也不生成示例回答。' : !binding.version ? '服务器未提供可核对的知识版本，当前不能提问；文章仍可阅读。' : state.blocked ? '请先重新读取文章并核对授权与版本，再明确提问。' : '' });
  }
  function clearChanged() {
    if (state && (state.identity !== identity() || state.id !== String(page.data.id).toLowerCase() || page.data.kind !== 'official')) { state = null; binding = null; modal = null; epoch++; paint(Object.assign({}, fields)); }
  }
  function context() { return { state, binding, epoch, edit }; }
  function active(c) { return current() && c.state === state && c.binding === binding && c.epoch === epoch; }
  function confirmed(c, generating = true) { return active(c) && c.edit === edit && state.open && !flight && !page.preview && !page.data.preview && !page.data.loading && !page.data.error && (!generating || writable()); }
  function loadStart() {
    if (flight && state === flight.state) state.uncertain = true;
    clearChanged(); epoch++; modal = null; binding = null;
    reading = { identity: identity(), id: String(page.data.id).toLowerCase() };
    paint(Object.assign({}, fields));
  }
  function mount(item) {
    if (page._gone || page._hidden || page.data.kind !== 'official' || !reading || reading.identity !== identity() || reading.id !== String(page.data.id).toLowerCase()) return;
    if (!item || item.kind !== 'official' || typeof item.id !== 'string' || !UUID.test(item.id) || item.id.toLowerCase() !== reading.id) return;
    const raw = object(item.raw) ? item.raw : {}, version = timestamp(raw.updated_at) ? raw.updated_at : null;
    if (!state || state.identity !== reading.identity || state.id !== reading.id || state.version !== version) state = { identity: reading.identity, id: reading.id, version, pairs: [], question: '', open: false, shown: 20, error: '', uncertain: false, blocked: false };
    else state.blocked = false;
    binding = { identity: reading.identity, id: reading.id, version, request: page._request }; reading = null; render();
  }
  function hide() {
    if (flight && state === flight.state) state.uncertain = true;
    clearChanged(); epoch++; binding = null; reading = null; modal = null; paint(Object.assign({}, fields));
  }
  function unload() { state = null; binding = null; reading = null; modal = null; epoch++; paint(Object.assign({}, fields)); }
  function toggle() { clearChanged(); if (!current()) return; state.open = !state.open; modal = null; render(); }
  function input(value) { clearChanged(); if (!current() || !state.open || flight || typeof value !== 'string') return; state.question = value; state.error = ''; edit++; render(); }
  function earlier() { clearChanged(); if (!current() || !state.open) return; state.shown += 20; render(); }
  function confirm(c, title, content, apply, generating = true) {
    const token = { context: c }; modal = token; render();
    wx.showModal({ title, content, confirmText: '确认', confirmColor: '#EB0029', success(result) {
      if (modal !== token) return; modal = null;
      if (!confirmed(c, generating)) { clearChanged(); if (current()) render(); return; }
      render(); if (result.confirm) return apply();
    }, fail() { if (modal === token) { modal = null; if (active(c)) render(); } } });
  }
  async function perform(c, plan) {
    if (!confirmed(c) || modal) return;
    const token = Object.assign({}, c, { plan }); flight = token; state.error = ''; render();
    try {
      const data = await page.api.action('official-knowledge-chat', { knowledge_id: c.binding.id, messages: plan.messages });
      if (!active(c)) { clearChanged(); return; }
      const answer = parseReply(data, c.binding.id, c.binding.version);
      state.pairs = appendConfirmed(state.pairs, plan.messages[plan.messages.length - 1].content, answer); state.question = ''; state.error = ''; state.uncertain = false; state.shown = 20; edit++;
    } catch (error) {
      if (!active(c)) { clearChanged(); return; }
      state.uncertain = true; state.error = errorText(error);
      if (error.code === 'knowledge_chat_version_changed' || error.status === 403 || error.status === 404) state.blocked = true;
      if (error.status === 401) {
        state = null; binding = null; epoch++; paint(Object.assign({}, fields));
        const safe = new Error('员工登录已失效，请重新登录'); safe.status = 401; safe.code = error.code; safe.requestRevision = error.requestRevision;
        await page.run(async () => { throw safe; }, { silent: true });
      }
    } finally { if (flight === token) flight = null; if (current()) render(); }
  }
  function send() {
    clearChanged(); if (!writable() || !state.open || flight || modal) return;
    let plan; try { plan = buildContext(state.pairs, state.question); } catch (error) { state.error = errorText(error); render(); return; }
    const c = context(), notice = [plan.confirmation, state.uncertain ? '上次未收到可核对的回答，再次发送可能再次消耗 AI 额度；不会自动重试。是否明确再次提问？' : null].filter(Boolean).join('\n');
    if (notice) return confirm(c, '确认本次提问', notice, () => perform(c, plan));
    return perform(c, plan);
  }
  function newConversation() {
    clearChanged(); if (!current() || !state.open || flight || modal || page.preview || page.data.preview || !state.pairs.length && !state.question) return;
    const c = context();
    return confirm(c, '开始新对话', '将清除本页全部已确认对话及问题草稿；不会取消或重发任何请求。', () => { state.pairs = []; state.question = ''; state.shown = 20; state.error = ''; state.uncertain = false; edit++; render(); }, false);
  }
  return { loadStart, mount, hide, unload, toggle, input, earlier, send, newConversation };
}
module.exports = { fields, create, buildContext, parseReply, appendConfirmed, historyView, errorText };
