const stores = [
  { id:'xtd', name:'新天地' }, { id:'citic', name:'中信泰富' }, { id:'metro', name:'美罗城' }
];
const datePattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function money(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return '—';
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '¥' + whole + '.' + String(cents % 100).padStart(2, '0');
}

function matchups(snapshot) {
  if (!snapshot?.complete || !snapshot.includedInCycle) return [];
  const { xtd, citic, metro } = snapshot.totals;
  if (![xtd, citic, metro, xtd + citic].every(value => Number.isSafeInteger(value) && value >= 0)) return [];
  return [
    ['01', '单店擂台', '新天地', '中信泰富', xtd, citic],
    ['02', '双店攻擂', '新天地＋中信泰富', '美罗城', xtd + citic, metro],
  ].map(([id, title, left, right, a, b]) => ({
    id, title, left, right, leftAmount:money(a), rightAmount:money(b),
    width:a + b ? Math.round(1000 * a / (a + b)) / 10 : 50,
    note:a === b ? '当前打平' : (a < b ? (id === '02' ? '双店联盟' : left) : right)
      + ' · 反超还差 ' + money(Math.abs(a - b) + 1),
  }));
}

function reportStatuses(submission) {
  return stores.map(store => ({ ...store, reported:submission?.[store.id] === true }));
}

function dailyRows(snapshot) {
  return stores.map(store => {
    const row = snapshot?.daily?.[store.id];
    return { ...store, amount:money(row?.salesCents), orders:row ? String(row.orders) : '—', reported:!!row };
  });
}

function reportFields(date, amount, count) {
  amount = amount.trim();
  count = count.trim();
  if (!datePattern.test(date)) throw new Error('请选择有效的营业日期');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) throw new Error('请输入实收销售额，最多两位小数');
  const [yuan, fractional = ''] = amount.split('.');
  const salesCents = Number(yuan) * 100 + Number(fractional.padEnd(2, '0'));
  if (salesCents > 100000000000) throw new Error('实收销售额超出范围');
  if (!/^\d{1,7}$/.test(count) || Number(count) > 1000000) throw new Error('请输入有效的成交单量');
  return { date, salesCents, orders:Number(count) };
}

function makeCompetitionClient(request) {
  return {
    state: date => request('/competition/state' + (date ? '?date=' + encodeURIComponent(date) : '')),
    rules: () => request('/competition/rules'),
    report: body => request('/competition/report', body),
    correct: body => request('/competition/admin/report', body),
    cycle: () => request('/competition/admin/cycle'),
    setCycle: body => request('/competition/admin/cycle', body),
  };
}

module.exports = { stores, money, matchups, reportStatuses, dailyRows, reportFields, makeCompetitionClient };
