// 把任意 dataURL / 远程 URL 缩成小尺寸 JPEG，用于BOOMER 圈瀑布流缩略图。
// 默认 480px 宽，质量 0.78，约 30~80KB。
export async function makeThumbnail(
  src: string,
  maxWidth = 480,
  quality = 0.78,
): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const ratio = Math.min(maxWidth / img.width, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (e) {
    console.warn('[imageThumb] failed:', e);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
