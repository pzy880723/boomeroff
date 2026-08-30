import { pickStorefrontAsset, type StorefrontAssetLike } from './storefront-assets.ts';

export interface RequestedSurpriseReference {
  asset_id?: string;
  url?: string;
  [key: string]: unknown;
}

export interface AuthorizedSurpriseReference extends StorefrontAssetLike {
  id: string;
  output_url: string;
}

export function selectAuthorizedSurpriseReferences(
  requested: RequestedSurpriseReference[],
  authorizedRows: AuthorizedSurpriseReference[],
): AuthorizedSurpriseReference[] {
  const byId = new Map(authorizedRows.map((row) => [String(row.id), row]));
  const byUrl = new Map(authorizedRows.map((row) => [String(row.output_url), row]));
  const selected: AuthorizedSurpriseReference[] = [];
  const seen = new Set<string>();

  for (const item of requested) {
    const id = String(item.asset_id || '').trim();
    const url = String(item.url || '').trim();
    const row = (id && byId.get(id)) || (url && byUrl.get(url));
    if (!row) throw new Error('部分参考图不属于当前门店');
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    selected.push(row);
  }

  if (!selected.length) throw new Error('惊喜一下必须选择至少一张店铺实景图');
  const storefront = pickStorefrontAsset(selected);
  if (!storefront) throw new Error('当前门店没有可确认的真实门头照');
  return [storefront, ...selected.filter((row) => row.id !== storefront.id)];
}
