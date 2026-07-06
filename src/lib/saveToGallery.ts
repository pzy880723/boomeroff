// 一键保存到系统相册:
// - 原生 App(Capacitor)→ @capacitor-community/media 写入相册
// - 浏览器 → 走传统 <a download>
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result || '');
      // 去掉 data:*/*;base64, 前缀
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export type GalleryKind = 'video' | 'image';

export interface SaveToGalleryResult {
  ok: boolean;
  target: 'gallery' | 'download';
  error?: string;
}

/**
 * 把 blob 保存到系统相册(原生)或触发浏览器下载(Web)。
 * 图片支持 jpg/png/webp,视频支持 mp4。
 */
export async function saveToGallery(
  blob: Blob,
  filename: string,
  kind: GalleryKind,
): Promise<SaveToGalleryResult> {
  if (!Capacitor.isNativePlatform()) {
    try { webDownload(blob, filename); return { ok: true, target: 'download' }; }
    catch (e) { return { ok: false, target: 'download', error: (e as Error)?.message }; }
  }

  try {
    // 先把 blob 写到应用缓存,再让 Media 从文件读入相册(视频体积大,base64 会 OOM)
    const base64 = await blobToBase64(blob);
    const write = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    const fileUri = write.uri; // e.g. file:///...
    if (kind === 'video') {
      await Media.saveVideo({ path: fileUri });
    } else {
      await Media.savePhoto({ path: fileUri });
    }
    // 清理缓存文件
    try { await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }); } catch { /* noop */ }
    return { ok: true, target: 'gallery' };
  } catch (e) {
    return { ok: false, target: 'gallery', error: (e as Error)?.message || '保存到相册失败' };
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
