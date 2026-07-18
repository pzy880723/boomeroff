export interface VideoAssetCopy {
  title?: string;
  body?: string;
  hashtags?: string[];
  first_comment?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalize(copy: unknown): VideoAssetCopy | null {
  if (!isRecord(copy)) return null;
  const result: VideoAssetCopy = {
    title: typeof copy.title === 'string' ? copy.title : undefined,
    body: typeof copy.body === 'string' ? copy.body : undefined,
    hashtags: Array.isArray(copy.hashtags) ? copy.hashtags.map(String).filter(Boolean) : undefined,
    first_comment: typeof copy.first_comment === 'string' ? copy.first_comment : undefined,
  };
  return result.title || result.body || result.hashtags?.length ? result : null;
}

/** 成片文案只认一份固定结果；兼容 Director 旧字段但不重新调用模型。 */
export function resolveVideoAssetCopy(meta: unknown): VideoAssetCopy | null {
  if (!isRecord(meta)) return null;
  const direct = normalize(meta?.video_copy);
  if (direct) return direct;
  const publish = meta?.publish_copy;
  if (!isRecord(publish)) return null;
  return normalize({
    title: publish.title || publish.cover_title,
    body: publish.body || publish.caption || publish.douyin_caption,
    hashtags: publish.hashtags,
    first_comment: publish.first_comment,
  });
}
