import { supabase } from '@/integrations/supabase/client';
import { stitchSegmentUrls } from '@/lib/stitchVideos';
import { extractFirstFrame } from '@/lib/extractFirstFrame';

export function normalizeSegmentUrl(url: string): string {
  if (url.startsWith('/functions/v1/')) return `${import.meta.env.VITE_SUPABASE_URL}${url}`;
  try {
    const u = new URL(url);
    if (u.hostname === 'ark-content-generation-cn-beijing.tos-cn-beijing.volces.com') {
      return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-marketing-video?segment=${encodeURIComponent(url)}`;
    }
  } catch {}
  return url;
}

export async function markMarketingVideoFailed(assetId: string, currentMeta: any, error: string) {
  const nextMeta = { ...(currentMeta || {}), status: 'failed', error };
  delete nextMeta.stitch_progress; delete nextMeta.stitch_stage;
  await supabase.from('marketing_assets' as any).update({ meta: nextMeta }).eq('id', assetId);
  const jobId = currentMeta?.job_id;
  if (jobId) await supabase.from('marketing_video_jobs' as any).update({ status: 'failed', error }).eq('id', jobId);
  return nextMeta;
}

export async function completeMarketingVideoFromSegments({
  userId,
  jobId,
  segmentUrls,
  onProgress,
}: {
  userId: string;
  jobId: string;
  segmentUrls: string[];
  onProgress?: (progress: number, info?: { stage: string; segment: number; total: number }) => void;
}) {
  const { data: asset } = await supabase
    .from('marketing_assets' as any)
    .select('id, meta, created_at')
    .eq('kind', 'video')
    .filter('meta->>job_id', 'eq', jobId)
    .maybeSingle();
  if (!asset) throw new Error('没有找到这个视频任务的素材记录,请重新生成');

  const createdAt = new Date((asset as any).created_at).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 23 * 60 * 60 * 1000) {
    throw new Error('视频分段链接已过期(超过 24 小时),请重新生成');
  }

  await supabase.from('marketing_assets' as any).update({
    meta: { ...((asset as any).meta || {}), status: 'stitching', stage: 'stitching', stitch_progress: 0 },
  }).eq('id', (asset as any).id);

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const authHeaders = accessToken ? {
    Authorization: `Bearer ${accessToken}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  } : undefined;

  const stitchPromise = stitchSegmentUrls(segmentUrls.map(normalizeSegmentUrl), (info) => {
    const pct = Math.round(((info.segment - 1) / Math.max(1, info.total)) * 100);
    onProgress?.(pct, info);
  }, authHeaders ? { init: { headers: authHeaders } } : undefined);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('拼接超时,请重新生成此视频')), 90_000);
  });
  const blob = await Promise.race([stitchPromise, timeoutPromise]);
  const path = `${userId}/${jobId}.mp4`;
  const up = await supabase.storage.from('marketing-videos').upload(path, blob, {
    contentType: 'video/mp4', upsert: true, cacheControl: '31536000',
  });
  if (up.error) throw up.error;
  const signed = await supabase.storage.from('marketing-videos').createSignedUrl(path, 60 * 60 * 24 * 365);
  const url = signed.data?.signedUrl;
  if (!url) throw new Error('生成播放链接失败');

  let posterUrl: string | undefined;
  try {
    const posterBlob = await extractFirstFrame(blob);
    if (posterBlob) {
      const posterPath = `${userId}/posters/${jobId}.jpg`;
      const pu = await supabase.storage.from('marketing-videos').upload(posterPath, posterBlob, {
        contentType: 'image/jpeg', upsert: true, cacheControl: '31536000',
      });
      if (!pu.error) {
        const ps = await supabase.storage.from('marketing-videos').createSignedUrl(posterPath, 60 * 60 * 24 * 365);
        posterUrl = ps.data?.signedUrl || undefined;
      }
    }
  } catch (err) { console.warn('[poster] extract failed', err); }

  const newMeta: any = { ...((asset as any).meta || {}), status: 'succeeded', stage: 'done', storage_path: path };
  if (posterUrl) newMeta.poster_url = posterUrl;
  delete newMeta.stitch_progress; delete newMeta.stitch_stage;
  await supabase.from('marketing_assets' as any).update({ output_url: url, meta: newMeta }).eq('id', (asset as any).id);
  await supabase.from('marketing_video_jobs' as any).update({ status: 'succeeded', video_url: url }).eq('id', jobId);
  return { url, assetId: (asset as any).id as string, meta: newMeta };
}