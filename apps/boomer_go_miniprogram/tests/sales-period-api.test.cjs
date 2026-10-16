const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApi } = require('../miniprogram/shared/api');
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function api(reply, factory = createApi) {
  const calls = [];
  const value = factory({ config: { erpUrl: 'https://erp.invalid' }, session: { get: () => ({ userId: 'caller', shop: { id: 'go-shop' } }), token: () => 'synthetic' }, invoke() { assert.fail('no GO write'); }, wx: { request(r) {
    const url = new URL(r.url); calls.push(url);
    const data = url.pathname.endsWith('/session') ? { shops: [{ go_shop_id: 'go-shop', erp_location_id: 'erp-shop' }], visible_locations: [{ id: 'erp-shop' }] } : reply(url);
    r.success({ statusCode: 200, data: { ok: true, data } });
  } } });
  return { value, calls };
}
const summary = date => ({ date, scope: { location_ids: ['erp-shop'] }, stores: [{ location_id: 'erp-shop', status: 'ok', completeness: { kind: 'gross', complete: false } }], totals: { actual_fen: 100 }, completeness: { kind: 'gross', complete: false } });
const ranking = (period, date) => ({ period, date, shop: { id: 'erp-shop' }, complete: false, rows: [], sales_assessment: false });

for (const date of ['2000-01-01', null, undefined]) test('today summary rejects wrong or absent date: ' + date, async () => {
  const h = api(() => summary(date));
  await assert.rejects(h.value.sales({ period: 'today' }), /日期|周期/);
});

for (const period of ['today', 'month']) test('ranking validates requested ' + period + ' and server date before displaying', async () => {
  const correct = period === 'month' ? today().slice(0, 7) : today();
  for (const reply of [ranking(period, '2000-01-01'), ranking(period === 'today' ? 'month' : 'today', correct), ranking(undefined, correct), ranking(period, null)]) {
    await assert.rejects(api(() => reply).value.leaderboard({ period }), /日期|周期/);
  }
  const result = await api(() => ranking(period, correct)).value.leaderboard({ period });
  assert.equal(result.period, period); assert.equal(result.date, correct); assert.equal(result.items.length, 0); assert.equal(result.sales_assessment, false);
});

test('validated current summary preserves incomplete source flags rather than claiming new freshness', async () => {
  const h = api(url => summary(url.searchParams.get('date'))), result = await h.value.sales();
  assert.equal(result.date, today()); assert.equal(result.revenue, 1); assert.equal(result.complete, false); assert.equal(result.stale, true); assert.equal(result.as_of, null);
  assert.equal(result.sales_assessment, false); assert.equal(h.calls.length, 2);
});

for (const kind of ['summary', 'today', 'month']) test(kind + ' cannot install a previous business day or month after Shanghai rollover', async () => {
  let now = Date.parse(kind === 'month' ? '2026-10-31T15:59:59Z' : '2026-10-16T15:59:59Z');
  const RealDate = Date, module = { exports: {} }, file = path.resolve(__dirname, '../miniprogram/shared/api.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: id => require(path.resolve(path.dirname(file), id)), Date: class extends RealDate { static now() { return now; } } });
  const h = api(() => { now += 2000; return kind === 'summary' ? summary('2026-10-16') : ranking(kind, kind === 'month' ? '2026-10' : '2026-10-16'); }, module.exports.createApi);
  await assert.rejects(kind === 'summary' ? h.value.sales() : h.value.leaderboard({ period: kind }), /日期|周期/);
});
