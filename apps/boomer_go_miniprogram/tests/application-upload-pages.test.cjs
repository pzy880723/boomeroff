const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram/pages/application');
const APP = '00000000-0000-4000-8000-000000000032', ACT = '00000000-0000-4000-8000-000000000031', USER = '00000000-0000-4000-8000-000000000011', ID = '00000000-0000-4000-8000-000000000099';
const SHOP = 'shop-a', NOW = '2026-10-16T09:20:00+08:00', V1 = '1'.repeat(64), V2 = '2'.repeat(64), ORIGINAL = 'publish/' + APP + '/legacy.jpg';
const FILE = { file_path: 'wxfile://original.png', format: 'png', byte_size: 100, digest_sha1: 'a'.repeat(40), name: 'original.png' };
const policy = { max_bytes: 10485760, max_pending: 9, intent_ttl_seconds: 600, formats: ['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'] };
const caps = extra => ({ shop_id: SHOP, can_manage: true, can_confirm_publish: true, can_upload_evidence: true, upload_policy: policy, ...extra });
const detail = () => ({ shop_id: SHOP, activity: { id: ACT, name: '活动', platform: '小红书', form_fields: [] }, application: { id: APP, activity_id: ACT, status: 'approved', applicant_name_masked: '顾*', applicant_phone_tail: '1234', publish: { confirmed: false, confirmed_at: null, confirmed_by: null, note: '原备注', url: null, screenshots: [{ path: ORIGINAL, signed_url: null, error: 'sign_failed' }] }, answers: [] }, version: V1, server_time: NOW });
const intent = (binding, fingerprint, requestId, extra) => ({ ...binding, ...fingerprint, actor_id: USER, request_id: requestId, intent_id: ID, path: 'publish/' + APP + '/go-native-evidence-' + ID + '.png', expires_at: '2026-10-16T09:30:00+08:00', replay: false, ...extra });
const verified = (i, extra) => ({ ...i, object_id: APP, object_version: 'object-v1', sha256: 'b'.repeat(64), state: 'verified', preview: { path: i.path, signed_url: null, error: 'sign_failed' }, ...extra });
const event = index => ({ currentTarget: { dataset: { index } } });
const ev = value => ({ detail: { value } });
const gate = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
function harness(options = {}) {
  const env = options.env || { revision: 1, current: { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } };
  const calls = [], picks = [], previews = [], modals = [];
  const app = env.app || (env.app = { preview: false, session: { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } }, ensureSession: async () => true });
  if (options.preview) app.preview = true;
  let lastIntent, published;
  const wx = { chooseMedia(o) { picks.push(o); }, previewImage(o) { previews.push(o); o.success({}); }, showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, reLaunch() {} };
  const defaults = {
    action: async (a, p) => {
      if (a === 'activity-capabilities') return caps();
      if (a === 'publication-confirm') { published = p; return { request_id: p.request_id, shop_id: p.shop_id, application_id: APP, activity_id: ACT, target_confirmed: p.target_confirmed, confirmed_at: NOW, confirmed_by: USER, version: V2, replay: false }; }
      const d = detail();
      if (published) { d.version = V2; d.application.publish = { confirmed: true, confirmed_at: NOW, confirmed_by: USER, note: published.note, url: published.url, screenshots: published.screenshots.map(path => ({ path, signed_url: null, error: 'sign_failed' })) }; }
      return d;
    },
    inspectPublicationFile: async () => ({ ...FILE }),
    createPublicationUpload: async (b, f, r) => (lastIntent = intent(b, f, r)),
    transferPublicationFile: async i => ({ transferred: true, intent_id: i.intent_id, path: i.path }),
    commitPublicationUpload: async i => verified(i),
    publicationUploadStatus: async p => ({ shop_id: p.shop_id, activity_id: p.activity_id, application_id: p.application_id, request_id: p.request_id, state: 'verified', intent: lastIntent, receipt: verified(lastIntent) })
  };
  app.api = {};
  for (const name of Object.keys(defaults)) app.api[name] = async (...args) => { calls.push({ name, args }); return (options[name] || defaults[name])(...args); };
  let spec;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), { Page(p) { spec = p; }, wx, getApp: () => app, require(id) {
    if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
    if (id === './uploads') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'uploads.js'), 'utf8'), { module: m, require: id => require(path.resolve(root, id)), getApp: () => app, wx }); return m.exports; }
    return require(path.resolve(root, id));
  } });
  const page = { ...spec, data: structuredClone(spec.data), setData(p) { Object.assign(this.data, p); } };
  return { page, app, env, calls, picks, previews, modals, async start() { await page.onLoad({ id: APP, activityId: ACT }); await page.onShow(); }, async select() { const p = page.chooseOriginal(); picks.at(-1).success({ tempFiles: [{ tempFilePath: FILE.file_path, name: FILE.name }] }); await p; }, methods(name) { return calls.filter(c => c.name === name); } };
}
async function loaded(options) { const h = harness(options); await h.start(); assert.equal(typeof h.page.chooseOriginal, 'function', 'application uploader must exist'); return h; }

test('uploader requires verified upload policy, capability and non-preview state before opening a picker', async () => {
  for (const response of [caps({ can_upload_evidence: false }), caps({ upload_policy: null }), caps({ upload_policy: { ...policy, max_bytes: '10485760' } })]) {
    const h = await loaded({ action: async a => a === 'activity-capabilities' ? response : detail() }); await h.page.chooseOriginal(); assert.equal(h.picks.length, 0);
  }
  const h = await loaded({ preview: true }); await h.page.chooseOriginal(); await h.page.uploadOriginal(event(0)); assert.equal(h.picks.length, 0); assert.equal(h.methods('inspectPublicationFile').length, 0);
});

test('explicit native original selection, cancellation and preview preserve draft without inspecting or uploading', async () => {
  const h = await loaded(); h.page.onNote(ev('保留草稿')); await h.select();
  assert.deepEqual(Array.from(h.picks[0].sizeType), ['original']); assert.deepEqual(Array.from(h.picks[0].mediaType), ['image']); assert.equal(h.picks[0].count, 1);
  assert.equal(h.page.data.uploads.length, 1); assert.equal(h.page.data.uploads[0].name, FILE.name); assert.equal(h.methods('inspectPublicationFile').length, 0);
  await h.page.previewUpload(event(0)); assert.equal(h.previews[0].current, FILE.file_path);
  const choosing = h.page.chooseOriginal(); h.picks.at(-1).fail({ errMsg: 'chooseMedia:fail cancel' }); await choosing;
  assert.equal(h.page.data.note, '保留草稿'); assert.equal(h.page.data.uploads.length, 1); assert.equal(h.page.data.uploadError, '');
  assert.doesNotMatch(JSON.stringify(h.page.data.uploads), /digest_sha1|file_path|request_id|intent_id/);
});

test('picker hide/result/show and hide/show/result consume once only after fresh authority without hidden requests', async () => {
  for (const resultFirst of [true, false]) {
    const h = await loaded(); const choosing = h.page.chooseOriginal(); h.page.onHide(); const count = h.calls.length;
    if (resultFirst) { h.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path, name: FILE.name }] }); await choosing; assert.equal(h.calls.length, count); assert.equal(h.page.data.uploads.length, 0); }
    await h.page.onShow();
    if (!resultFirst) { h.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path, name: FILE.name }] }); await choosing; }
    assert.equal(h.page.data.uploads.length, 1); await h.page.onShow(); assert.equal(h.page.data.uploads.length, 1); assert.equal(h.methods('createPublicationUpload').length, 0);
  }
});

test('picker result cannot cross user, shop, revision, editor generation or unload boundaries', async () => {
  for (const change of ['user', 'shop', 'revision', 'edit', 'unload']) {
    const h = await loaded(); const choosing = h.page.chooseOriginal(); h.page.onHide();
    if (change === 'user') h.env.current = { ...h.env.current, userId: ID };
    if (change === 'shop') h.env.current = { ...h.env.current, shop: { id: 'other' } };
    if (change === 'revision') h.env.revision++;
    if (change === 'edit') h.page._edit++;
    if (change === 'unload') h.page.onUnload();
    h.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path }] }); await choosing;
    if (change !== 'unload') await h.page.onShow();
    assert.equal(h.page.data.uploads.length, 0, change); assert.equal(h.methods('inspectPublicationFile').length, 0);
  }
});

test('original upload uses exact frozen fingerprint, binding and active guards; progress is not verification', async () => {
  const finish = gate(); let callback;
  const h = await loaded({ transferPublicationFile: async (i, f, progress, options) => { callback = progress; assert.equal(options.isActive(), true); return finish.promise; } });
  h.page.onNote(ev('未保存')); await h.select(); const uploading = h.page.uploadOriginal(event(0)); await tick();
  const create = h.methods('createPublicationUpload')[0].args;
  assert.deepEqual(JSON.parse(JSON.stringify(create[0])), { shop_id: SHOP, activity_id: ACT, application_id: APP });
  assert.deepEqual(create[1], { format: 'png', byte_size: 100, digest_sha1: FILE.digest_sha1 }); assert.match(create[2], /^[0-9a-f-]{36}$/);
  callback({ progress: 100, totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
  assert.equal(h.page.data.uploads[0].progress, 100); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.images.length, 1);
  const i = h.methods('transferPublicationFile')[0].args[0]; finish.resolve({ transferred: true, intent_id: i.intent_id, path: i.path }); await uploading;
  assert.equal(h.page.data.uploads[0].state, 'ready'); assert.equal(h.page.data.images.length, 2); assert.equal(h.page.data.note, '未保存');
  assert.equal(h.methods('commitPublicationUpload').length, 1); assert.equal(h.page.data.saved, false);
  for (const name of ['inspectPublicationFile', 'createPublicationUpload', 'transferPublicationFile', 'commitPublicationUpload']) assert.equal(typeof h.methods(name)[0].args.at(-1).isActive, 'function');
  await h.page.confirmPublish(); const payload = h.methods('action').find(c => c.args[0] === 'publication-confirm').args[1];
  assert.deepEqual(Array.from(payload.new_evidence_intents), [ID]); assert.equal(payload.expected_version, V1); assert.equal(h.page.data.saved, true);
});

test('bad local fingerprints never create remote intents or discard the prior draft', async () => {
  for (const extra of [{ file_path: 'wxfile://changed.png' }, { format: 'exe' }, { byte_size: 10485761 }, { byte_size: 0 }, { digest_sha1: 'A'.repeat(40) }]) {
    const h = await loaded({ inspectPublicationFile: async () => ({ ...FILE, ...extra }) }); await h.select(); await h.page.uploadOriginal(event(0));
    assert.equal(h.methods('createPublicationUpload').length, 0); assert.equal(h.page.data.images.length, 1); assert.ok(h.page.data.uploads[0].error);
  }
});

test('intent binding/path/fingerprint mismatches remain unknown and never start transfer', async () => {
  for (const extra of [{ actor_id: ID }, { shop_id: 'other' }, { activity_id: APP }, { application_id: ACT }, { request_id: APP }, { digest_sha1: 'c'.repeat(40) }, { format: 'jpg' }, { byte_size: 101 }, { path: 'publish/' + ACT + '/bad.png' }, { expires_at: 'bad' }, { replay: 'false' }]) {
    const h = await loaded({ createPublicationUpload: async (b, f, r) => intent(b, f, r, extra) }); await h.select(); await h.page.uploadOriginal(event(0));
    assert.equal(h.page.data.uploads[0].state, 'unknown'); assert.equal(h.methods('transferPublicationFile').length, 0); assert.equal(h.page.data.canSubmit, false);
  }
});

test('malformed verified receipts cannot add eligible paths or claim upload/publication success', async () => {
  for (const extra of [{ object_id: 'bad' }, { object_version: '' }, { sha256: 'B'.repeat(64) }, { state: 'consumed' }, { actor_id: ID }, { digest_sha1: 'c'.repeat(40) }, { expires_at: NOW }, { preview: { path: ORIGINAL, signed_url: null, error: null } }]) {
    const h = await loaded({ commitPublicationUpload: async i => verified(i, extra) }); await h.select(); await h.page.uploadOriginal(event(0));
    assert.equal(h.page.data.uploads[0].state, 'unknown'); assert.equal(h.page.data.images.length, 1); assert.equal(h.page.data.saved, false);
  }
});

test('hide during each awaited phase deactivates adapter guards and cannot advance to another external phase', async () => {
  const names = ['inspectPublicationFile', 'createPublicationUpload', 'transferPublicationFile', 'commitPublicationUpload'];
  for (const [index, name] of names.entries()) {
    const wait = gate(); let args;
    const h = await loaded({ [name]: async (...a) => { args = a; return wait.promise; } }); await h.select(); const sending = h.page.uploadOriginal(event(0)); await tick();
    h.page.onHide(); assert.equal(args.at(-1).isActive(), false);
    const i = name === 'createPublicationUpload' ? intent(...args.slice(0, 3)) : name === 'inspectPublicationFile' ? null : args[0];
    wait.resolve(index === 0 ? FILE : index === 1 ? i : index === 2 ? { transferred: true, intent_id: i.intent_id, path: i.path } : verified(i)); await sending;
    for (const later of names.slice(index + 1)) assert.equal(h.methods(later).length, 0, name);
    assert.equal(h.page.data.images.length, 0); assert.equal(h.page.data.saved, false);
  }
});

test('unknown create recovers after unload through status then explicit same-key retry, never automatically', async () => {
  let original;
  const first = await loaded({ createPublicationUpload: async (b, f, r) => { original = { b, f, r }; throw Error('timeout'); } }); await first.select(); await first.page.uploadOriginal(event(0)); first.page.onUnload();
  const h = await loaded({ env: first.env, publicationUploadStatus: async p => ({ ...p, state: 'not_found', intent: null, receipt: null }) });
  assert.equal(h.page.data.uploads[0].state, 'unknown'); assert.equal(h.methods('createPublicationUpload').length, 0);
  await h.page.checkUpload(event(0)); assert.equal(h.methods('createPublicationUpload').length, 0); assert.equal(h.page.data.uploads[0].canRetry, true);
  await h.page.retryUpload(event(0)); const call = h.methods('createPublicationUpload')[0].args;
  assert.deepEqual(call.slice(0, 3), [original.b, original.f, original.r]); assert.equal(h.page.data.uploads[0].state, 'ready');
  assert.doesNotMatch(JSON.stringify(h.app._applicationUploads), /signed_url|token|RAW_|base64|sha256/);
});

test('uploaded_unverified recovery commits the same intent without retransferring and changed local bytes prevent retry', async () => {
  for (const changed of [false, true]) {
    let i;
    const h = await loaded({ createPublicationUpload: async (b, f, r) => (i = intent(b, f, r)), transferPublicationFile: async () => { throw Error('timeout'); }, publicationUploadStatus: async p => ({ shop_id: p.shop_id, activity_id: p.activity_id, application_id: p.application_id, request_id: p.request_id, state: 'uploaded_unverified', intent: i, receipt: null }) });
    await h.select(); await h.page.uploadOriginal(event(0)); await h.page.checkUpload(event(0));
    if (changed) h.page.api.inspectPublicationFile = async () => ({ ...FILE, digest_sha1: 'c'.repeat(40) });
    await h.page.retryUpload(event(0)); assert.equal(h.methods('transferPublicationFile').length, 1);
    assert.equal(h.methods('commitPublicationUpload').length, changed ? 0 : 1); assert.equal(h.page.data.uploads[0].state, changed ? 'unknown' : 'ready');
  }
});

test('ready binding persists across hide/reentry but must be explicitly rechecked; another identity sees nothing', async () => {
  const first = await loaded(); await first.select(); await first.page.uploadOriginal(event(0)); const i = first.methods('createPublicationUpload')[0]; const frozen = intent(...i.args.slice(0, 3)); first.page.onUnload();
  const h = await loaded({ env: first.env, publicationUploadStatus: async p => ({ ...p, state: 'verified', intent: frozen, receipt: verified(frozen) }) });
  assert.equal(h.page.data.uploads.length, 1); assert.equal(h.page.data.canSubmit, false); await h.page.checkUpload(event(0)); assert.equal(h.page.data.images.length, 2); assert.equal(h.page.data.canSubmit, true);
  h.page.onUnload(); h.env.revision++; h.env.current = { ...h.env.current, userId: ID };
  const other = await loaded({ env: h.env }); assert.equal(other.page.data.uploads.length, 0);
});

test('status binding mismatches and expired/object_changed/foreign consumed results cannot enable association or fake success', async () => {
  for (const state of ['expired', 'object_changed', 'consumed', 'mismatch']) {
    let i;
    const h = await loaded({ createPublicationUpload: async (b, f, r) => (i = intent(b, f, r)), transferPublicationFile: async () => { throw Error('timeout'); }, publicationUploadStatus: async p => ({ ...p, activity_id: state === 'mismatch' ? APP : ACT, state: state === 'mismatch' ? 'pending' : state, intent: i, receipt: state === 'consumed' ? verified(i, { state }) : null }) });
    await h.select(); await h.page.uploadOriginal(event(0)); await h.page.checkUpload(event(0));
    assert.equal(h.page.data.canSubmit, false); assert.equal(h.page.data.images.length, 1); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.uploads[0].canRetry, false);
  }
});

test('removed ready evidence is omitted from intent IDs, existing references above nine are never capped', async () => {
  const h = await loaded({ action: async a => { if (a === 'activity-capabilities') return caps(); const d = detail(); d.application.publish.screenshots = Array.from({ length: 11 }, (_, n) => ({ path: ORIGINAL + n, signed_url: null, error: 'sign_failed' })); return d; } });
  await h.select(); await h.page.uploadOriginal(event(0)); assert.equal(h.page.data.images.length, 12); h.page.removeUpload(event(0)); assert.equal(h.page.data.images.length, 11);
  await h.page.confirmPublish(); const payload = h.methods('action').find(c => c.args[0] === 'publication-confirm').args[1]; assert.equal(payload.new_evidence_intents, undefined); assert.equal(payload.screenshots.length, 11);
});

test('native upload controls exist without direct Storage, credentials, raw fingerprints or fake progress', () => {
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); assert.match(xml, /bindtap="chooseOriginal"/); assert.match(xml, /bindtap="checkUpload"/); assert.match(xml, /bindtap="retryUpload"/); assert.match(xml, /bindtap="uploadOriginal"/); assert.match(xml, /<progress/);
  assert.doesNotMatch(xml, /digest_sha1|intent_id|request_id|file_path|&amp;&amp;|<web-view/);
});

test('hide during pre-write inspection returns the preserved file to selected for a new explicit attempt', async () => {
  const wait = gate(); let inspect = 0;
  const h = await loaded({ inspectPublicationFile: async () => ++inspect === 1 ? wait.promise : FILE }); await h.select();
  const sending = h.page.uploadOriginal(event(0)); await tick(); h.page.onHide(); wait.resolve(FILE); await sending;
  await h.page.onShow(); assert.equal(h.page.data.uploads[0].state, 'selected'); assert.equal(h.methods('createPublicationUpload').length, 0);
  await h.page.uploadOriginal(event(0)); assert.equal(h.page.data.uploads[0].state, 'ready');
});

test('status DTO must be normalized and cannot omit the nullable receipt field', async () => {
  let i;
  const h = await loaded({ createPublicationUpload: async (b, f, r) => (i = intent(b, f, r)), transferPublicationFile: async () => { throw Error('timeout'); }, publicationUploadStatus: async p => ({ ...p, state: 'pending', intent: i }) });
  await h.select(); await h.page.uploadOriginal(event(0)); await h.page.checkUpload(event(0));
  assert.equal(h.page.data.uploads[0].canRetry, false); assert.match(h.page.data.uploads[0].error, /状态|回执/);
});

test('403 hides upload state but keeps the immutable RAM record and reentry waits for fresh detail', async () => {
  const h = await loaded({ commitPublicationUpload: async () => { throw Object.assign(Error('forbidden'), { status: 403 }); } }); await h.select(); await h.page.uploadOriginal(event(0));
  assert.equal(h.page.data.view, null); assert.equal(h.page.data.uploads.length, 0); const before = JSON.stringify(h.app._applicationUploads); assert.match(before, /digest_sha1/);
  h.page.onUnload(); const wait = gate();
  const next = harness({ env: h.env, action: async a => a === 'activity-capabilities' ? caps() : wait.promise }); const start = next.start(); await tick();
  assert.equal(next.page.data.uploads.length, 0); await next.page.checkUpload(event(0)); assert.equal(next.methods('publicationUploadStatus').length, 0);
  wait.resolve(detail()); await start; assert.equal(next.page.data.uploads[0].state, 'unknown'); assert.equal(JSON.stringify(next.app._applicationUploads), before);
});

test('new intent cap is nine without truncating existing references; repeated taps and callbacks never duplicate a file', async () => {
  const h = await loaded({ createPublicationUpload: async (b, f, r) => intent(b, f, r, { intent_id: r, path: 'publish/' + APP + '/go-native-evidence-' + r + '.png' }) });
  for (let n = 0; n < 9; n++) { await h.select(); await h.page.uploadOriginal(event(n)); }
  assert.equal(h.page.data.uploads.length, 9); assert.equal(h.page.data.images.length, 10); const count = h.picks.length;
  await h.page.chooseOriginal(); assert.equal(h.picks.length, count); assert.equal(h.page.data.canChoose, false);
  const other = await loaded(); const first = other.page.chooseOriginal(); await other.page.chooseOriginal(); assert.equal(other.picks.length, 1);
  other.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path, name: FILE.name }] }); await first;
  other.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path, name: FILE.name }] }); assert.equal(other.page.data.uploads.length, 1);
});

test('late upload responses cannot cross same-user revision or changed scope and cannot log out a new identity', async () => {
  for (const kind of ['revision', 'user', 'shop']) {
    const wait = gate(); const h = await loaded({ createPublicationUpload: async () => wait.promise }); await h.select(); const sending = h.page.uploadOriginal(event(0)); await tick();
    h.env.revision++; if (kind === 'user') h.env.current = { ...h.env.current, userId: ID }; if (kind === 'shop') h.env.current = { ...h.env.current, shop: { id: 'other' } };
    wait.reject(Object.assign(Error('old401'), { status: 401 })); await sending;
    assert.ok(h.env.current); assert.equal(h.page.data.images.length, 0); assert.equal(h.methods('transferPublicationFile').length, 0);
    assert.ok(Object.keys(h.app._applicationUploads).length);
  }
});

test('refresh or old-evidence preview cannot interrupt a live upload by replacing its authority', async () => {
  const wait = gate(); let i;
  const h = await loaded({ createPublicationUpload: async (b, f, r) => { i = intent(b, f, r); return wait.promise; } });
  await h.select(); const sending = h.page.uploadOriginal(event(0)); await tick();
  const reads = h.methods('action').length; await h.page.refresh(); await h.page.previewEvidence(event(0)); h.page.onNote(ev('不能并发修改'));
  assert.equal(h.methods('action').length, reads); assert.equal(h.page.data.note, '原备注');
  wait.resolve(i); await sending; assert.equal(h.page.data.uploads[0].state, 'ready');
});

test('publication timeout freezes new evidence IDs across unload and reentry without rebuilding the payload', async () => {
  let original;
  const h = await loaded({ action: async (a, p) => { if (a === 'activity-capabilities') return caps(); if (a === 'publication-confirm') { original = JSON.parse(JSON.stringify(p)); throw Error('publication timeout'); } return detail(); } });
  await h.select(); await h.page.uploadOriginal(event(0)); await h.page.confirmPublish();
  assert.deepEqual(original.new_evidence_intents, [ID]); h.page.onUnload();
  const next = await loaded({ env: h.env, action: async a => a === 'activity-capabilities' ? caps() : a === 'publication-confirm-status' ? { state: 'not_found' } : detail() });
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.canChoose, false);
  await next.page.reconcile(); await next.page.retrySame();
  const retry = next.methods('action').find(c => c.args[0] === 'publication-confirm').args[1];
  assert.equal(JSON.stringify(retry), JSON.stringify(original));
  assert.equal(next.methods('createPublicationUpload').length, 0); assert.equal(next.methods('commitPublicationUpload').length, 0);
});

test('invalid preview signatures do not lose verified paths or leak them into upload RAM', async () => {
  const h = await loaded({ commitPublicationUpload: async i => verified(i, { preview: { path: i.path, signed_url: 'https://foreign.test/private?token=bad', error: null } }) });
  await h.select(); await h.page.uploadOriginal(event(0));
  assert.equal(h.page.data.images.at(-1).available, false); assert.equal(h.page.data.uploads[0].state, 'ready');
  assert.doesNotMatch(JSON.stringify(h.app._applicationUploads), /signed_url|foreign.test|token=|sha256/);
});

test('original selected filename survives local fingerprint inspection and is not renamed to the temp basename', async () => {
  const h = await loaded(); const selecting = h.page.chooseOriginal();
  h.picks[0].success({ tempFiles: [{ tempFilePath: FILE.file_path, name: '商品原图.png' }] }); await selecting;
  await h.page.uploadOriginal(event(0));
  assert.equal(h.page.data.uploads[0].name, '商品原图.png'); assert.equal(h.methods('transferPublicationFile')[0].args[1].name, '商品原图.png');
});

test('invalid restored RAM remains fail-closed on repeated reads and cannot open a new picker', async () => {
  const first = await loaded({ createPublicationUpload: async () => { throw Error('timeout'); } }); await first.select(); await first.page.uploadOriginal(event(0)); first.page.onUnload();
  const key = Object.keys(first.app._applicationUploads)[0], records = first.app._applicationUploads[key], id = Object.keys(records)[0];
  records[id] = { ...records[id], binding: { ...records[id].binding, activity_id: APP } };
  const h = await loaded({ env: first.env });
  const choosing = h.page.chooseOriginal(); if (h.picks.length) h.picks[0].fail({ errMsg: 'chooseMedia:fail cancel' }); await choosing;
  assert.equal(h.picks.length, 0); assert.equal(h.page.data.verified, false);
  await h.page.refresh(); await h.page.chooseOriginal();
  assert.equal(h.picks.length, 0); assert.equal(h.page.data.view, null); assert.equal(h.page.data.canSubmit, false); assert.match(h.page.data.error, /匹配/);
});

test('unsent original can be explicitly removed during version conflict so latest reload remains an explicit modal', async () => {
  let latest = false;
  const h = await loaded({ manualModal: true, action: async a => { if (a === 'activity-capabilities') return caps(); const d = detail(); if (latest) d.version = V2; return d; } });
  h.page.onNote(ev('冲突时保留草稿')); await h.select(); latest = true; await h.page.refresh();
  assert.equal(h.page.data.conflict, true); await h.page.uploadOriginal(event(0)); assert.equal(h.methods('inspectPublicationFile').length, 0);
  await h.page.reloadLatest(); assert.equal(h.modals.length, 0, 'included unsent file must be dealt with explicitly');
  const before = h.calls.length; h.page.removeUpload(event(0));
  assert.equal(h.page.data.uploads.length, 0); assert.equal(h.calls.length, before, 'local omission must not make a remote call');
  assert.equal(h.page.data.note, '冲突时保留草稿'); assert.equal(h.page.data.canSubmit, false);
  const cancelled = h.page.reloadLatest(); assert.equal(h.modals.length, 1); h.modals[0].success({ confirm: false }); await cancelled;
  assert.equal(h.page.data.conflict, true); assert.equal(h.calls.length, before);
  const reload = h.page.reloadLatest(); assert.equal(h.modals.length, 2); h.modals[1].success({ confirm: true }); await reload;
  assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.note, '原备注'); assert.equal(h.page.data.canSubmit, true);
  assert.deepEqual(h.calls.slice(before).map(c => c.args[0]), ['activity-capabilities', 'application-detail']);
});

test('ready and terminal references can be omitted in conflict without remote mutation or erasing upload RAM', async () => {
  for (const terminal of [false, true]) {
    let latest = false, i;
    const h = await loaded({ action: async a => { if (a === 'activity-capabilities') return caps({ can_upload_evidence: !latest }); const d = detail(); if (latest) d.version = V2; return d; }, createPublicationUpload: async (b, f, r) => (i = intent(b, f, r)), transferPublicationFile: async value => terminal ? Promise.reject(Error('timeout')) : { transferred: true, intent_id: value.intent_id, path: value.path }, publicationUploadStatus: async p => ({ ...p, state: 'expired', intent: i, receipt: null }) });
    await h.select(); await h.page.uploadOriginal(event(0)); if (terminal) await h.page.checkUpload(event(0));
    latest = true; await h.page.refresh(); assert.equal(h.page.data.conflict, true);
    const before = h.calls.length; h.page.removeUpload(event(0));
    assert.equal(h.page.data.uploads[0].included, false); assert.equal(h.page.data.images.length, 1); assert.equal(h.calls.length, before);
    const records = Object.values(h.app._applicationUploads)[0]; assert.equal(Object.keys(records).length, 1); assert.equal(Object.values(records)[0].included, false);
    await h.page.reloadLatest(); assert.equal(h.page.data.conflict, false);
  }
});

test('explicit local removal still rejects hidden, unverified, unauthorized, pending and in-flight contexts', async () => {
  for (const boundary of ['hide', 'unload', 'unverified', 'unauthorized', 'pending', 'confirmed', 'modal', 'read', 'write', 'upload']) {
    const h = await loaded(); await h.select();
    if (boundary === 'hide') h.page.onHide();
    if (boundary === 'unload') h.page.onUnload();
    if (boundary === 'unverified') h.page.data.verified = false;
    if (boundary === 'unauthorized') h.page._authorized = false;
    for (const [name, field] of [['pending', '_pending'], ['confirmed', '_confirmed'], ['modal', '_modalFlight'], ['read', '_readFlight'], ['write', '_writeFlight'], ['upload', '_uploadFlight']]) if (boundary === name) h.page[field] = {};
    const before = h.calls.length; h.page.removeUpload(event(0));
    assert.equal(h.calls.length, before); if (boundary !== 'unload') assert.equal(h.page._uploads.length, 1, boundary);
  }
});

test('unknown uploads cannot be omitted in conflict, including a terminal record whose later status read failed', async () => {
  let latest = false, failed = false, i;
  const h = await loaded({ action: async a => { if (a === 'activity-capabilities') return caps(); const d = detail(); if (latest) d.version = V2; return d; }, createPublicationUpload: async (b, f, r) => (i = intent(b, f, r)), transferPublicationFile: async () => { throw Error('timeout'); }, publicationUploadStatus: async p => { if (failed) throw Error('status timeout'); return { ...p, state: 'expired', intent: i, receipt: null }; } });
  await h.select(); await h.page.uploadOriginal(event(0)); latest = true; await h.page.refresh();
  h.page.removeUpload(event(0)); assert.equal(h.page.data.uploads[0].included, true);
  await h.page.checkUpload(event(0)); failed = true; await h.page.checkUpload(event(0));
  assert.equal(h.page.data.uploads[0].state, 'unknown'); assert.equal(h.page.data.uploads[0].canRemove, false);
  const before = h.calls.length; h.page.removeUpload(event(0)); assert.equal(h.page.data.uploads[0].included, true); assert.equal(h.calls.length, before);
});
