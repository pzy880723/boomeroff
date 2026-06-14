// 营销中心共用上传工具
// - 并发上传(Promise.all),浏览器自己会限制连接数
// - 支持 onProgress 实时回调,UI 可以画压缩中/上传中/✓
// - 支持 preset:配图给 AI 看(thumb,~120KB),修图给后端(hd)
import { supabase } from '@/integrations/supabase/client';
import { compressForUpload, UPLOAD_CACHE_OPTS, type CompressOptions } from '@/lib/uploadImage';

export type UploadStage = 'queued' | 'compressing' | 'uploading' | 'done' | 'error';
export type UploadEvent = { index: number; stage: UploadStage; url?: string; error?: string };

export type UploadOptions = {
  preset?: CompressOptions['preset'];
  onProgress?: (e: UploadEvent) => void;
};

async function uploadOne(
  userId: string,
  file: File,
  index: number,
  preset: CompressOptions['preset'] | undefined,
  onProgress?: (e: UploadEvent) => void,
): Promise<string> {
  try {
    onProgress?.({ index, stage: 'compressing' });
    const blob = await compressForUpload(file, { preset: preset ?? 'hd' });
    onProgress?.({ index, stage: 'uploading' });
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/marketing/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext === 'png' ? 'png' : 'jpg'}`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      ...UPLOAD_CACHE_OPTS,
      contentType: blob.type || 'image/jpeg',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    onProgress?.({ index, stage: 'done', url: data.publicUrl });
    return data.publicUrl;
  } catch (e: any) {
    onProgress?.({ index, stage: 'error', error: e?.message || '上传失败' });
    throw e;
  }
}

/** 并发上传一组图;返回成功的 URL 列表(顺序与传入一致,失败的位置为 null) */
export async function uploadMarketingImages(
  userId: string,
  files: File[],
  opts: UploadOptions = {},
): Promise<(string | null)[]> {
  const results = await Promise.allSettled(
    files.map((f, i) => uploadOne(userId, f, i, opts.preset, opts.onProgress)),
  );
  return results.map(r => (r.status === 'fulfilled' ? r.value : null));
}
