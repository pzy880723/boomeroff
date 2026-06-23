// 「惊喜一下」任务状态：A段(挑素材+写脚本)进程级去重，B段(渲染)持久化到 localStorage。
// 关弹窗/切页面不丢任务，再次打开恢复进度。
import { supabase } from '@/integrations/supabase/client';

const TTL_MS = 30 * 60 * 1000;
const keyOf = (shopId: string) => `boomer.surprise.job:${shopId}`;

export interface ActiveRenderJob {
  jobId: string;
  coverUrl: string | null;
  createdAt: number;
  segmentTotal?: number;
}

export function getActiveRenderJob(shopId: string | null | undefined): ActiveRenderJob | null {
  if (!shopId) return null;
  try {
    const raw = localStorage.getItem(keyOf(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRenderJob;
    if (!parsed?.jobId || !parsed.createdAt) return null;
    if (Date.now() - parsed.createdAt > TTL_MS) {
      localStorage.removeItem(keyOf(shopId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setActiveRenderJob(shopId: string, job: Omit<ActiveRenderJob, 'createdAt'> & { createdAt?: number }) {
  try {
    localStorage.setItem(keyOf(shopId), JSON.stringify({ createdAt: Date.now(), ...job }));
    window.dispatchEvent(new CustomEvent('boomer.surprise.change', { detail: { shopId } }));
  } catch {}
}

export function clearActiveRenderJob(shopId: string) {
  try {
    localStorage.removeItem(keyOf(shopId));
    window.dispatchEvent(new CustomEvent('boomer.surprise.change', { detail: { shopId } }));
  } catch {}
}

export type RenderPhase = 'queued' | 'running' | 'done' | 'failed';

export async function pollRenderJob(jobId: string): Promise<{
  phase: RenderPhase; video_url?: string | null; error?: string;
  progress?: { done: number; total: number };
}> {
  try {
    const { data, error } = await supabase.functions.invoke('poll-marketing-video', { body: { job_id: jobId } });
    if (error) return { phase: 'running', error: error.message };
    const d = data as any;
    const s: string = d?.status || 'running';
    const total = Number(d?.segment_total) || 0;
    const done = Number(d?.segment_done) || 0;
    const progress = total > 0 ? { done: Math.min(done, total), total } : undefined;
    if (s === 'succeeded') return { phase: 'done', video_url: d?.video_url || null, progress };
    if (s === 'failed') return { phase: 'failed', error: d?.error, progress };
    if (s === 'queued') return { phase: 'queued', progress };
    return { phase: 'running', progress };
  } catch (e: any) {
    return { phase: 'running', error: e?.message };
  }
}

// ===== A 段去重：同 shop 同时只有一个 pick 在飞 =====
const inflight = new Map<string, Promise<any>>();

export function getInflightPick(shopId: string): Promise<any> | null {
  return inflight.get(shopId) || null;
}

export function setInflightPick<T>(shopId: string, promise: Promise<T>): Promise<T> {
  inflight.set(shopId, promise);
  promise.finally(() => {
    if (inflight.get(shopId) === promise) inflight.delete(shopId);
  });
  return promise;
}
