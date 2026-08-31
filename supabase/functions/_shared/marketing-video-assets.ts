export interface MarketingVideoAssetCandidate {
  id: string;
  user_id?: string | null;
  created_at?: string | null;
  meta?: Record<string, any> | null;
  output_url?: string | null;
}

export function resolveVideoAssetOwner(jobUserId: unknown, requestUserId: unknown): string {
  return String(jobUserId || requestUserId || '').trim();
}

export function pickCanonicalVideoAsset<T extends MarketingVideoAssetCandidate>(
  assets: T[],
  jobUserId: unknown,
): T | null {
  if (!assets.length) return null;
  const owner = String(jobUserId || '').trim();
  const owned = owner ? assets.filter((asset) => asset.user_id === owner) : [];
  const candidates = owned.length ? owned : assets;
  return [...candidates].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null;
}
