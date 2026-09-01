import { selectAssetsForVideoAspect, type ImageAssetLike } from './image-orientation.ts';
import {
  filterAssetsForSurpriseContentScope,
  type SurpriseContentAsset,
  type SurpriseContentScope,
} from './surprise-content-scope.ts';
import { pickStorefrontAsset, type StorefrontAssetLike } from './storefront-assets.ts';

type ProbeAsset = ImageAssetLike & SurpriseContentAsset & StorefrontAssetLike;

export function shouldStopSurpriseImageProbing<T extends ProbeAsset>(
  assets: T[],
  aspect: string,
  contentScope: SurpriseContentScope,
  minimumTotal = 9,
  minimumScoped = 3,
): boolean {
  const aspectReady = selectAssetsForVideoAspect(assets, aspect);
  if (aspectReady.length < minimumTotal) return false;

  const storefront = pickStorefrontAsset(aspectReady);
  if (!storefront) return false;
  if (contentScope.key === 'all') return true;

  const scoped = filterAssetsForSurpriseContentScope(
    contentScope,
    aspectReady.filter((asset) => asset.id !== storefront.id),
  );
  return scoped.length >= minimumScoped;
}
