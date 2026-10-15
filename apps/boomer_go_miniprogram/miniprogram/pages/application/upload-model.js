const model = require('./model');
const FORMATS = ['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'];
const FIELDS = ['shop_id', 'activity_id', 'application_id', 'actor_id', 'request_id', 'intent_id', 'path', 'format', 'byte_size', 'digest_sha1', 'expires_at'];
function policy(value) {
  return !!(value && value.max_bytes === 10485760 && value.max_pending === 9 && value.intent_ttl_seconds === 600 && Array.isArray(value.formats) && value.formats.length === FORMATS.length && FORMATS.every(f => value.formats.includes(f)));
}
function file(row, path) {
  if (!row || row.file_path !== path || !FORMATS.includes(row.format) || !Number.isSafeInteger(row.byte_size) || row.byte_size < 1 || row.byte_size > 10485760 || typeof row.digest_sha1 !== 'string' || !/^[0-9a-f]{40}$/.test(row.digest_sha1) || typeof row.name !== 'string' || !row.name) throw new Error('原图格式、大小或文件指纹未确认（上限 10MiB）');
  return Object.freeze({ file_path: row.file_path, format: row.format, byte_size: row.byte_size, digest_sha1: row.digest_sha1, name: row.name });
}
function fingerprint(file) { return { format: file.format, byte_size: file.byte_size, digest_sha1: file.digest_sha1 }; }
function sameFile(a, b) { return a.file_path === b.file_path && a.format === b.format && a.byte_size === b.byte_size && a.digest_sha1 === b.digest_sha1; }
function intent(row, record) {
  const f = record.file, b = record.binding;
  if (!row || row.shop_id !== b.shop_id || row.activity_id !== b.activity_id || row.application_id !== b.application_id || row.actor_id !== record.actorId || row.request_id !== record.requestId || typeof row.intent_id !== 'string' || !model.UUID.test(row.intent_id) || row.format !== f.format || row.byte_size !== f.byte_size || row.digest_sha1 !== f.digest_sha1 || !model.timestamp(row.expires_at) || typeof row.replay !== 'boolean' || row.path !== 'publish/' + b.application_id + '/go-native-evidence-' + row.intent_id + '.' + f.format) throw new Error('上传意图与申请或原图指纹不匹配，结果待核对');
  if (record.intent && !FIELDS.every(key => record.intent[key] === row[key])) throw new Error('原上传意图已变化，不能替换路径或请求');
  const result = {}; for (const key of FIELDS) result[key] = row[key]; result.replay = row.replay;
  return Object.freeze(result);
}
function verified(row, record) {
  const bound = intent(row, record);
  if (!record.intent || !FIELDS.every(key => bound[key] === record.intent[key]) || !['verified', 'consumed'].includes(row.state) || typeof row.object_id !== 'string' || !model.UUID.test(row.object_id) || typeof row.object_version !== 'string' || !row.object_version.trim() || typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256) || !row.preview || row.preview.path !== bound.path || ![row.preview.signed_url, row.preview.error].every(v => v === null || typeof v === 'string')) throw new Error('服务端尚未确认此原图验证回执');
  return { state: row.state, image: model.image(row.preview, 'publish/' + bound.application_id + '/') };
}
function status(row, record) {
  const b = record.binding;
  if (!row || row.shop_id !== b.shop_id || row.activity_id !== b.activity_id || row.application_id !== b.application_id || row.request_id !== record.requestId || row.intent === undefined || row.receipt === undefined || !['not_found', 'pending', 'uploaded_unverified', 'verified', 'consumed', 'expired', 'object_changed'].includes(row.state)) throw new Error('上传状态与原请求不匹配');
  if (row.state === 'not_found') { if (row.intent !== null || row.receipt !== null) throw new Error('未找到状态回执不匹配'); return { state: row.state }; }
  const bound = intent(row.intent, record);
  const result = { state: row.state, intent: bound };
  if (row.state === 'verified' || row.state === 'consumed') {
    result.verified = verified(row.receipt, Object.assign({}, record, { intent: bound }));
    if (result.verified.state !== row.state) throw new Error('上传验证状态不一致');
  }
  return result;
}
module.exports = { policy, file, fingerprint, sameFile, intent, verified, status };
