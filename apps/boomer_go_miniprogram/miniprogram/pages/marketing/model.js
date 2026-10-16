const { supabaseUrl } = require('../../config');

function text(value) { return typeof value === 'string' ? value : ''; }
function scopeKey(session) {
  const user = session.get();
  return user ? JSON.stringify([user.userId, user.shop && user.shop.id, user.scopeVersion, typeof session.revision === 'function' ? session.revision() : null]) : '';
}
function mediaSource(value) {
  const url = text(value);
  if (!url) return { url: '', error: '' };
  const match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^?#]*)(\?[^#]*)?$/i.exec(url);
  if (!match) return { url: '', error: '素材地址未通过原文件安全检查' };
  const host = match[1].toLowerCase();
  const storageHost = supabaseUrl.replace(/^https:\/\//, '').replace(/\/$/, '').toLowerCase();
  let path, query;
  try { path = decodeURIComponent(match[2]); query = decodeURIComponent(match[3] || ''); }
  catch (_) { return { url: '', error: '素材地址格式异常' }; }
  const ownStorage = host === storageHost && /^\/storage\/v1\/object\/(public|sign)\//.test(path);
  const service = ['ai.boomeroff.com', 'ark-content-generation-cn-beijing.tos-cn-beijing.volces.com'].includes(host);
  if ((!ownStorage && !service) || path.split('/').includes('..') || /[\\\s]/.test(url + path)) return { url: '', error: '素材来源尚未验证，请刷新或联系管理员' };
  if (path.includes('/render/image/') || /[?&](width|height|quality|resize|format)=/i.test(query)) return { url: '', error: '这是预览转换文件，不能作为原文件领取' };
  return { url, error: '' };
}
function checked(value, fallback) {
  if (!value || value.error || value.ok === false || value.success === false) {
    throw new Error(text(value && value.error) || fallback);
  }
  return value;
}
function copyFrom(value) {
  if (!value || typeof value !== 'object') return { title: '', body: '', tags: [], fullText: '' };
  const title = text(value.title || value.cover_title);
  const body = text(value.body || value.caption || value.douyin_caption);
  const tags = (Array.isArray(value.hashtags) ? value.hashtags : Array.isArray(value.topics) ? value.topics : []).filter(value => typeof value === 'string');
  return { title, body, tags, fullText: [title, body, tags.join(' ')].filter(Boolean).join('\n\n') };
}
function assetView(row) {
  const meta = row.meta || {};
  let copy = copyFrom(meta.video_copy);
  if (!copy.fullText) copy = copyFrom(meta.publish_copy);
  if (row.kind === 'copy') {
    try {
      const parsed = JSON.parse(text(row.output_text));
      copy = copyFrom(Array.isArray(parsed) ? parsed[0] : parsed);
    } catch (_) {
      const title = meta.source === 'manual_upload' && Array.isArray(meta.candidates) ? text(meta.candidates[0] && meta.candidates[0].title) : '';
      const body = text(row.output_text);
      copy = { title, body, tags: [], fullText: [title, body].filter(Boolean).join('\n\n') };
    }
  }
  const source = mediaSource(row.output_url);
  const cover = mediaSource(meta.poster_url || meta.cover_url || row.cover_url);
  const sourceMessages = {
    provider_url_not_persisted: '原文件尚未持久化，供应商临时链接不能作为成片领取，请联系管理员处理',
    storage_not_accessible: '当前账号无权读取原文件，请确认员工权限或联系管理员',
    storage_missing: '云端原文件缺失，请刷新核对或联系管理员',
    signed_url_expired: '原文件签名链接已过期，请刷新重新获取，暂不能下载',
    source_path_mismatch: '原文件存储路径与授权素材不一致，已停止领取，请联系管理员',
  };
  const sourceCode = text(row.source_error);
  const sourceError = row.source_error ? (Object.prototype.hasOwnProperty.call(sourceMessages, sourceCode) ? sourceMessages[sourceCode] : '原文件暂不可用，请刷新核对或联系管理员') : source.error;
  const coverError = row.cover_error ? (row.cover_error === 'signed_url_expired' ? '封面签名链接已过期，请刷新重新获取，暂不能下载' : '封面暂不可用，请刷新核对或联系管理员') : cover.error;
  const url = sourceError ? '' : source.url;
  const status = meta.expired ? 'expired' : text(meta.status);
  const ready = ['', 'succeeded', 'done', 'completed'].includes(status) && !!url;
  return {
    id: row.id, kind: row.kind, title: text(row.title) || copy.title || text(meta.title || meta.topic) || '未命名素材',
    originalUrl: url, videoUrl: row.kind === 'video' && ready ? url : '', coverUrl: coverError ? '' : cover.url, sourceError, coverError,
    imageUrl: row.kind === 'photo' && ready ? url : '', copyText: copy.fullText, copyTitle: copy.title, copyBody: copy.body, copyTags: copy.tags,
    ready, status, statusLabel: sourceError || (row.kind === 'copy' && copy.fullText && !status ? '文案已保存' : ready ? '可领取' : ({ queued: '排队中', running: '生成中', stitching: '待拼接', failed: '生成失败', expired: '链接已过期', cancelled: '已取消' }[status] || '尚未完成')),
  };
}
function renderView(response) {
  const status = text(response.status) || 'running';
  const video = mediaSource(response.video_url);
  const cover = mediaSource(response.cover_url);
  const videoUrl = video.url;
  const coverUrl = cover.url;
  let statusLabel = { queued: '排队中', running: '生成中', ready_to_stitch: '分段已生成，等待拼接', stitching: '拼接中', failed: '生成失败', cancelled: '已取消' }[status] || '处理中';
  if (status === 'succeeded') {
    statusLabel = !videoUrl ? '服务未提供成片地址，请刷新核验' : response.cover_status === 'failed' ? '视频已生成，封面失败' : response.cover_status === 'succeeded' && coverUrl ? '已完成' : '视频已生成，封面生成中';
  }
  return { status, statusLabel, videoUrl: status === 'succeeded' ? videoUrl : '', coverUrl, taskError: video.error || cover.error || text(response.error || response.cover_error), progress: response.segment_total > 0 ? `${Number(response.segment_done) || 0} / ${Number(response.segment_total)}` : '' };
}
module.exports = { checked, text, scopeKey, mediaSource, assetView, renderView };
