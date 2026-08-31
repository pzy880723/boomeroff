type CompletionMeta = Record<string, unknown>;

export function readSourceScriptJobId(script: unknown): string | null {
  if (!script || typeof script !== 'object') return null;
  const payload = (script as Record<string, any>).__render_payload;
  const value = payload?.source_script_job_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildSurpriseVideoReadyUpdate(input: {
  sourceMeta: CompletionMeta | null | undefined;
  renderJobId: string;
  finalVideoUrl: string;
  assetId?: string | null;
}) {
  return {
    status: 'rendering',
    final_video_url: input.finalVideoUrl,
    error_message: null,
    meta: {
      ...(input.sourceMeta || {}),
      flow: 'surprise',
      consumed: true,
      surprise_stage: 'covering',
      render_job_id: input.renderJobId,
      ...(input.assetId ? { generated_asset_id: input.assetId } : {}),
    },
  };
}

export function buildSurpriseCoverCompletion(input: {
  sourceMeta: CompletionMeta | null | undefined;
  renderJobId: string;
  finalVideoUrl: string;
  coverUrl: string;
  assetId?: string | null;
}) {
  return {
    status: 'done',
    final_video_url: input.finalVideoUrl,
    cover_url: input.coverUrl,
    error_message: null,
    meta: {
      ...(input.sourceMeta || {}),
      flow: 'surprise',
      consumed: true,
      surprise_stage: 'completed',
      render_job_id: input.renderJobId,
      ...(input.assetId ? { generated_asset_id: input.assetId } : {}),
    },
  };
}
