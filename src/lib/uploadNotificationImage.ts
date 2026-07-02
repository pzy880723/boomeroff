import { supabase } from '@/integrations/supabase/client';

// 通知/资讯 banner 复用公开的 product-images bucket
// (原 notification-images bucket 是私有的,签名 URL 会过期,索性统一放公开桶)
const BUCKET = 'product-images';
const PREFIX = 'notification-banners';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadNotificationImage(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('只支持图片文件');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('图片过大，请压缩至 5MB 以内');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${PREFIX}/${userId}/${crypto.randomUUID()}.${ext || 'jpg'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  });
  if (error) throw new Error(error.message || '上传失败');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('取图失败');
  return data.publicUrl;
}
