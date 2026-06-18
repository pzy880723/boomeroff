// 视频风格映射:中文 key → 英文画面 cues。供脚本生成 & 渲染共用。
export type VideoStyleKey =
  | 'lively' | 'energetic' | 'steady' | 'elegant' | 'nostalgic' | 'playful';

export const VIDEO_STYLE_LABELS: Record<VideoStyleKey, string> = {
  lively: '活泼',
  energetic: '激动',
  steady: '稳重',
  elegant: '优雅',
  nostalgic: '怀旧',
  playful: '俏皮',
};

export const VIDEO_STYLE_EN: Record<VideoStyleKey, string> = {
  lively: 'lively, snappy cuts, bright vivid color, upbeat rhythm, handheld micro-motion',
  energetic: 'energetic, fast push-ins, high contrast, dynamic motion, punchy pace',
  steady: 'calm steady cam, soft warm light, slow pace, cinematic composure',
  elegant: 'elegant, minimal, slow cinematic dolly, muted refined palette, shallow depth',
  nostalgic: 'nostalgic, fine film grain, warm tungsten tones, gentle drift, slight halation',
  playful: 'playful, whimsical micro-motion, pastel palette, quirky framing',
};

export function normalizeStyle(k: any): VideoStyleKey {
  return (Object.keys(VIDEO_STYLE_EN) as VideoStyleKey[]).includes(k) ? k : 'steady';
}
