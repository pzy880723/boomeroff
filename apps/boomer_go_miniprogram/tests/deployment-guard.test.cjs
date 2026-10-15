const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../deploy/promote-erp-candidate.cjs'), 'utf8');
async function scenario(foreignRelease, rollbackFailure = false) {
  const baseline = '/var/www/boomer-erp/releases/previous';
  const candidate = '/var/www/boomer-erp/releases/go-mini-leaderboard-20261016b';
  const foreign = '/var/www/boomer-erp/releases/another-release';
  let current = baseline, active = baseline, pendingLink = '', deletes = 0;
  const files = {}, logs = [];
  const process = { argv: ['node', 'promote.cjs', candidate], env: { GO_MINI_DEPLOY_LOCKED: '1' }, pid: 123 };
  const pm = () => active ? [{ name: 'boomer-off-buddy', pm2_env: { APP_DIR: active, ERP_PORT: '3005', env: { YOUZAN_ORDER_SYNC_WORKER_ENABLED: 'true' } } }] : [];
  const fakeFs = {
    realpathSync: p => p === '/var/www/boomer-erp/current' ? current : p,
    readFileSync: () => baseline, mkdtempSync: () => '/tmp/deploy-test', chmodSync() {}, rmSync() {},
    writeFileSync: (p, content) => { files[p] = content; }
  };
  function execFileSync(command, args) {
    if (command === 'pm2' && args[0] === 'jlist') return JSON.stringify(pm());
    if (command === 'pm2' && args[0] === 'delete') { deletes++; active = null; }
    if (command === 'pm2' && args[0] === 'start') {
      if (rollbackFailure && args[1].includes('previous.json')) throw new Error('rollback start failed');
      active = JSON.parse(files[args[1]]).apps[0].env.APP_DIR;
    }
    if (command === 'sudo' && args[1] === 'ln') pendingLink = args[3];
    if (command === 'sudo' && args[1] === 'mv') {
      current = pendingLink;
      if (foreignRelease && current === candidate) active = foreign;
    }
    return '';
  }
  const result = vm.runInNewContext(source, {
    process, __filename: 'promote.cjs', AbortSignal,
    setTimeout: fn => { fn(); }, console: { log: s => logs.push(s), error: s => logs.push(s) },
    fetch: async url => ({ status: rollbackFailure && active === candidate && url.includes(':3005/') ? 500 : url.includes('leaderboard') ? 401 : 200, json: async () => ({ ok: false, code: 'missing_token' }) }),
    require(name) { if (name === 'node:fs') return fakeFs; if (name === 'node:child_process') return { execFileSync }; return require(name); }
  });
  await result;
  return { current, active, foreign, baseline, candidate, deletes, files, logs, process };
}
test('promotion preserves the worker environment and activates only its checked release', async () => {
  const result = await scenario(false);
  assert.equal(result.current, result.candidate);
  assert.equal(result.active, result.candidate);
  assert.equal(JSON.parse(result.files['/tmp/deploy-test/next.json']).apps[0].env.YOUZAN_ORDER_SYNC_WORKER_ENABLED, 'true');
});
test('a competing release is not rolled back to this scripts old baseline', async () => {
  const result = await scenario(true);
  assert.equal(result.current, result.foreign);
  assert.equal(result.active, result.foreign);
  assert.equal(result.deletes, 0);
  assert.equal(result.process.exitCode, 1);
});
test('a failed rollback activation is never described as restored or healthy', async () => {
  const result = await scenario(false, true);
  assert.equal(result.process.exitCode, 1);
  assert.ok(result.logs.includes('rollback start failed'));
  assert.ok(!result.logs.some(line => line.includes('process and health confirmed')));
});
