const FIELDS = ['id','title','body','type','active','expires_at','created_by','created_at','image_url','category','summary'];
const EDITABLE = ['title','body','active','expires_at'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && UUID.test(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const invalid = () => Object.assign(Error('通知来源、字段或长度未能核对，原稿未改动'), { status: 400, code: 'notification_manage_invalid' });
function check(value) { if (!value) throw invalid(); }
function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(k => freeze(value[k])); Object.freeze(value); } return value; }
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}
function expiry(date) { if (date === '') return null; check(validDate(date)); return date + 'T15:59:59.000Z'; }
function timestamp(value) {
  check(typeof value === 'string');
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.exec(value);
  check(match && validDate(match[1]));
  const seconds = Date.parse(match[1] + 'T' + match[2] + match[4]); check(Number.isFinite(seconds));
  // Compare UTC seconds plus the original six-digit fraction, never Date's truncated milliseconds.
  return new Date(seconds).toISOString().slice(0, -5) + '.' + (match[3] || '').padEnd(6, '0') + 'Z';
}
function row(value) {
  check(record(value) && FIELDS.every(k => own(value, k)));
  check(uuid(value.id) && typeof value.title === 'string' && typeof value.body === 'string' && typeof value.type === 'string' && typeof value.active === 'boolean');
  check(value.created_by === null || uuid(value.created_by)); timestamp(value.created_at);
  if (value.expires_at !== null) timestamp(value.expires_at);
  for (const field of ['image_url','category','summary']) check(value[field] === null || typeof value[field] === 'string');
  const out = {}; FIELDS.forEach(k => { out[k] = value[k]; }); return out;
}
function contextValue(context) { check(record(context) && uuid(context.userId)); return context.userId; }
function changedValue(key, value) {
  if (key === 'active') { check(typeof value === 'boolean'); return value; }
  if (key === 'expires_at') { check(value === null || typeof value === 'string' && value === expiry(value.slice(0, 10))); return value; }
  check(typeof value === 'string'); const text = value.trim();
  check(key === 'title' ? !!text && text.length <= 60 : text.length <= 500); return text;
}
function creationPayload(context, draft) {
  const userId = contextValue(context); check(record(draft) && Object.keys(draft).every(k => EDITABLE.includes(k)));
  return { title: changedValue('title', draft.title), body: changedValue('body', own(draft, 'body') ? draft.body : ''),
    active: changedValue('active', own(draft, 'active') ? draft.active : true), expires_at: changedValue('expires_at', own(draft, 'expires_at') ? draft.expires_at : null), type: 'announcement', created_by: userId };
}
function patchValue(base, patch) {
  check(record(patch) && Object.keys(patch).every(k => EDITABLE.includes(k)));
  const payload = {};
  for (const k of Object.keys(patch)) {
    if (patch[k] === base[k]) continue;
    const value = changedValue(k, patch[k]); if (value !== base[k]) payload[k] = value;
  }
  check(Object.keys(payload).length); return payload;
}
function create(context, draft) {
  const payload = creationPayload(context, draft);
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); });
  return freeze({ operation: 'create', id, userId: context.userId, base: null, payload });
}
function update(context, base, patch) { const userId = contextValue(context), snapshot = row(base); return freeze({ operation: 'update', id: snapshot.id, userId, base: snapshot, payload: patchValue(snapshot, patch) }); }
function remove(context, base) { const userId = contextValue(context), snapshot = row(base); return freeze({ operation: 'delete', id: snapshot.id, userId, base: snapshot, payload: {} }); }
function sameValue(key, a, b) { return a === b || ['created_at','expires_at'].includes(key) && a !== null && b !== null && timestamp(a) === timestamp(b); }
function validateIntent(intent) {
  contextValue(intent);
  check(record(intent) && Object.keys(intent).length === 5 && Object.keys(intent).every(k => ['operation','id','userId','base','payload'].includes(k)) && uuid(intent.id));
  check(record(intent.payload) && ['create','update','delete'].includes(intent.operation));
  if (intent.operation === 'create') {
    check(intent.base === null && Object.keys(intent.payload).length === 6 && Object.keys(intent.payload).every(k => EDITABLE.concat(['type','created_by']).includes(k)));
    const draft = {}; EDITABLE.forEach(k => { draft[k] = intent.payload[k]; });
    const expected = creationPayload(intent, draft);
    check(Object.keys(expected).every(k => expected[k] === intent.payload[k])); return;
  }
  const base = row(intent.base); check(Object.keys(intent.base).length === FIELDS.length && base.id === intent.id);
  if (intent.operation === 'delete') check(Object.keys(intent.payload).length === 0);
  else {
    const payload = patchValue(base, intent.payload);
    check(Object.keys(payload).length === Object.keys(intent.payload).length && Object.keys(payload).every(k => payload[k] === intent.payload[k]));
  }
}
function match(intent, value) {
  try {
    validateIntent(intent); const actual = row(value); if (actual.id !== intent.id) return false;
    const expected = intent.operation === 'create' ? { id: intent.id, ...intent.payload, image_url: null, category: null, summary: null }
      : { ...intent.base, ...intent.payload };
    return Object.keys(expected).every(k => sameValue(k, expected[k], actual[k]));
  } catch (_) { return false; }
}
function key(context, id) { const userId = contextValue(context); check(id == null || id === '' || uuid(id)); return JSON.stringify([userId, id || 'create']); }
module.exports = { create, update, remove, match, row, expiry, key, validateIntent, FIELDS };
