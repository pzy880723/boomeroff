export function resolveMarketingShop({
  shopIds,
  boundShopId,
  sessionShopId,
  rememberedShopId,
  canSwitch,
}: {
  shopIds: string[];
  boundShopId: string | null;
  sessionShopId: string | null;
  rememberedShopId: string | null;
  canSwitch: boolean;
}): string | null {
  const valid = (id: string | null) => Boolean(id && shopIds.includes(id));
  if (!canSwitch) return valid(boundShopId) ? boundShopId : null;
  if (valid(sessionShopId)) return sessionShopId;
  if (valid(boundShopId)) return boundShopId;
  if (valid(rememberedShopId)) return rememberedShopId;
  return shopIds[0] || null;
}
