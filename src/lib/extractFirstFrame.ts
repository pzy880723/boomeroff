// 从视频 Blob 抽帧,返回 JPEG Blob。失败返回 null。
// 默认取视频中段(约 45% 位置),比 0.5s 首帧更能代表内容。
// 传 atSec 可强制到具体秒。
export async function extractFirstFrame(
  videoBlob: Blob,
  atSec?: number,
  quality = 0.72,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(videoBlob);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      const cleanup = () => { URL.revokeObjectURL(url); };
      const fail = () => { cleanup(); resolve(null); };
      video.onloadedmetadata = () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        // 未指定 atSec → 取中段(~45%),固定在 [0.6, 12] 秒之间
        const auto = Math.min(Math.max(dur * 0.45, 0.6), Math.max(0.6, dur - 0.1));
        const t = typeof atSec === 'number'
          ? Math.min(atSec, Math.max(0, dur - 0.05))
          : Math.min(auto, 12);
        video.currentTime = t;
      };
      video.onseeked = () => {
        try {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w || !h) return fail();
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return fail();
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob((b) => { cleanup(); resolve(b); }, 'image/jpeg', quality);
        } catch { fail(); }
      };
      video.onerror = fail;
      setTimeout(fail, 8000);
    } catch { resolve(null); }
  });
}
