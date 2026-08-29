export interface AutoTagAssetLike {
  id?: unknown;
  output_url?: unknown;
  meta?: Record<string, unknown> | null;
}

export function selectPendingAutoTagAssetIds(
  assets: AutoTagAssetLike[],
  max = 4,
  now = Date.now(),
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    const id = String(asset?.id || "").trim();
    const outputUrl = String(asset?.output_url || "").trim();
    const meta = asset?.meta || {};
    const attempts = Number(meta.ai_tag_attempts || 0);
    const startedAt = Date.parse(String(meta.ai_tag_started_at || ""));

    if (!id || !outputUrl || seen.has(id)) continue;
    if (meta.ai_tagged_at || attempts >= 3) continue;
    if (meta.ai_tag_status === "processing" && Number.isFinite(startedAt) && now - startedAt < 5 * 60_000) continue;

    seen.add(id);
    ids.push(id);
    if (ids.length >= Math.max(0, max)) break;
  }

  return ids;
}
