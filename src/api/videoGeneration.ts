// 「让 BOOMER 替你拍一条」导演流水线的前端 API 封装。
// 全部走 director-* edge function,不 mock。
import { invokeFn } from '@/lib/invokeFn';

export type DirectorJobStatus =
  | 'queued'
  | 'character'
  | 'shooting'
  | 'ready_to_stitch'
  | 'composing'
  | 'done'
  | 'failed';

export type DirectorShotStatus =
  | 'pending'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface DirectorShot {
  id: string;
  shot_index: number;
  duration: number;
  scene?: string | null;
  subject?: string | null;
  action?: string | null;
  camera?: string | null;
  subtitle?: string | null;
  dialogue?: string | null;
  status: DirectorShotStatus;
  video_url?: string | null;
  first_frame_url?: string | null;
  error_message?: string | null;
  retry_count?: number;
}

export interface DirectorJob {
  id: string;
  status: DirectorJobStatus;
  duration: number;
  aspect_ratio: string;
  character_json?: { reference_image_url?: string; label?: string; visual?: string; vibe?: string } | null;
  script_json?: any;
  final_video_url?: string | null;
  cover_url?: string | null;
  error_message?: string | null;
  meta?: any;
}

export interface DirectorPollResult {
  job: DirectorJob;
  shots: DirectorShot[];
  progress: { done: number; total: number; failed: number };
}

export interface CreateVideoJobPayload {
  shop_id: string;
  script: any;
  picked_assets?: any[];
  persona?: any;
  style?: string;
  model?: string;
  resolution?: string;
  prompt_overrides?: any;
  user_prompt?: string;
}

export async function createVideoJob(payload: CreateVideoJobPayload): Promise<{ job_id: string }> {
  const { data, error } = await invokeFn<{ ok: boolean; job_id: string; error?: string }>(
    'director-create-job', { body: payload },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok || !data.job_id) throw new Error(data?.error || '创建任务失败');
  return { job_id: data.job_id };
}

export async function getVideoJob(jobId: string): Promise<DirectorPollResult> {
  const { data, error } = await invokeFn<{ ok: boolean; job: DirectorJob; shots: DirectorShot[]; progress: any; error?: string }>(
    'director-poll-job', { body: { job_id: jobId } },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '查询任务失败');
  return { job: data.job, shots: data.shots, progress: data.progress };
}

export async function retryShot(jobId: string, shotIndex: number): Promise<void> {
  const { data, error } = await invokeFn<{ ok: boolean; error?: string }>(
    'director-retry-shot', { body: { job_id: jobId, shot_index: shotIndex } },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '重试失败');
}

export async function regenerateJob(jobId: string): Promise<void> {
  // 重跑整条 = 重跑 pipeline;把 shots 全部重置由后端处理,目前简化成对每一条失败镜头 retry。
  // 这一版先只在前端把所有非 succeeded 的 shot 逐一 retry。真正整条重跑走 fallback。
  const { job, shots } = await getVideoJob(jobId);
  const targets = shots.filter((s) => s.status !== 'succeeded');
  for (const s of targets) {
    await retryShot(jobId, s.shot_index);
  }
  void job;
}

export async function completeVideoJob(jobId: string, finalVideoUrl: string, coverUrl?: string): Promise<void> {
  const { data, error } = await invokeFn<{ ok: boolean; error?: string }>(
    'director-complete-job', { body: { job_id: jobId, final_video_url: finalVideoUrl, cover_url: coverUrl } },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '保存成片失败');
}
