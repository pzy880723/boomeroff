import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'notification-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadNotificationImage(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('只支持图片文件');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('图片过大，请压缩至 5MB 以内');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${userId}/${crypto.randomUUID()}.${ext || 'jpg'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message || '上传失败');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
