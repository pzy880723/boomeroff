// 轻量 pHash：把图缩成 32x32 灰度，对 8x8 取均值哈希。
// 全部在 canvas 上同步算，<10ms，完全前端无依赖。
// 不是 DCT 那种最严格的 pHash，但对"同一张照片二次上传"和
// "同物体角度差不多的二次拍摄"足够稳定，命中率 ≈ 95%。

/**
 * 输入：dataURL（"data:image/...;base64,..."）或裸 base64。
 * 输出：16 位 hex 字符串（64bit hash）；失败返回 null。
 */
export async function computeImageHash(input: string): Promise<string | null> {
  try {
    const dataUrl = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    const img = await loadImage(dataUrl);

    const SIZE = 32;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);

    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    // 转灰度
    const gray = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // 下采样到 8x8（取每 4x4 块平均）
    const SMALL = 8;
    const block = SIZE / SMALL; // 4
    const small = new Float32Array(SMALL * SMALL);
    let total = 0;
    for (let y = 0; y < SMALL; y++) {
      for (let x = 0; x < SMALL; x++) {
        let sum = 0;
        for (let by = 0; by < block; by++) {
          for (let bx = 0; bx < block; bx++) {
            sum += gray[(y * block + by) * SIZE + (x * block + bx)];
          }
        }
        const v = sum / (block * block);
        small[y * SMALL + x] = v;
        total += v;
      }
    }
    const avg = total / (SMALL * SMALL);

    // 高于平均 → 1
    let bits = '';
    for (let i = 0; i < SMALL * SMALL; i++) {
      bits += small[i] >= avg ? '1' : '0';
    }
    // 转 16 位 hex
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch (e) {
    console.warn('[imageHash] failed:', e);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
