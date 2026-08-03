export interface VideoDeliverableAsset {
  id: string;
  output_url?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface VideoDeliverable {
  url: string;
  filename: string;
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

export function resolveVideoDeliverables(asset: VideoDeliverableAsset): {
  video: VideoDeliverable | null;
  cover: VideoDeliverable | null;
} {
  const shortId = asset.id.slice(0, 8);
  const meta = asset.meta || {};
  const videoUrl = typeof asset.output_url === 'string' && asset.output_url ? asset.output_url : null;
  const storagePath = typeof meta.storage_path === 'string' ? meta.storage_path : '';
  const storageName = storagePath.split('/').pop() || '';
  const coverUrl = typeof meta.poster_url === 'string' && meta.poster_url
    ? meta.poster_url
    : typeof meta.cover_url === 'string' && meta.cover_url
      ? meta.cover_url
      : null;

  return {
    video: videoUrl ? {
      url: videoUrl,
      filename: storageName || `boomer-video-${shortId}.${extensionFromUrl(videoUrl, 'mp4')}`,
    } : null,
    cover: coverUrl ? {
      url: coverUrl,
      filename: `boomer-cover-${shortId}.${extensionFromUrl(coverUrl, 'jpg')}`,
    } : null,
  };
}
