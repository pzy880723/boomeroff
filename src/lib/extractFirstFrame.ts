// 从视频 Blob 抽出 ~0.5s 处的首帧,返回 JPEG Blob。失败返回 null。
export async function extractFirstFrame(videoBlob: Blob, atSec = 0.5, quality = 0.72): Promise<Blob | null> {
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
        const t = Math.min(atSec, Math.max(0, (video.duration || 1) - 0.05));
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
