interface CompressCameraImageOptions {
  maxWidth: number;
  quality: number;
  timeoutMs?: number;
}

export function compressCameraImage(
  source: string,
  { maxWidth, quality, timeoutMs = 8000 }: CompressCameraImageOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error('没有读取到照片'));
      return;
    }

    const img = new Image();
    let settled = false;
    const finish = (value?: string, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (error) reject(error);
      else resolve(value as string);
    };
    const timer = setTimeout(() => finish(undefined, new Error('照片处理超时，请重拍')), timeoutMs);

    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(undefined, new Error('当前设备无法处理照片'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        finish(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error('照片处理失败'));
      }
    };
    img.onerror = () => finish(undefined, new Error('照片读取失败，请重拍'));
    img.src = source;
  });
}
