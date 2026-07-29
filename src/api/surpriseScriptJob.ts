import { invokeFn } from '@/lib/invokeFn';

export type SurpriseScriptJobStatus = 'script_generating' | 'script_ready' | 'failed' | string;

export interface SurpriseScriptJobState {
  ok: boolean;
  task_kind?: 'script' | 'video';
  job_id: string;
  status: SurpriseScriptJobStatus;
  stage?: string;
  script?: unknown;
  result?: unknown;
  error?: string | null;
  final_video_url?: string | null;
  cover_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

async function call(body: Record<string, unknown>): Promise<SurpriseScriptJobState> {
  const { data, error } = await invokeFn<SurpriseScriptJobState>('surprise-script-job', { body });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '脚本任务失败');
  return data;
}

export function startSurpriseScriptJob(shopId: string, excludeAssetIds: string[] = [], realism = 'photoreal') {
  return call({ action: 'start', shop_id: shopId, exclude_asset_ids: excludeAssetIds, realism });
}

export function pollSurpriseScriptJob(jobId: string) {
  return call({ action: 'poll', job_id: jobId });
}

export function saveSurpriseScriptJob(jobId: string, script: unknown) {
  return call({ action: 'save', job_id: jobId, script });
}

export function discardSurpriseScriptJob(jobId: string) {
  return call({ action: 'discard', job_id: jobId });
}

export async function dismissSurpriseVideoJob(jobId: string): Promise<void> {
  const { data, error } = await invokeFn<{ ok: boolean; error?: string }>(
    'surprise-script-job',
    { body: { action: 'dismiss', job_id: jobId } },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '结束当前任务失败');
}
