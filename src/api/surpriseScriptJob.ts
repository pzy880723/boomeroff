import { invokeFn } from '@/lib/invokeFn';

export type SurpriseScriptJobStatus = 'script_generating' | 'script_ready' | 'failed' | string;

export interface SurpriseScriptJobState {
  ok: boolean;
  task_kind?: 'none' | 'script' | 'video';
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
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  pending_changes?: string[];
  content_scope?: string;
  script_versions?: Array<Record<string, unknown>>;
  picked_assets?: unknown[];
  render_job_id?: string | null;
}

// 「BOOMER 帮我拍」固定 15 秒一段直出,输出分辨率恒为 1080p。
// 小红书发布后台会对 720p 判定「清晰度低」,所以这里兜底强制 1080p。
export const SURPRISE_OUTPUT_RESOLUTION = '1080p';

export interface SurpriseRenderPayload {
  script_job_id: string;
  shop_id: string;
  style: string;
  realism: string;
  model: string;
  resolution?: string;
  prompt_overrides?: Record<string, unknown>;
  face_pipeline?: 'auto' | 'character_sheet' | 'illustration' | 'faceless';
}

export interface SurpriseRenderResult {
  ok: boolean;
  job_id: string;
  segment_total?: number;
  error?: string;
}

async function call(body: Record<string, unknown>): Promise<SurpriseScriptJobState> {
  const { data, error } = await invokeFn<SurpriseScriptJobState>('surprise-script-job', { body });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '脚本任务失败');
  return data;
}

export function getCurrentSurpriseScriptJob(shopId: string) {
  return call({ action: 'current', shop_id: shopId });
}

export function startSurpriseScriptJob(
  shopId: string,
  excludeAssetIds: string[] = [],
  realism = 'photoreal',
  contentScope = 'all',
  replaceCurrent = false,
) {
  return call({
    action: 'start',
    shop_id: shopId,
    exclude_asset_ids: excludeAssetIds,
    realism,
    content_scope: contentScope,
    replace_current: replaceCurrent,
  });
}

export function pollSurpriseScriptJob(jobId: string) {
  return call({ action: 'poll', job_id: jobId });
}

export function saveSurpriseScriptJob(jobId: string, script: unknown) {
  return call({ action: 'save', job_id: jobId, script });
}

export function saveSurpriseScriptDraft(jobId: string, script: unknown) {
  return call({ action: 'save_draft', job_id: jobId, script });
}

export function reviseSurpriseScriptJob(jobId: string, instruction: string) {
  return call({ action: 'revise', job_id: jobId, instruction });
}

export function chatSurpriseScriptJob(jobId: string, message: string) {
  return call({ action: 'chat', job_id: jobId, message });
}

export function applySurpriseScriptConversation(jobId: string) {
  return call({ action: 'apply_conversation', job_id: jobId });
}

export function clearSurpriseScriptConversation(jobId: string) {
  return call({ action: 'clear_conversation', job_id: jobId });
}

export function updateSurpriseScriptAssets(jobId: string, assetUrls: string[]) {
  return call({ action: 'update_assets', job_id: jobId, asset_urls: assetUrls });
}

export function discardSurpriseScriptJob(jobId: string) {
  return call({ action: 'discard', job_id: jobId });
}

export function buildSurpriseRenderBody(payload: SurpriseRenderPayload): Record<string, unknown> {
  const resolution = (payload.resolution || '').toLowerCase() === '1080p'
    ? '1080p'
    : SURPRISE_OUTPUT_RESOLUTION;
  return { ...payload, resolution, preview: false };
}

export async function renderSurpriseVideo(payload: SurpriseRenderPayload): Promise<SurpriseRenderResult> {
  const { data, error } = await invokeFn<SurpriseRenderResult>(
    'surprise-marketing-video',
    { body: buildSurpriseRenderBody(payload) },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok || !data.job_id) throw new Error(data?.error || '15 秒视频生成任务启动失败');
  return data;
}

export async function dismissSurpriseVideoJob(jobId: string): Promise<void> {
  const { data, error } = await invokeFn<{ ok: boolean; error?: string }>(
    'surprise-script-job',
    { body: { action: 'dismiss', job_id: jobId } },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || '结束当前任务失败');
}
