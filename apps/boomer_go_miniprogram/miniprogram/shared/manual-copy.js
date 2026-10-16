const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && UUID.test(value);
function invalid() { return Object.assign(new Error('手工文案来源、字段或长度未能核对，请检查后重试'), { code: 'manual_copy_invalid', status: 400 }); }
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(key => freeze(value[key])); Object.freeze(value); } return value; }
function contextValid(context) { if (!record(context) || !uuid(context.userId) || !uuid(context.shopId)) throw invalid(); }
function draftValue(draft) {
  if (!record(draft) || Object.keys(draft).some(key => !['title', 'body'].includes(key)) || typeof draft.title !== 'string' || typeof draft.body !== 'string') throw invalid();
  const title = draft.title.trim(), body = draft.body.trim();
  if (title.length > 60 || !body || body.length > 1000) throw invalid();
  return { title, body };
}
function ownedRow(context, row) {
  contextValid(context);
  if (!record(row) || !uuid(row.id) || row.user_id !== context.userId || row.shop_id !== context.shopId || row.kind !== 'copy'
    || !record(row.meta) || row.meta.source !== 'manual_upload' || row.meta.asset_class !== 'upload' || !(row.output_text === null || typeof row.output_text === 'string')) throw invalid();
  return row;
}
function arrayCandidates(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { /* Ordinary text is the legacy manual-upload format. */ }
  if (Array.isArray(parsed)) {
    if (!parsed.length || parsed.some(item => !record(item) || typeof item.body !== 'string' || (item.title != null && typeof item.title !== 'string'))) throw invalid();
    return clone(parsed);
  }
  if (record(parsed)) throw invalid();
  return null;
}
function candidates(row) {
  if (!record(row) || !(row.output_text === null || typeof row.output_text === 'string')) throw invalid();
  const text = row.output_text || '', parsed = arrayCandidates(text);
  if (parsed) return parsed;
  const first = record(row.meta) && Array.isArray(row.meta.candidates) ? row.meta.candidates[0] : undefined;
  if (first !== undefined && (!record(first) || (first.title != null && typeof first.title !== 'string'))) throw invalid();
  const candidate = first === undefined ? {} : clone(first);
  candidate.title = typeof candidate.title === 'string' ? candidate.title : '';
  candidate.body = text;
  return [candidate];
}
function createIntent(context, draft) {
  contextValid(context); const value = draftValue(draft);
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); });
  return freeze({ operation: 'create', id, userId: context.userId, shopId: context.shopId, baseOutputText: null,
    outputText: JSON.stringify([{ title: value.title, body: value.body, hashtags: [] }]), meta: { source: 'manual_upload', asset_class: 'upload' } });
}
function updateIntent(context, base, index, draft) {
  ownedRow(context, base); const rows = candidates(base), value = draftValue(draft);
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw invalid();
  const baseCandidate = arrayCandidates(base.output_text || '') ? null : clone(rows[0]);
  rows[index].title = value.title; rows[index].body = value.body;
  const intent = { operation: 'update', id: base.id, userId: context.userId, shopId: context.shopId, baseOutputText: base.output_text, outputText: JSON.stringify(rows) };
  if (baseCandidate) intent.baseCandidate = baseCandidate;
  return freeze(intent);
}
function deleteIntent(context, base) {
  ownedRow(context, base);
  return freeze({ operation: 'delete', id: base.id, userId: context.userId, shopId: context.shopId, baseOutputText: base.output_text, outputText: null });
}
function validateIntent(intent) {
  contextValid(intent);
  if (!uuid(intent.id) || !['create', 'update', 'delete'].includes(intent.operation) || !(intent.baseOutputText === null || typeof intent.baseOutputText === 'string')) throw invalid();
  const allowed = ['operation', 'id', 'userId', 'shopId', 'baseOutputText', 'outputText'].concat(intent.operation === 'create' ? ['meta'] : intent.operation === 'update' ? ['baseCandidate'] : []);
  if (Object.keys(intent).some(key => !allowed.includes(key))) throw invalid();
  if (intent.operation === 'delete') { if (intent.outputText !== null) throw invalid(); return; }
  if (typeof intent.outputText !== 'string') throw invalid();
  let rows; try { rows = JSON.parse(intent.outputText); } catch (_) { throw invalid(); }
  if (!Array.isArray(rows) || !rows.length || rows.some(item => !record(item))) throw invalid();
  if (intent.operation === 'create' && (intent.baseOutputText !== null || !record(intent.meta) || Object.keys(intent.meta).length !== 2 || intent.meta.source !== 'manual_upload' || intent.meta.asset_class !== 'upload'
    || rows.length !== 1 || Object.keys(rows[0]).some(key => !['title', 'body', 'hashtags'].includes(key)) || !Array.isArray(rows[0].hashtags) || rows[0].hashtags.length)) throw invalid();
  if (intent.operation === 'create') draftValue({ title: rows[0].title, body: rows[0].body });
  else {
    const json = arrayCandidates(intent.baseOutputText || '');
    if (json ? Object.prototype.hasOwnProperty.call(intent, 'baseCandidate') : !record(intent.baseCandidate)) throw invalid();
    const before = json || candidates({ output_text: intent.baseOutputText, meta: { candidates: [intent.baseCandidate] } });
    if (!json && JSON.stringify(before[0]) !== JSON.stringify(intent.baseCandidate)) throw invalid();
    if (before.length !== rows.length) throw invalid();
    const preserved = item => JSON.stringify(Object.keys(item).filter(key => key !== 'title' && key !== 'body').map(key => [key, item[key]]));
    let changed = 0;
    rows.forEach((item, index) => {
      if (preserved(before[index]) !== preserved(item)) throw invalid();
      if (item.title !== before[index].title || item.body !== before[index].body) {
        draftValue({ title: item.title, body: item.body });
        if (++changed > 1) throw invalid();
      }
    });
  }
}
function matches(intent, row) {
  try {
    validateIntent(intent); ownedRow(intent, row);
    return row.id === intent.id && row.output_text === (intent.operation === 'delete' ? intent.baseOutputText : intent.outputText)
      && (intent.operation !== 'create' || row.meta.asset_class === intent.meta.asset_class);
  } catch (_) { return false; }
}
function key(context, id) {
  contextValid(context); if (id != null && id !== '' && !uuid(id)) throw invalid();
  return JSON.stringify([context.userId, context.shopId, id || 'create']);
}
module.exports = { createIntent, updateIntent, deleteIntent, candidates, matches, key, ownedRow, validateIntent };
