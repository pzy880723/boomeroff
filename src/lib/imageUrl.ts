// 把 Supabase Storage 的公开图片 URL 改写为按需变换的 CDN 缩略图。
// 仅对自家 storage 的 /object/public/ URL 生效，其它 URL 原样返回。
// 列表页用 thumbUrl(url, 480)，详情/全屏看原图。
export function thumbUrl(
  url: string | null | undefined,
  width = 480,
  quality = 72,
): string | null {
  if (!url) return null;
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/object/public/', '/render/image/public/');
  // resize=contain：只按宽度等比缩放，保留完整画面，永不裁剪
  return `${base}?width=${width}&quality=${quality}&resize=contain`;
}
