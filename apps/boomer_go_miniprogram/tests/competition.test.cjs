const test = require('node:test');
const assert = require('node:assert/strict');
const { matchups, reportFields, reportStatuses } = require('../operations-mini/shared/competition');

test('no complete day means no score, partial store reports are not zero', () => {
  assert.deepEqual(matchups(null), []);
  assert.deepEqual(matchups({ complete: false, totals: { xtd: 100, citic: 0, metro: 0 } }), []);
  assert.deepEqual(reportStatuses({ xtd: true }).map(row => row.reported), [true, false, false]);
});

test('original rivalries and minimum overtake delta use cents', () => {
  const [single, alliance] = matchups({ complete: true, includedInCycle: true,
    totals: { xtd: 4_000_000, citic: 3_800_000, metro: 8_000_000 } });
  assert.equal(single.rightAmount, '¥38,000.00');
  assert.match(single.note, /中信泰富.*¥2,000.01/);
  assert.equal(alliance.leftAmount, '¥78,000.00');
  assert.match(alliance.note, /双店联盟.*¥2,000.01/);
  assert.equal(matchups({ complete: true, includedInCycle: false, totals: {} }).length, 0);
});

test('report input validates cents and order count without floating point rounding', () => {
  assert.deepEqual(reportFields('2026-11-25', '123.09', '0'), { date: '2026-11-25', salesCents: 12309, orders: 0 });
  for (const value of ['', '1.001', '1e2', '-1', 'Infinity', '1000000000.01']) {
    assert.throws(() => reportFields('2026-11-25', value, '0'));
  }
  assert.throws(() => reportFields('2026-11-25', '0', '1000001'));
});
