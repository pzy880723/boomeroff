import { supabase } from '@/integrations/supabase/client';
import { compressForUpload } from '@/lib/uploadImage';

// 通知/资讯 banner 复用公开的 product-images bucket
// (原 notification-images bucket 是私有的,签名 URL 会过期,索性统一放公开桶)
const BUCKET = 'product-images';
const PREFIX = 'notification-banners';
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 原图上限 20MB,压缩后一般 <300KB

export async function uploadNotificationImage(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('只支持图片文件');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('图片过大，请选择 20MB 以内的图片');
  }

  // 客户端压缩:1600px 长边 + JPEG q=0.82,GIF 原样上传
  const blob = await compressForUpload(file, { preset: 'hd' });
  const ext = blob.type === 'image/jpeg'
    ? 'jpg'
    : (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${PREFIX}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '31536000', // 一年,配 UUID 文件名可放心长缓存
    upsert: true,
    contentType: blob.type || file.type || 'image/jpeg',
  });
  if (error) throw new Error(error.message || '上传失败');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('取图失败');
  return data.publicUrl;
}
