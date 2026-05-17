// 上传前客户端压缩：避免把 5MB 原图扔到 storage。
// 接受 File/Blob，返回压缩后的 Blob（image/jpeg）。
// 默认 1600px 宽 + 0.82 质量，约 200~400KB。

export async function compressForUpload(
  input: File | Blob,
  maxWidth = 1600,
  quality = 0.82,
): Promise<Blob> {
  // 非图片直接原样返回
  if (input.type && !input.type.startsWith('image/')) return input;
  // gif 不压（保留动画）
  if (input.type === 'image/gif') return input;
  // 已经很小就别折腾
  if (input.size <= 300 * 1024) return input;

  try {
    const url = URL.createObjectURL(input);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const ratio = Math.min(maxWidth / img.width, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return input; }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise(res =>
      canvas.toBlob(b => res(b), 'image/jpeg', quality),
    );
    if (!blob) return input;
    // 压完反而更大就用原图
    return blob.size < input.size ? blob : input;
  } catch (e) {
    console.warn('[compressForUpload] failed, fallback to original:', e);
    return input;
  }
}

// 统一的上传选项：长缓存（7 天），让重复访问走浏览器缓存
export const UPLOAD_CACHE_OPTS = { cacheControl: '604800', upsert: false as const };
