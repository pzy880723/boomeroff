const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FORMATS = ['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'];
const MAX_BYTES = 10 * 1024 * 1024;
const uuid = value => typeof value === 'string' && UUID.test(value);
const failure = (message, code = 'upload_receipt_mismatch') => Object.assign(new Error(message), { code });
const sameFile = (a, b) => a.format === b.format && a.byte_size === b.byte_size && a.digest_sha1 === b.digest_sha1;
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

function detectImageFormat(buffer) {
  const b = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : null;
  if (!b) return null;
  const ascii = (offset, length) => Array.from(b.slice(offset, offset + length)).map(n => String.fromCharCode(n)).join('');
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)) return 'png';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'gif';
  if (b.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 4))) return 'webp';
  if (b.length < 16 || ascii(4, 4) !== 'ftyp') return null;
  const size = b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3];
  if (size < 16 || size > b.length || size % 4) return null;
  const brands = [ascii(8, 4)];
  for (let i = 16; i < size; i += 4) brands.push(ascii(i, 4));
  if (brands.some(v => ['avif', 'avis'].includes(v))) return 'avif';
  if (brands.some(v => ['heic', 'heix', 'hevc', 'hevx'].includes(v))) return 'heic';
  return brands.some(v => ['mif1', 'msf1'].includes(v)) ? 'heif' : null;
}

function createPublicationUploads({ wx, config, session, transport, snapshot, settled, ensureFresh }) {
  function active(before, options) {
    const after = snapshot();
    if (before.revision !== after.revision || before.identity !== after.identity || (options && options.isActive && !options.isActive())) throw failure('当前页面或员工身份已变化，旧上传已停止后续步骤', 'stale_operation');
  }
  async function ready(before, options) { active(before, options); await ensureFresh(before); active(before, options); }
  async function wait(before, options, promise) { const value = await settled(before, promise); active(before, options); return value; }
  function selected(binding) {
    const user = session.get();
    if (!user || !uuid(user.userId) || !user.shop || !uuid(user.shop.id) || !binding || !uuid(binding.shop_id) || binding.shop_id !== user.shop.id || !uuid(binding.activity_id) || !uuid(binding.application_id)) throw failure('请从当前授权门店的有效申请重新进入', 'invalid_upload_scope');
    return { shop_id: binding.shop_id, activity_id: binding.activity_id, application_id: binding.application_id };
  }
  function fingerprint(value) {
    if (!value || !FORMATS.includes(value.format) || !Number.isSafeInteger(value.byte_size) || value.byte_size < 1 || value.byte_size > MAX_BYTES || typeof value.digest_sha1 !== 'string' || !SHA1.test(value.digest_sha1)) throw failure('原图格式、大小或文件摘要不可用，请重新选择', 'invalid_local_file');
    return { format: value.format, byte_size: value.byte_size, digest_sha1: value.digest_sha1 };
  }
  function intent(row, expected) {
    const scope = selected(expected), user = session.get();
    if (!row || !uuid(row.intent_id) || !uuid(row.request_id) || row.request_id !== expected.request_id || row.actor_id !== user.userId || row.shop_id !== scope.shop_id || row.activity_id !== scope.activity_id || row.application_id !== scope.application_id || typeof row.replay !== 'boolean' || !iso(row.expires_at)) throw failure('上传意图回执与当前申请不匹配');
    const f = fingerprint(row);
    if ((expected.intent_id && row.intent_id !== expected.intent_id) || (expected.format && !sameFile(f, expected)) || row.path !== `publish/${scope.application_id}/go-native-evidence-${row.intent_id}.${f.format}`) throw failure('原图或存储位置与冻结意图不匹配');
    return Object.assign(scope, { actor_id: row.actor_id, intent_id: row.intent_id, request_id: row.request_id, path: row.path }, f, { expires_at: row.expires_at, replay: row.replay });
  }
  function preview(row, path) {
    let signed = null, error = row && typeof row.error === 'string' ? row.error : 'sign_failed';
    const prefix = String(config.supabaseUrl || '').replace(/\/$/, '') + '/storage/v1/object/sign/voucher-screenshots/';
    if (row && row.path === path && row.error === null && typeof row.signed_url === 'string' && row.signed_url.startsWith(prefix)) {
      const rest = row.signed_url.slice(prefix.length), mark = rest.indexOf('?');
      try { if (mark > 0 && decodeURIComponent(rest.slice(0, mark)) === path && /^token=[A-Za-z0-9_.-]+$/.test(rest.slice(mark + 1))) { signed = row.signed_url; error = null; } } catch (_) {}
    }
    return { path, signed_url: signed, error };
  }
  function verified(row, expected) {
    const value = intent(row, expected);
    if (!['verified', 'consumed'].includes(row.state) || !uuid(row.object_id) || typeof row.object_version !== 'string' || !row.object_version || row.object_version.length > 200 || typeof row.sha256 !== 'string' || !SHA256.test(row.sha256) || row.expires_at !== expected.expires_at) throw failure('服务器尚未确认该原图的字节与归属');
    return Object.assign(value, { object_id: row.object_id, object_version: row.object_version, sha256: row.sha256, state: row.state, preview: preview(row.preview, value.path) });
  }
  async function request(action, params, before, options) {
    await ready(before, options);
    selected(params);
    active(before, options);
    const result = await wait(before, options, transport('go-mini-api', { action, params }));
    return result && result.data !== undefined ? result.data : result;
  }
  async function inspectPublicationFile(filePath, options) {
    const before = snapshot();
    if (typeof filePath !== 'string' || !/^(?:wxfile:\/\/|file:\/\/|https?:\/\/tmp\/|\/)/.test(filePath)) throw failure('请选择本地原图', 'invalid_local_file');
    await ready(before, options);
    const user = session.get();
    if (!user || !uuid(user.userId) || !user.shop || !uuid(user.shop.id)) throw failure('请先选择当前授权工作门店', 'invalid_upload_scope');
    if (typeof wx.getFileInfo !== 'function') throw failure('当前微信无法核对原图摘要，请更新微信后重试', 'file_fingerprint_unavailable');
    const readInfo = () => { active(before, options); return wait(before, options, new Promise((resolve, reject) => wx.getFileInfo({ filePath, digestAlgorithm: 'sha1', success: resolve, fail: () => reject(failure('本地原图读取失败，请重新选择', 'invalid_local_file')) }))); };
    const first = await readInfo();
    const firstDigest = typeof first.digest === 'string' ? first.digest.toLowerCase() : '';
    if (!Number.isSafeInteger(first.size) || first.size < 1 || first.size > MAX_BYTES || !SHA1.test(firstDigest)) throw failure('原图需在 10MB 以内且能够读取完整文件摘要', 'invalid_local_file');
    active(before, options);
    const header = await wait(before, options, new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath, position: 0, length: Math.min(first.size, 512), success: resolve, fail: () => reject(failure('原图内容读取失败，请重新选择', 'invalid_local_file')) })));
    const format = detectImageFormat(header.data);
    if (!format) throw failure('暂不支持此原图格式，请选择 JPEG、PNG、WebP、GIF、HEIC/HEIF 或 AVIF', 'unsupported_format');
    const last = await readInfo();
    if (last.size !== first.size || typeof last.digest !== 'string' || last.digest.toLowerCase() !== firstDigest) throw failure('本地原图已变化，请重新选择', 'local_file_changed');
    return { file_path: filePath, name: Array.from(filePath.split('/').pop().replace(/[\x00-\x1f\x7f]/g, '') || 'image.' + format).slice(-120).join(''), format, byte_size: first.size, digest_sha1: firstDigest };
  }
  async function createPublicationUpload(binding, file, requestId, options) {
    const before = snapshot(), scope = selected(binding), f = fingerprint(file);
    if (!uuid(requestId)) throw failure('缺少原图请求编号', 'invalid_upload_scope');
    const params = Object.assign(scope, { request_id: requestId }, f);
    const row = await request('publication-upload-intent', params, before, options);
    return intent(row, params);
  }
  async function transferPublicationFile(frozen, file, onProgress, options) {
    const before = snapshot(), value = intent(frozen, frozen);
    const original = await inspectPublicationFile(file && file.file_path, options);
    if (!sameFile(original, value) || !sameFile(original, file)) throw failure('本地原图与原请求不同，不能覆盖或重新使用该意图', 'local_file_changed');
    await ready(before, options);
    const origin = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin) || !session.token()) throw failure('原图上传地址或员工登录不可用', 'invalid_upload_scope');
    const key = 'voucher-screenshots/' + value.path;
    active(before, options);
    return wait(before, options, new Promise((resolve, reject) => {
      let finished = false;
      const task = wx.uploadFile({ url: origin + '/storage/v1/object/' + key, filePath: original.file_path, name: 'file', timeout: 120000,
        header: { Authorization: 'Bearer ' + session.token(), apikey: config.publicKey, 'x-upsert': 'false' }, formData: { cacheControl: '3600' },
        success(response) {
          finished = true;
          if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(failure('原图传输尚未确认，请先核对原请求状态', 'upload_unconfirmed'), { status: response.statusCode }));
          let body; try { body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data; } catch (_) {}
          if (!body || body.Key !== key) return reject(failure('存储位置未被确认，请先核对原请求状态', 'upload_unconfirmed'));
          resolve({ transferred: true, intent_id: value.intent_id, path: value.path });
        },
        fail() { finished = true; reject(failure('原图传输结果不明，请核对原请求，不要重新创建', 'upload_unconfirmed')); }
      });
      if (task && typeof task.onProgressUpdate === 'function' && typeof onProgress === 'function') task.onProgressUpdate(progress => {
        if (finished) return;
        try { active(before, options); } catch (_) { return; }
        if (!progress || !Number.isFinite(progress.progress) || progress.progress < 0 || progress.progress > 100 || !Number.isSafeInteger(progress.totalBytesWritten) || progress.totalBytesWritten < 0 || !Number.isSafeInteger(progress.totalBytesExpectedToWrite) || progress.totalBytesExpectedToWrite < progress.totalBytesWritten) return;
        onProgress({ progress: progress.progress, totalBytesWritten: progress.totalBytesWritten, totalBytesExpectedToWrite: progress.totalBytesExpectedToWrite });
      });
    }));
  }
  async function commitPublicationUpload(frozen, options) {
    const before = snapshot(), value = intent(frozen, frozen);
    const params = { shop_id: value.shop_id, activity_id: value.activity_id, application_id: value.application_id, request_id: value.request_id, intent_id: value.intent_id };
    return verified(await request('publication-upload-commit', params, before, options), value);
  }
  async function publicationUploadStatus(params, options) {
    const before = snapshot(), scope = selected(params);
    if (!uuid(params.request_id) || (params.intent_id !== undefined && !uuid(params.intent_id))) throw failure('原图核对编号不合法', 'invalid_upload_scope');
    const query = Object.assign(scope, { request_id: params.request_id });
    if (params.intent_id) query.intent_id = params.intent_id;
    const row = await request('publication-upload-status', query, before, options);
    if (!row || row.shop_id !== query.shop_id || row.activity_id !== query.activity_id || row.application_id !== query.application_id || row.request_id !== query.request_id || !['not_found', 'pending', 'uploaded_unverified', 'verified', 'consumed', 'expired', 'object_changed'].includes(row.state)) throw failure('原图核对结果与请求不一致');
    const result = Object.assign({}, scope, { request_id: query.request_id, state: row.state, intent: null, receipt: null });
    if (row.state === 'not_found') { if (row.intent || row.receipt) throw failure('原图核对结果不完整'); return result; }
    result.intent = intent(row.intent, query);
    if (row.receipt) result.receipt = verified(row.receipt, result.intent);
    if (result.receipt && result.receipt.state !== row.state) throw failure('原图核对状态与核验回执不一致');
    if (['verified', 'consumed'].includes(row.state) && !result.receipt) throw failure('原图核验回执缺失，请继续核对原请求');
    return result;
  }
  return { inspectPublicationFile, createPublicationUpload, transferPublicationFile, commitPublicationUpload, publicationUploadStatus };
}

module.exports = { createPublicationUploads, detectImageFormat };
