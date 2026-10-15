const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// Every production publisher must use this same host lock; it is not a CAS against uncooperative writers.
if (process.env.GO_MINI_DEPLOY_LOCKED !== '1') {
  try {
    execFileSync('flock', ['-n', '/tmp/boomer-erp-production-deploy.lock', process.execPath, __filename, ...process.argv.slice(2)], {
      env: Object.assign({}, process.env, { GO_MINI_DEPLOY_LOCKED: '1' }), stdio: 'inherit'
    });
    process.exit(0);
  } catch (error) { process.exit(error.status || 1); }
}

const candidate = fs.realpathSync(process.argv[2]);
if (!/^\/var\/www\/boomer-erp\/releases\/go-mini-leaderboard-[a-z0-9-]+$/.test(candidate)) throw Error('Unexpected candidate path');
const current = '/var/www/boomer-erp/current';
const baseline = fs.readFileSync(path.join(candidate, 'GO_MINI_PREVIOUS_RELEASE'), 'utf8').trim();
if (fs.realpathSync(current) !== baseline) throw Error('Production baseline changed; rebase before promotion');
const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
const previous = processes.find(p => p.name === 'boomer-off-buddy');
if (!previous || previous.pm2_env.APP_DIR !== baseline || previous.pm2_env.ERP_PORT !== '3005') throw Error('Production process does not match the captured baseline');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-mini-promote-'));
fs.chmodSync(temp, 0o700);
function config(dir) {
  return { apps: [{ name: 'boomer-off-buddy', script: path.join(dir, 'scripts/run-tencent-erp.sh'),
    interpreter: '/bin/bash', cwd: dir,
    env: Object.assign({}, previous.pm2_env.env || {}, { APP_DIR: dir, ERP_PORT: '3005', ERP_BIND_HOST: '127.0.0.1', NODE_ENV: 'production' }) }] };
}
for (const [name, dir] of [['next', candidate], ['previous', baseline]]) fs.writeFileSync(path.join(temp, name + '.json'), JSON.stringify(config(dir)), { mode: 0o600 });
function running() {
  return JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'boomer-off-buddy');
}
function point(dir, expected) {
  if (fs.realpathSync(current) !== expected) throw Error('Production link changed; refusing to replace another release');
  const next = current + '.go-mini-' + process.pid;
  execFileSync('sudo', ['-n', 'ln', '-s', dir, next]);
  execFileSync('sudo', ['-n', 'mv', '-Tf', next, current]);
}
function activate(name) {
  const owner = running();
  if (owner && ![baseline, candidate].includes(owner.pm2_env.APP_DIR)) throw Error('Another deployment replaced the production process');
  if (owner) execFileSync('pm2', ['delete', 'boomer-off-buddy'], { stdio: 'ignore' });
  execFileSync('pm2', ['start', path.join(temp, name + '.json'), '--only', 'boomer-off-buddy'], { stdio: 'ignore' });
}
function owns(dir) { const owner = running(); return fs.realpathSync(current) === dir && owner && owner.pm2_env.APP_DIR === dir; }
async function healthy(port, leaderboard) {
  for (let i = 0; i < 30; i++) {
    try {
      const login = await fetch('http://127.0.0.1:' + port + '/login', { signal: AbortSignal.timeout(1500) });
      if (login.status === 200) {
        if (!leaderboard) return true;
        const response = await fetch('http://127.0.0.1:' + port + '/api/public/go/leaderboard', { signal: AbortSignal.timeout(1500) });
        const body = await response.json();
        if (response.status === 401 && body.ok === false && body.code === 'missing_token') return true;
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}
(async () => {
  if (!(await healthy(3906, true))) throw Error('Candidate health check failed');
  if (fs.realpathSync(current) !== baseline) throw Error('Production changed during candidate validation');
  try {
    point(candidate, baseline);
    activate('next');
    if (!(await healthy(3005, true)) || !owns(candidate)) throw Error('New production health or ownership check failed');
    execFileSync('pm2', ['save'], { stdio: 'ignore' });
    console.log('Promoted additive GO leaderboard route; existing worker environment preserved.');
    console.log('Previous release: ' + baseline);
    console.log('Current release: ' + candidate);
  } catch (error) {
    if (fs.realpathSync(current) === candidate) {
      const owner = running();
      const active = owner && owner.pm2_env.APP_DIR;
      if (active && ![baseline, candidate].includes(active)) {
        const foreign = fs.realpathSync(active);
        if (!foreign.startsWith('/var/www/boomer-erp/releases/')) throw Error('Foreign production owner requires manual recovery');
        point(foreign, candidate);
        console.error('Another publisher took ownership; restored its active release link without modifying its process.');
      } else {
        point(baseline, candidate);
        activate('previous');
        if (!(await healthy(3005, false)) || !owns(baseline)) throw Error('Rollback activation or ownership was not confirmed');
        console.error('Promotion failed; previous release process and health confirmed.');
      }
    }
    throw error;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
