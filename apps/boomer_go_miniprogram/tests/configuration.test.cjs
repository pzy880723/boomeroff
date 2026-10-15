const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../tools/configure.cjs'), 'utf8');
function configure(key) {
  let written = '';
  vm.runInNewContext(script, {
    __dirname: path.join(__dirname, '../tools'), Buffer,
    console: { log() {} },
    require(name) {
      if (name === 'node:fs') return { readFileSync: () => 'VITE_SUPABASE_URL=https://example.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=' + key, writeFileSync: (_, value) => { written = value; } };
      return require(name);
    }
  });
  return written;
}
test('configuration refuses privileged keys before generating any client source', () => {
  for (const role of ['service_role', 'authenticated']) {
    const key = 'e30.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.test';
    assert.throws(() => configure(key), /public|privileged|publishable/i);
  }
  assert.throws(() => configure('sb_secret_test'), /public|privileged|publishable/i);
});
test('configuration accepts a public anon credential only', () => {
  const key = 'e30.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.test';
  assert.match(configure(key), /example.supabase.co/);
});
test('checked-in configuration contains no privileged client credential', () => {
  const { publicKey } = require('../miniprogram/config');
  if (publicKey.startsWith('sb_publishable_')) return;
  assert.equal(JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role, 'anon');
});
