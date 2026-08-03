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
  const rawHashtags = Array.isArray(copy.hashtags)
    ? copy.hashtags
    : Array.isArray(copy.topics)
      ? copy.topics
      : undefined;
  const result: VideoAssetCopy = {
    title: typeof copy.title === 'string' ? copy.title : undefined,
    body: typeof copy.body === 'string' ? copy.body : undefined,
    hashtags: rawHashtags?.map(String).filter(Boolean),
    first_comment: typeof copy.first_comment === 'string' ? copy.first_comment : undefined,
  };
  return result.title || result.body || result.hashtags?.length ? result : null;
}

function normalizePublishCopy(publish: unknown): VideoAssetCopy | null {
  if (!isRecord(publish)) return null;
  return normalize({
    title: publish.title || publish.cover_title,
    body: publish.body || publish.caption || publish.douyin_caption,
    hashtags: publish.hashtags || publish.topics,
    first_comment: publish.first_comment,
  });
}

/** 成片文案只认一份固定结果；兼容 Director 旧字段但不重新调用模型。 */
export function resolveVideoAssetCopy(meta: unknown, script?: unknown): VideoAssetCopy | null {
  if (isRecord(meta)) {
    const direct = normalize(meta.video_copy);
    if (direct) return direct;
    const publish = normalizePublishCopy(meta.publish_copy);
    if (publish) return publish;
  }
  if (!isRecord(script)) return null;
  return normalizePublishCopy(script.publish_copy);
}
