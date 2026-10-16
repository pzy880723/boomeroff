const EDITABLE = ['name', 'description', 'voucher_id', 'form_fields', 'status', 'starts_at', 'ends_at', 'min_followers'];
const FIELD_KEYS = ['label', 'type', 'required', 'options', 'placeholder', 'role'];
const TYPES = ['text', 'phone', 'url', 'image', 'textarea', 'select'];
const ROLES = ['profile_screenshot', 'xhs_profile_url'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && Object.prototype.toString.call(value) === '[object Object]';
function check(value, message) { if (!value) { const error = new Error(message); error.code = 'invalid_params'; throw error; } }
function cloneJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value), 'JSON 数值无效'); return value; }
  check(value && (Array.isArray(value) || object(value)) && !ancestors.has(value), '不是完整的 JSON 数据，不能忽略或补空值');
  check(!Object.getOwnPropertySymbols(value).length, 'JSON 不能包含符号属性');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    check(Object.keys(value).length === value.length, 'JSON 数组包含缺项或额外属性');
    result = [];
    for (let i = 0; i < value.length; i++) { check(own(value, i), 'JSON 数组包含缺项'); result.push(cloneJson(value[i], ancestors)); }
  } else {
    result = {};
    Object.keys(value).forEach(key => {
      // Define literal JSON keys without invoking the __proto__ setter.
      Object.defineProperty(result, key, { value: cloneJson(value[key], ancestors), writable: true, enumerable: true, configurable: true });
    });
  }
  ancestors.delete(value); return result;
}
function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && equal(a[key], b[key]));
}
function text(value, max, empty = false) {
  check(typeof value === 'string' && value.indexOf('\0') < 0, '文字必须是有效字符串，不接受空值替代');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); check(next >= 0xdc00 && next <= 0xdfff, '文字编码无效'); }
    else check(code < 0xdc00 || code > 0xdfff, '文字编码无效');
  }
  check(empty || !!value.trim(), '必填文字不能为空');
  check(max == null || Array.from(value).length <= max, '文字超过 ' + max + ' 字，原文未截断'); return value;
}
function fieldsMap(fields) {
  check(Array.isArray(fields), '旧表单不是字段数组，不能自动重建');
  const map = new Map();
  fields.forEach(field => {
    check(object(field) && own(field, 'key'), '表单存在无法识别的字段，不能静默移除');
    text(field.key); check(!map.has(field.key), '表单字段 key 重复'); map.set(field.key, field);
  });
  return map;
}
function known(field) { return TYPES.indexOf(field.type) >= 0 && (!own(field, 'role') || field.role === null || ROLES.indexOf(field.role) >= 0); }
function validateField(field, previous) {
  if (previous && equal(field, previous)) return;
  check(!previous || known(previous), '未知旧字段类型或角色只读，不能自动改型');
  const keys = new Set(Object.keys(field).concat(previous ? Object.keys(previous) : []));
  keys.forEach(key => {
    if (key === 'key') check(!previous || field.key === previous.key, '原字段 key 不可修改');
    else if (FIELD_KEYS.indexOf(key) < 0) check(previous && own(previous, key) === own(field, key) && equal(previous[key], field[key]), '未知字段元数据必须原样保留');
  });
  check(TYPES.indexOf(field.type) >= 0, '字段类型无效'); text(field.label);
  if (own(field, 'required')) check(typeof field.required === 'boolean', '必填设置必须是布尔值');
  if (own(field, 'placeholder')) text(field.placeholder, null, true);
  if (own(field, 'options')) { check(Array.isArray(field.options), '选项必须是原始文字数组'); field.options.forEach(option => text(option)); }
  if (field.type === 'select') check(Array.isArray(field.options) && field.options.length > 0, '选择字段需要至少一个完整选项');
  if (own(field, 'role') && field.role !== null) {
    check(ROLES.indexOf(field.role) >= 0, '字段角色无效');
    check(field.role === 'profile_screenshot' ? field.type === 'image' : field.type === 'text' || field.type === 'url', '字段类型与角色不兼容，请明确调整角色');
  }
}
function validateFields(previous, fields) {
  const old = fieldsMap(previous); fieldsMap(fields);
  fields.forEach(field => validateField(field, old.get(field.key)));
}
function editField(fields, key, patch) {
  const next = cloneJson(fields), old = fieldsMap(next); check(typeof key === 'string' && old.has(key), '指定字段不存在');
  const changes = cloneJson(patch); check(object(changes) && Object.keys(changes).every(name => FIELD_KEYS.indexOf(name) >= 0), '仅可编辑字段标题、类型、必填、选项、提示和角色');
  const field = old.get(key); Object.keys(changes).forEach(name => { field[name] = changes[name]; }); validateFields(fields, next); return next;
}
function addField(fields, field) {
  const next = cloneJson(fields), map = fieldsMap(next), added = cloneJson(field);
  check(object(added) && own(added, 'key'), '新字段缺少稳定 key'); text(added.key); check(!map.has(added.key), '表单字段 key 重复');
  validateField(added, null); next.push(added); return next;
}
function removeField(fields, key) {
  const next = cloneJson(fields), map = fieldsMap(next); check(typeof key === 'string' && map.has(key), '指定字段不存在');
  return next.filter(field => field.key !== key);
}
function moveField(fields, key, index) {
  const next = cloneJson(fields), map = fieldsMap(next); check(typeof key === 'string' && map.has(key), '指定字段不存在');
  check(Number.isInteger(index) && index >= 0 && index < next.length, '字段目标位置无效');
  const from = next.findIndex(field => field.key === key), field = next.splice(from, 1)[0]; next.splice(index, 0, field); return next;
}
function utcDate(year, month, day, hour, minute, second) {
  check(year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59, '日期或时间无效');
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  check(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, '日期不存在'); return date;
}
function instant(value) {
  check(typeof value === 'string', '活动起止时间必须完整');
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  check(parts, '活动时间必须是带时区的有效 ISO 字符串');
  const date = utcDate(...parts.slice(1, 7).map(Number)), zone = parts[8];
  const offset = zone === 'Z' ? 0 : (zone[0] === '+' ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  return { seconds: date.getTime() / 1000 - offset * 60, fraction: parts[7] || '' };
}
function range(startsAt, endsAt) {
  const a = instant(startsAt), b = instant(endsAt), precision = Math.max(a.fraction.length, b.fraction.length);
  check(b.seconds > a.seconds || b.seconds === a.seconds && b.fraction.padEnd(precision, '0') > a.fraction.padEnd(precision, '0'), '结束时间必须晚于开始时间');
}
function shanghaiToISO(date, time) {
  check(typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) && typeof time === 'string' && /^\d\d:\d\d(?::\d\d)?$/.test(time), '请提供完整日期和时间');
  const d = date.split('-').map(Number), t = time.split(':').map(Number), utc = utcDate(d[0], d[1], d[2], t[0], t[1], t[2] || 0);
  return new Date(utc.getTime() - 8 * 3600000).toISOString();
}
function changedPatch(base, draft) {
  const creating = base === null, previous = creating ? {} : cloneJson(base), candidate = cloneJson(draft), patch = {};
  check(object(previous) && object(candidate), '活动草稿必须是对象');
  Object.keys(candidate).forEach(key => {
    if (own(previous, key) && equal(previous[key], candidate[key])) return;
    check(EDITABLE.indexOf(key) >= 0, '不可修改活动身份、审核标志或未知顶层字段');
    let value = candidate[key];
    if (key === 'name') value = text(value).trim(), text(value, 50);
    else if (key === 'description') value = value === null ? null : text(value, null, true).trim() || null;
    if (key === 'description' && value !== null) text(value, 500, true);
    if (key === 'voucher_id') check(typeof value === 'string' && UUID.test(value), '请选择有效的已有优惠券；门店资格由服务器核验');
    if (key === 'min_followers') check(Number.isSafeInteger(value) && value >= 0, '粉丝数要求必须是非负整数，不能自动补零');
    if (key === 'status') check(value === 'active' || value === 'draft', '仅可明确改为上线或草稿，不能重写旧状态');
    if (key === 'starts_at' || key === 'ends_at') instant(value);
    if (key === 'form_fields') validateFields(own(previous, key) ? previous[key] : [], value);
    if (!own(previous, key) || !equal(previous[key], value)) patch[key] = value;
  });
  if (creating) { text(patch.name, 50); check(typeof patch.voucher_id === 'string' && UUID.test(patch.voucher_id), '新活动需要有效的已有优惠券'); }
  if (creating || own(patch, 'starts_at') || own(patch, 'ends_at')) range(own(patch, 'starts_at') ? patch.starts_at : previous.starts_at, own(patch, 'ends_at') ? patch.ends_at : previous.ends_at);
  return patch;
}
module.exports = { cloneJson, editField, addField, removeField, moveField, changedPatch, shanghaiToISO };
