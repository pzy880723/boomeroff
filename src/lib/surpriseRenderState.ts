export type RenderPhase = 'queued' | 'running' | 'covering' | 'done' | 'failed';

export type CoverStatus = 'queued' | 'claimed' | 'generating' | 'succeeded' | 'failed';

export interface CoverProgress {
  percent: number;
  stage: string;
  message: string;
}

export interface SurpriseRenderPollPayload {
  status?: string | null;
  video_url?: string | null;
  error?: string | null;
  cover_status?: CoverStatus | null;
  cover_url?: string | null;
  cover_error?: string | null;
  cover_progress?: CoverProgress | null;
}

export interface SurpriseRenderState {
  phase: RenderPhase;
  videoUrl?: string | null;
  coverStatus?: CoverStatus | null;
  coverUrl?: string | null;
  coverProgress?: CoverProgress | null;
  error?: string;
}

export function resolveSurpriseRenderState(payload: SurpriseRenderPollPayload): SurpriseRenderState {
  const status = payload.status || 'running';

  if (status === 'failed') {
    return { phase: 'failed', error: payload.error || '视频生成失败' };
  }

  if (status === 'succeeded') {
    if (payload.cover_status === 'failed') {
      return {
        phase: 'failed',
        videoUrl: payload.video_url || null,
        coverStatus: 'failed',
        error: `视频已生成，但封面生成失败：${payload.cover_error || '未知原因'}`,
      };
    }

    if (payload.cover_status === 'succeeded' && payload.cover_url) {
      return {
        phase: 'done',
        videoUrl: payload.video_url || null,
        coverStatus: 'succeeded',
        coverUrl: payload.cover_url,
        coverProgress: payload.cover_progress || null,
      };
    }

    return {
      phase: 'covering',
      videoUrl: payload.video_url || null,
      coverStatus: payload.cover_status || null,
      coverProgress: payload.cover_progress || null,
    };
  }

  return { phase: status === 'queued' ? 'queued' : 'running' };
}
