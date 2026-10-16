const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../miniprogram/shared/knowledge-chat.js');
function helper() { assert.ok(fs.existsSync(file), 'knowledge-bound chat helper exists'); return require(file); }
const ID = '00000000-0000-4000-8000-000000000811';
const VERSION = '2026-10-16T09:00:00+08:00';
const pair = n => ({ question: '问题 ' + n, answer: '回答 ' + n });
const reply = patch => ({ knowledge_id: ID, source_updated_at: VERSION, reply: '已确认回答', persisted: false, ...patch });

test('context contains exact role/content keys, first/last user and no fabricated system/source fields', () => {
  const h = helper(), plan = h.buildContext([pair(1), pair(2)], '  新问题  ');
  assert.deepEqual(plan.messages, [{ role: 'user', content: '问题 1' }, { role: 'assistant', content: '回答 1' }, { role: 'user', content: '问题 2' }, { role: 'assistant', content: '回答 2' }, { role: 'user', content: '新问题' }]);
  assert.equal(plan.confirmation, null); assert.equal(plan.includedPairs, 2); assert.equal(plan.omittedPairs, 0); assert.ok(Object.isFrozen(plan.messages)); plan.messages.forEach(x => assert.ok(Object.isFrozen(x)));
});
test('more than six conversation rounds remain in RAM while each request selects at most five latest whole pairs explicitly', () => {
  const h = helper(), pairs = Array.from({ length: 30 }, (_, i) => pair(i)), before = JSON.stringify(pairs), plan = h.buildContext(pairs, '下一题');
  assert.equal(plan.messages.length, 11); assert.equal(plan.messages[0].content, '问题 25'); assert.equal(plan.messages[9].content, '回答 29'); assert.equal(plan.omittedPairs, 25); assert.match(plan.confirmation, /最近 5 轮完整对话/); assert.match(plan.confirmation, /记录仍保留/); assert.equal(JSON.stringify(pairs), before);
});
test('aggregate codepoint budget chooses a contiguous suffix without cutting any message', () => {
  const h = helper(), pairs = Array.from({ length: 5 }, () => ({ question: '😀'.repeat(1500), answer: '答'.repeat(1500) }));
  const plan = h.buildContext(pairs, '新'.repeat(1000)); assert.equal(plan.includedPairs, 3); assert.equal(plan.omittedPairs, 2); assert.equal(plan.messages.reduce((n, x) => n + Array.from(x.content).length, 0), 10000); assert.equal(plan.messages[0].content, pairs[2].question); assert.match(plan.confirmation, /最近 3 轮/);
});
test('oversized latest answer sends question-only only with its specific omission confirmation', () => {
  const h = helper(), pairs = [pair(1), { question: '最近的问题', answer: '长'.repeat(2001) }], plan = h.buildContext(pairs, '继续');
  assert.deepEqual(plan.messages, [{ role: 'user', content: '继续' }]); assert.equal(plan.includedPairs, 0); assert.equal(plan.omittedPairs, 2); assert.match(plan.confirmation, /最近一条回答/); assert.match(plan.confirmation, /仅携带当前问题和本条知识/);
});
test('invalid older pair is not skipped to include still older content, but valid recent pairs remain contiguous', () => {
  const h = helper(), pairs = [pair(1), { question: '过长', answer: 'x'.repeat(2001) }, pair(3)], plan = h.buildContext(pairs, '新');
  assert.equal(plan.includedPairs, 1); assert.equal(plan.messages[0].content, '问题 3'); assert.equal(plan.omittedPairs, 2);
});
test('questions reject empty, malformed Unicode, NUL, overlong originals and nonstrings without truncation', () => {
  const h = helper(); for (const q of ['', '  ', '\ud800', 'x\0y', '\udfff', '😀'.repeat(2001), {}, null]) assert.throws(() => h.buildContext([], q));
  assert.equal(h.buildContext([], '😀'.repeat(2000)).messages[0].content, '😀'.repeat(2000));
  for (const pairs of [null, {}, [null], [{ question: 'a' }], [{ question: {}, answer: 'a' }], [{ question: 'a', answer: '\udfff' }], [{ question: 'a', answer: 'b', system: 'fake' }]]) assert.throws(() => h.buildContext(pairs, '新问题'));
});
test('reply parser binds lower-case UUID, exact valid source version, false persistence and Unicode4000', () => {
  const h = helper(); assert.equal(h.parseReply(reply({ reply: '😀'.repeat(4000) }), ID, VERSION), '😀'.repeat(4000));
  for (const patch of [{ knowledge_id: ID.replace('811', '812') }, { knowledge_id: 'bad' }, { source_updated_at: '2026-10-16T09:01:00+08:00' }, { source_updated_at: '2026-02-30T09:00:00Z' }, { source_updated_at: null }, { persisted: true }, { persisted: null }, { reply: ' ' }, { reply: {} }, { reply: '\ud800' }, { reply: 'a\0b' }, { reply: '😀'.repeat(4001) }, { raw: 'secret' }]) assert.throws(() => h.parseReply(reply(patch), ID, VERSION));
  const missing = reply(); delete missing.persisted; assert.throws(() => h.parseReply(missing, ID, VERSION));
});
test('append retains full confirmed replies up to4000 and never mutates old transcript', () => {
  const h = helper(), pairs = [pair(1)], next = h.appendConfirmed(pairs, '  提问  ', 'a'.repeat(3000)); assert.equal(pairs.length, 1); assert.equal(next.length, 2); assert.equal(next[1].question, '提问'); assert.equal(next[1].answer.length, 3000); assert.throws(() => h.appendConfirmed(pairs, 'q', 'a'.repeat(4001)));
});
test('history view defaults to latest20 and reveals earlier20 locally without losing full transcript', () => {
  const h = helper(), pairs = Array.from({ length: 25 }, (_, i) => pair(i));
  const last = h.historyView(pairs); assert.equal(last.messages.length, 20); assert.equal(last.messages[0].content, '问题 15'); assert.equal(last.totalCount, 50); assert.equal(last.hasEarlier, true);
  const more = h.historyView(pairs, 40); assert.equal(more.messages.length, 40); assert.equal(more.messages[0].content, '问题 5'); assert.equal(h.historyView(pairs, 60).hasEarlier, false); assert.equal(pairs.length, 25);
});
test('safe fixed errors never expose backend/provider message contents', () => {
  const h = helper(); for (const code of ['ai_budget_exhausted', 'ai_rate_limited', 'ai_timeout', 'ai_unavailable', 'ai_invalid_response', 'knowledge_chat_scope_changed', 'not_found', 'db_unavailable', 'scope_unavailable', 'account_suspended', 'erp_scope_not_ready', 'unknown', '__proto__']) { const value = h.errorText({ code, message: 'SECRET TOKEN provider trace' }); assert.equal(typeof value, 'string'); assert.ok(value); assert.doesNotMatch(value, /SECRET|TOKEN|provider trace/); }
  assert.notEqual(h.errorText({ code: 'ai_budget_exhausted' }), h.errorText({ code: 'ai_timeout' }));
});
