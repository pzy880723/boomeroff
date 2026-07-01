// 把 Supabase Storage 的公开图片 URL 改写为按需变换的 CDN 缩略图。
// 仅对自家 storage 的 /object/public/ URL 生效，其它 URL 原样返回。
// Supabase Image Render 会按浏览器 Accept 头自动协商返回 webp/avif，所以不再显式传 format。
// 默认 240 适配九宫格列表(390px 屏 3 列 ≈ 120 CSS px,dpr=2 取 240 物理像素)。
export function thumbUrl(
  url: string | null | undefined,
  width = 240,
  quality = 70,
): string | null {
  if (!url) return null;
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/object/public/', '/render/image/public/');
  // resize=contain：只按宽度等比缩放，保留完整画面，永不裁剪
  return `${base}?width=${width}&quality=${quality}&resize=contain`;
}

// 配合 <img srcset sizes> 给高 dpr 屏精确取图。baseWidth 为 CSS 宽度。
export function thumbSrcSet(
  url: string | null | undefined,
  baseWidth = 120,
  quality = 70,
): string | undefined {
  if (!url) return undefined;
  if (!url.includes('/storage/v1/object/public/')) return undefined;
  const u1 = thumbUrl(url, baseWidth, quality);
  const u2 = thumbUrl(url, baseWidth * 2, quality);
  const u3 = thumbUrl(url, baseWidth * 3, quality);
  if (!u1 || !u2 || !u3) return undefined;
  return `${u1} 1x, ${u2} 2x, ${u3} 3x`;
}

// 头像专用：走 CDN cover 裁剪，保证圆形头像不变形，默认 144 适配 72px @ dpr2。
export function avatarUrl(
  url: string | null | undefined,
  size = 144,
  quality = 75,
): string | null {
  if (!url) return null;
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/object/public/', '/render/image/public/');
  return `${base}?width=${size}&height=${size}&quality=${quality}&resize=cover`;
}

