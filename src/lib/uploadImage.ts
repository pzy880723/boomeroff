// 上传前客户端压缩。
// 默认 1600px / 0.82(高清场景,例如修图);可传 preset 'thumb' 用于配图(给 AI 看图,不需要清晰度)。

export type CompressOptions = { maxWidth?: number; quality?: number; preset?: 'thumb' | 'hd' };

const PRESETS = {
  hd: { maxWidth: 1600, quality: 0.82, minSize: 300 * 1024 },
  thumb: { maxWidth: 900, quality: 0.72, minSize: 120 * 1024 },
} as const;

export async function compressForUpload(
  input: File | Blob,
  optsOrMaxWidth: CompressOptions | number = {},
  legacyQuality?: number,
): Promise<Blob> {
  // 解析参数:兼容老签名 compressForUpload(file, 1600, 0.82)
  let maxWidth: number;
  let quality: number;
  let minSize: number;
  if (typeof optsOrMaxWidth === 'number') {
    maxWidth = optsOrMaxWidth;
    quality = legacyQuality ?? 0.82;
    minSize = 300 * 1024;
  } else {
    const preset = PRESETS[optsOrMaxWidth.preset ?? 'hd'];
    maxWidth = optsOrMaxWidth.maxWidth ?? preset.maxWidth;
    quality = optsOrMaxWidth.quality ?? preset.quality;
    minSize = preset.minSize;
  }

  if (input.type && !input.type.startsWith('image/')) return input;
  if (input.type === 'image/gif') return input;
  if (input.size <= minSize) return input;

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
    return blob.size < input.size ? blob : input;
  } catch (e) {
    console.warn('[compressForUpload] failed, fallback to original:', e);
    return input;
  }
}

export const UPLOAD_CACHE_OPTS = { cacheControl: '604800', upsert: false as const };
