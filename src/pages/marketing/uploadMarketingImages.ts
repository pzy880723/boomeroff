// 营销中心共用：上传一组图到 product-images，返回 public URL 列表
import { supabase } from '@/integrations/supabase/client';
import { compressForUpload, UPLOAD_CACHE_OPTS } from '@/lib/uploadImage';

export async function uploadMarketingImages(userId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    const blob = await compressForUpload(file);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/marketing/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext === 'png' ? 'png' : 'jpg'}`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      ...UPLOAD_CACHE_OPTS,
      contentType: blob.type || 'image/jpeg',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    out.push(data.publicUrl);
  }
  return out;
}
