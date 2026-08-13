export function resolveMarketingShop({
  shopIds,
  boundShopId,
  sessionShopId,
  rememberedShopId,
}: {
  shopIds: string[];
  boundShopId: string | null;
  sessionShopId: string | null;
  rememberedShopId: string | null;
}): string | null {
  const valid = (id: string | null) => Boolean(id && shopIds.includes(id));
  if (valid(sessionShopId)) return sessionShopId;
  if (valid(boundShopId)) return boundShopId;
  if (!boundShopId && valid(rememberedShopId)) return rememberedShopId;
  return shopIds[0] || null;
}
