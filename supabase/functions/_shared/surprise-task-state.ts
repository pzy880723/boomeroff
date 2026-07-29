export interface SurpriseTaskRow {
  id: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  final_video_url?: string | null;
  cover_url?: string | null;
  meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type CurrentSurpriseTask =
  | { kind: 'script'; job: SurpriseTaskRow }
  | { kind: 'video'; job: SurpriseTaskRow };

function isScriptDraft(job: SurpriseTaskRow): boolean {
  const meta = job.meta || {};
  return meta.flow === 'surprise'
    && meta.consumed !== true
    && (meta.surprise_stage === 'script_generating' || meta.surprise_stage === 'script_ready');
}

function isSurpriseVideo(job: SurpriseTaskRow): boolean {
  const meta = job.meta || {};
  return meta.flow === 'surprise'
    && meta.consumed === true;
}

export function selectCurrentSurpriseTask(
  rows: SurpriseTaskRow[],
): CurrentSurpriseTask | null {
  const draft = rows.find(isScriptDraft);
  if (draft) return { kind: 'script', job: draft };

  const latestVideo = rows.find(isSurpriseVideo);
  if (!latestVideo || latestVideo.meta?.surprise_dismissed_at) return null;
  return { kind: 'video', job: latestVideo };
}
