const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const failure = message => Object.assign(new Error(message), { code: 'practice_state_invalid' });

function createDailyPractice({ wx, session, preview = false, now = Date.now }) {
  let guard = null, library = null, queue = [], index = 0, attempted = new Set(), progressError = '';
  function clear() { guard = null; library = null; queue = []; index = 0; attempted = new Set(); progressError = ''; }
  function sync() {
    const user = session.get();
    const date = new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
    if (!user || typeof user.userId !== 'string' || !user.userId || !user.shop || typeof user.shop.id !== 'string' || !user.shop.id) { clear(); return null; }
    const value = JSON.stringify([user.userId, user.shop.id, user.scopeVersion, session.revision ? session.revision() : null, date]);
    const key = 'go-mini.practice.v1:' + user.userId + ':' + user.shop.id + ':' + date;
    if (guard !== value) {
      clear(); guard = value;
      if (!preview) {
        try {
          const saved = wx.getStorageSync(key);
          if (saved !== undefined && saved !== null && saved !== '') {
            if (!saved || saved.version !== 1 || saved.date !== date || !Array.isArray(saved.attempted) || saved.attempted.length > 5000 || saved.attempted.some(id => typeof id !== 'string' || !UUID.test(id))) throw failure('本机记录格式异常');
            attempted = new Set(saved.attempted);
          }
        } catch (_) { progressError = '本机练习记录未能读取，本次仅保留可确认的内存进度。正式成绩以服务器为准。'; }
      }
    }
    return { value, key, date, userId: user.userId };
  }
  function checked(expected) {
    const context = sync();
    if (!context || (expected !== undefined && expected !== context.value)) throw failure('员工、门店或日期已变化，请重新打开连续练习');
    return context;
  }
  function stamp() { return checked().value; }
  function recommendations() {
    if (!library) return [];
    return library.items.filter(item => !item.passed && item.available)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, 5).filter(item => !attempted.has(item.id)).map(item => ({ id: item.id, title: item.title, state: 'ready' }));
  }
  function view() {
    const context = sync(), current = queue[index];
    return { date: context ? context.date : '', ready: !!context && !!library, libraryCount: library ? library.items.length : 0,
      hasOlder: library ? library.hasOlder : false, asOf: library ? library.asOf : '', attemptedCount: attempted.size,
      recommendations: recommendations(), current: current ? Object.assign({}, current) : null, queue: queue.map(item => Object.assign({}, item)),
      index, active: queue.length > 0, finished: queue.length > 0 && index >= queue.length,
      completedCount: queue.filter(item => item.state === 'completed').length, skippedCount: queue.filter(item => item.state === 'skipped').length,
      progressError, preview };
  }
  function setLibrary(dto, expected) {
    if (typeof expected !== 'string') throw failure('缺少读取前的员工与日期依据，请重新加载');
    const context = checked(expected);
    if (!dto || dto.window_limit !== 300 || typeof dto.has_older !== 'boolean' || !iso(dto.as_of) || !Array.isArray(dto.items) || dto.items.length > 300) throw failure('连续练习接口未确认最新300条范围，请重试');
    const ids = new Set();
    const items = dto.items.map(row => {
      if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || ids.has(row.id) || !iso(row.created_at) || typeof row.passed !== 'boolean' || row.quiz_kind !== 'favorite' || typeof row.quiz_available !== 'boolean' || (row.user_id != null && row.user_id !== context.userId)) throw failure('收藏来源、身份或掌握状态不完整，请重新读取');
      ids.add(row.id);
      const title = row.snapshot && typeof row.snapshot.name === 'string' && row.snapshot.name.trim() ? row.snapshot.name.trim() : '收藏知识';
      return { id: row.id, title, createdAt: row.created_at, passed: row.passed, available: row.quiz_available && ['official', 'recognition', 'product'].includes(row.source_type) };
    });
    library = { items, hasOlder: dto.has_older, asOf: dto.as_of };
    return view();
  }
  function start() {
    checked();
    if (!library) throw failure('请先读取连续练习推荐');
    if (queue.length && index < queue.length) return view();
    const next = recommendations();
    if (next.length) { queue = next; index = 0; }
    return view();
  }
  function matches(id) { const context = sync(), current = queue[index]; return !!context && !!current && current.id === id && current.state === 'ready'; }
  function recordAttempt(id, receipt, expected) {
    if (typeof expected !== 'string') throw failure('缺少交卷前的员工与日期依据，不能计入已练');
    const context = checked(expected);
    if (typeof id !== 'string' || !UUID.test(id) || !receipt || receipt.kind !== 'favorite' || receipt.id !== id || receipt.persisted !== !preview || typeof receipt.passed !== 'boolean'
      || !Number.isInteger(receipt.total) || receipt.total < 1 || receipt.total > 20 || !Number.isInteger(receipt.score) || receipt.score < 0 || receipt.score > receipt.total
      || !Array.isArray(receipt.submitted) || receipt.submitted.length !== receipt.total || receipt.submitted.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 3)) throw failure('服务器尚未确认该收藏的完整作答与保存，不能计入已练');
    const existing = queue.find(item => item.id === id);
    if (existing) existing.state = 'completed';
    if (!attempted.has(id)) {
      attempted.add(id);
      if (!preview) {
        try { wx.setStorageSync(context.key, { version: 1, date: context.date, attempted: Array.from(attempted) }); }
        catch (_) { progressError = '本机练习进度未能保存，当前仅在内存保留；正式成绩已由服务器确认。'; }
      }
    }
    return view();
  }
  function advance(id, skip) {
    checked();
    const current = queue[index];
    if (!current || current.id !== id || current.state !== (skip ? 'ready' : 'completed')) throw failure('当前条目尚未确认完成，不能推进其他知识');
    if (skip) current.state = 'skipped';
    index++;
    return view();
  }
  function exit() { queue = []; index = 0; return view(); }
  return { stamp, setLibrary, view, start, matches, recordAttempt, next: id => advance(id, false), skip: id => advance(id, true), exit, clear };
}

module.exports = { createDailyPractice };
