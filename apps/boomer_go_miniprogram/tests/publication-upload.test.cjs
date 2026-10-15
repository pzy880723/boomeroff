const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApi } = require('../miniprogram/shared/api');
const helper = path.join(__dirname, '../miniprogram/shared/publication-upload.js');
const USER = '10000000-0000-4000-8000-000000000001';
const SHOP = '10000000-0000-4000-8000-000000000002';
const ACT = '10000000-0000-4000-8000-000000000003';
const APP = '10000000-0000-4000-8000-000000000004';
const REQ = '10000000-0000-4000-8000-000000000005';
const INTENT = '10000000-0000-4000-8000-000000000006';
const OBJECT = '10000000-0000-4000-8000-000000000007';
const binding = { shop_id: SHOP, activity_id: ACT, application_id: APP };
const digest = 'a'.repeat(40);
const file = { file_path: 'wxfile://tmp/original.jpg', name: 'original.jpg', format: 'jpg', byte_size: 40, digest_sha1: digest };
const intent = () => ({ ...binding, actor_id: USER, request_id: REQ, intent_id: INTENT, format: 'jpg', byte_size: 40, digest_sha1: digest,
  path: `publish/${APP}/go-native-evidence-${INTENT}.jpg`, expires_at: '2026-10-16T23:00:00.000Z', replay: false });
const receipt = () => ({ ...intent(), object_id: OBJECT, object_version: 'object-version-1', sha256: 'b'.repeat(64), state: 'verified', preview: { path: intent().path, signed_url: null, error: 'sign_failed' } });
const bytes = values => Uint8Array.from(values).buffer;
const jpeg = () => bytes([255, 216, 255, 224, ...Array(36).fill(0)]);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness(options = {}) {
  let revision = 1, current = { userId: USER, shop: { id: SHOP }, scopeVersion: 3 };
  const calls = [], uploads = [], reads = [], info = [], progress = [];
  const session = { get: () => current, revision: () => revision, token: () => 'EMPLOYEE_TOKEN', ensureFresh: options.ensureFresh || (async () => {}) };
  const wx = {
    getFileInfo(o) { info.push(o); const value = options.fileInfo ? options.fileInfo(info.length) : { size: 40, digest }; o.success(value); },
    getFileSystemManager: () => ({ readFile(o) { reads.push(o); o.success({ data: options.header || jpeg() }); } }),
    uploadFile(o) { uploads.push(o); if (!options.manualUpload) o.success({ statusCode: 200, data: JSON.stringify({ Key: 'voucher-screenshots/' + intent().path }) }); return { onProgressUpdate(fn) { progress.push(fn); } }; }
  };
  const api = createApi({ wx, config: { supabaseUrl: 'https://project.test', publicKey: 'PUBLIC_KEY' }, session,
    invoke: async (name, body) => { calls.push({ name, body }); return options.transport ? options.transport(name, body) : { data: intent() }; } });
  return { api, wx, calls, uploads, reads, info, progress, change() { revision++; current = { ...current, userId: OBJECT }; }, clearShop() { current = { ...current, shop: null }; }, session };
}

test('native publication uploader exposes the five frozen adapters without direct Storage SDK dependencies', () => {
  const h = harness();
  for (const name of ['inspectPublicationFile', 'createPublicationUpload', 'transferPublicationFile', 'commitPublicationUpload', 'publicationUploadStatus']) assert.equal(typeof h.api[name], 'function', name);
});

test('format detection reads original headers and distinguishes AVIF-compatible HEIF brands', () => {
  assert.ok(fs.existsSync(helper), 'publication upload helper must exist');
  const { detectImageFormat } = require(helper);
  const ascii = value => [...value].map(c => c.charCodeAt(0));
  const ftyp = (major, compatible = []) => bytes([0, 0, 0, 16 + 4 * compatible.length, ...ascii('ftyp' + major), 0, 0, 0, 0, ...ascii(compatible.join(''))]);
  assert.equal(detectImageFormat(jpeg()), 'jpg');
  assert.equal(detectImageFormat(bytes([137, 80, 78, 71, 13, 10, 26, 10])), 'png');
  assert.equal(detectImageFormat(bytes(ascii('GIF89a'))), 'gif');
  assert.equal(detectImageFormat(bytes([...ascii('RIFF'), 12, 0, 0, 0, ...ascii('WEBPVP8 ')])), 'webp');
  assert.equal(detectImageFormat(ftyp('mif1', ['heic'])), 'heic');
  assert.equal(detectImageFormat(ftyp('mif1')), 'heif');
  assert.equal(detectImageFormat(ftyp('mif1', ['avif'])), 'avif');
  assert.equal(detectImageFormat(ftyp('isom')), null);
  assert.equal(detectImageFormat(bytes(ascii('<svg onload=evil>'))), null);
  assert.equal(detectImageFormat(bytes([0, 0, 1, 0, ...ascii('ftypheic')])) , null);
});

test('local inspection uses SHA1 and bounded original bytes without trusting filename or picker size', async () => {
  const h = harness(); assert.equal(typeof h.api.inspectPublicationFile, 'function');
  const value = await h.api.inspectPublicationFile('wxfile://tmp/not-a-jpeg.png');
  assert.equal(value.format, 'jpg'); assert.equal(value.byte_size, 40); assert.equal(value.digest_sha1, digest);
  assert.equal(value.file_path, 'wxfile://tmp/not-a-jpeg.png'); assert.equal(h.uploads.length + h.calls.length, 0);
  assert.equal(h.info.length, 2); assert.ok(h.info.every(o => o.digestAlgorithm === 'sha1'));
  assert.equal(h.reads[0].position, 0); assert.equal(h.reads[0].length, 40); assert.equal(h.reads[0].encoding, undefined);
});

test('invalid, oversized, unsupported and changing local files never reach remote phases', async () => {
  for (const options of [{ fileInfo: () => ({ size: 10485761, digest }) }, { fileInfo: () => ({ size: 40, digest: 'bad' }) },
    { header: bytes([1, 2, 3]) }, { fileInfo: n => ({ size: 40, digest: n === 1 ? digest : 'c'.repeat(40) }) }]) {
    const h = harness(options); assert.equal(typeof h.api.inspectPublicationFile, 'function');
    await assert.rejects(h.api.inspectPublicationFile(file.file_path)); assert.equal(h.calls.length + h.uploads.length, 0);
  }
  const h = harness(); await assert.rejects(h.api.inspectPublicationFile('https://external.test/private.jpg')); assert.equal(h.info.length, 0);
});

test('an inactive view after asynchronous renewal starts no local read or remote create', async () => {
  const wait = deferred(); let active = true;
  const h = harness({ ensureFresh: () => wait.promise }); assert.equal(typeof h.api.inspectPublicationFile, 'function');
  const promise = h.api.inspectPublicationFile(file.file_path, { isActive: () => active }); active = false; wait.resolve();
  await assert.rejects(promise, e => e.code === 'stale_operation'); assert.equal(h.info.length, 0);
  await assert.rejects(h.api.createPublicationUpload(binding, file, REQ, { isActive: () => false }), e => e.code === 'stale_operation'); assert.equal(h.calls.length, 0);
});

test('a hide between the renewal completion and the transport microtask starts no request', async () => {
  let active = true;
  const h = harness({ ensureFresh: async () => { queueMicrotask(() => queueMicrotask(() => { active = false; })); } });
  await assert.rejects(h.api.createPublicationUpload(binding, file, REQ, { isActive: () => active }), e => e.code === 'stale_operation');
  assert.equal(h.calls.length, 0);
});

test('create freezes exact selected-store file identity and returns only the validated intent', async () => {
  const h = harness(); assert.equal(typeof h.api.createPublicationUpload, 'function');
  const result = await h.api.createPublicationUpload(binding, file, REQ);
  assert.deepEqual(result, intent());
  assert.deepEqual(h.calls[0], { name: 'go-mini-api', body: { action: 'publication-upload-intent', params: { ...binding, request_id: REQ, format: 'jpg', byte_size: 40, digest_sha1: digest } } });
  assert.equal(h.calls[0].body.params.file_path, undefined); assert.equal(h.calls[0].body.params.name, undefined);
  await assert.rejects(h.api.createPublicationUpload({ ...binding, shop_id: ACT }, file, REQ)); assert.equal(h.calls.length, 1);
  h.clearShop(); await assert.rejects(h.api.createPublicationUpload(binding, file, REQ)); assert.equal(h.calls.length, 1);
});

test('mismatched intent actor, scope, fingerprint, path or replay flag is not accepted', async () => {
  for (const patch of [{ actor_id: OBJECT }, { activity_id: APP }, { request_id: OBJECT }, { path: 'publish/foreign/file.jpg' }, { format: 'png' }, { digest_sha1: 'c'.repeat(40) }, { replay: 'true' }, { expires_at: 'invalid' }]) {
    const h = harness({ transport: async () => ({ data: { ...intent(), ...patch } }) }); assert.equal(typeof h.api.createPublicationUpload, 'function');
    await assert.rejects(h.api.createPublicationUpload(binding, file, REQ)); assert.equal(h.uploads.length, 0);
  }
});

test('transfer uses only the fixed authenticated project destination, no upsert, and does not claim verification', async () => {
  const h = harness(); assert.equal(typeof h.api.transferPublicationFile, 'function');
  const result = await h.api.transferPublicationFile(intent(), file);
  const upload = h.uploads[0];
  assert.equal(upload.url, 'https://project.test/storage/v1/object/voucher-screenshots/' + intent().path);
  assert.equal(upload.filePath, file.file_path); assert.equal(upload.header.Authorization, 'Bearer EMPLOYEE_TOKEN');
  assert.equal(upload.header.apikey, 'PUBLIC_KEY'); assert.equal(upload.header['x-upsert'], 'false');
  assert.deepEqual(result, { transferred: true, intent_id: INTENT, path: intent().path }); assert.equal(h.calls.length, 0);
});

test('changed local bytes or foreign intent never begin upload and no replacement object is created', async () => {
  for (const options of [{ fileInfo: () => ({ size: 40, digest: 'c'.repeat(40) }) }, {}]) {
    const h = harness(options); assert.equal(typeof h.api.transferPublicationFile, 'function');
    await assert.rejects(h.api.transferPublicationFile(options.fileInfo ? intent() : { ...intent(), application_id: ACT }, file));
    assert.equal(h.uploads.length, 0);
  }
});

test('real upload progress is scoped and stops after hidden view, changed identity or completion', async () => {
  const values = []; let active = true;
  const h = harness({ manualUpload: true }); assert.equal(typeof h.api.transferPublicationFile, 'function');
  const promise = h.api.transferPublicationFile(intent(), file, value => values.push(value), { isActive: () => active });
  await new Promise(r => setImmediate(r));
  h.progress[0]({ progress: 25, totalBytesWritten: 10, totalBytesExpectedToWrite: 40 }); assert.equal(values[0].progress, 25);
  active = false; h.progress[0]({ progress: 75, totalBytesWritten: 30, totalBytesExpectedToWrite: 40 }); assert.equal(values.length, 1);
  h.uploads[0].success({ statusCode: 200, data: JSON.stringify({ Key: 'voucher-screenshots/' + intent().path }) });
  await assert.rejects(promise, e => e.code === 'stale_operation');
});

test('wrong upload receipt and timeout remain failures without automatic transfer retries', async () => {
  for (const mode of ['wrong-key', 'timeout', 'exists']) {
    const h = harness({ manualUpload: true }); assert.equal(typeof h.api.transferPublicationFile, 'function');
    const promise = h.api.transferPublicationFile(intent(), file); await new Promise(r => setImmediate(r));
    if (mode === 'timeout') h.uploads[0].fail({ errMsg: 'timeout' });
    else h.uploads[0].success({ statusCode: mode === 'exists' ? 409 : 200, data: JSON.stringify({ Key: 'voucher-screenshots/foreign.jpg' }) });
    await assert.rejects(promise); assert.equal(h.uploads.length, 1); assert.equal(h.calls.length, 0);
  }
});

test('commit/status bind the original request and preserve verified paths when signing fails', async () => {
  const h = harness({ transport: async (_, body) => ({ data: body.action === 'publication-upload-commit' ? receipt() : { ...binding, request_id: REQ, state: 'verified', intent: intent(), receipt: receipt() } }) });
  assert.equal(typeof h.api.commitPublicationUpload, 'function');
  const verified = await h.api.commitPublicationUpload(intent()); assert.deepEqual(verified, receipt());
  const status = await h.api.publicationUploadStatus({ ...binding, request_id: REQ, intent_id: INTENT }); assert.deepEqual(status.receipt, verified);
  assert.equal(verified.preview.signed_url, null); assert.equal(verified.path, intent().path);
  assert.ok(h.calls.every(c => c.body.params.activity_id === ACT && c.body.params.application_id === APP && c.body.params.request_id === REQ));
  assert.equal(h.calls[0].body.params.sha256, undefined);
});

test('status can find an intent by original request ID after a lost create response and never mutates', async () => {
  const h = harness({ transport: async () => ({ data: { ...binding, request_id: REQ, state: 'not_found', intent: null, receipt: null } }) });
  assert.equal(typeof h.api.publicationUploadStatus, 'function');
  const result = await h.api.publicationUploadStatus({ ...binding, request_id: REQ });
  assert.equal(result.state, 'not_found'); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.action, 'publication-upload-status'); assert.equal(h.uploads.length, 0);
});

test('late response after same-user re-login cannot return another session upload state', async () => {
  const wait = deferred(); const h = harness({ transport: () => wait.promise }); assert.equal(typeof h.api.createPublicationUpload, 'function');
  const promise = h.api.createPublicationUpload(binding, file, REQ); await new Promise(r => setImmediate(r)); h.change(); wait.resolve({ data: intent() });
  await assert.rejects(promise, e => e.code === 'stale_operation'); assert.equal(h.uploads.length, 0);
});

test('raw upload actions require the selected verified working shop', async () => {
  const h = harness(); h.clearShop();
  for (const action of ['publication-upload-intent', 'publication-upload-commit', 'publication-upload-status']) {
    await assert.rejects(h.api.action(action, binding), /授权工作门店/);
  }
  assert.equal(h.calls.length, 0);
});

test('status rejects contradictory state receipts and changed frozen intent expiry', async () => {
  for (const patch of [
    { state: 'verified', receipt: { ...receipt(), state: 'consumed' } },
    { state: 'pending', receipt: receipt() },
    { state: 'verified', receipt: { ...receipt(), expires_at: '2026-10-17T23:00:00.000Z' } }
  ]) {
    const h = harness({ transport: async () => ({ data: { ...binding, request_id: REQ, intent: intent(), receipt: null, ...patch } }) });
    await assert.rejects(h.api.publicationUploadStatus({ ...binding, request_id: REQ }));
  }
});

test('explicit preview exposes upload adapters but cannot read or upload an employee file', async () => {
  const calls = [];
  const { createPreview } = require('../miniprogram/shared/preview');
  const preview = createPreview({ getFileInfo: () => calls.push('read'), uploadFile: () => calls.push('upload') });
  for (const name of ['inspectPublicationFile', 'createPublicationUpload', 'transferPublicationFile', 'commitPublicationUpload', 'publicationUploadStatus']) {
    assert.equal(typeof preview.api[name], 'function', name);
    await assert.rejects(preview.api[name](file.file_path), /示例模式/);
  }
  assert.deepEqual(calls, []);
});
