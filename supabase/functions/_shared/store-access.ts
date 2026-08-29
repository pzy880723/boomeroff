const MANAGEMENT_ROLE_CODES = new Set(["super_admin", "area_manager", "shop_manager"]);

export class StoreAccessError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "StoreAccessError";
    this.status = status;
  }
}

export function canAccessStore({
  legacyRole,
  roleCode,
  suspended,
  boundShopId,
  requestedShopId,
}: {
  legacyRole?: string | null;
  roleCode?: string | null;
  suspended?: boolean | null;
  boundShopId?: string | null;
  requestedShopId?: string | null;
}): boolean {
  if (suspended) return false;
  if (legacyRole === "admin" || MANAGEMENT_ROLE_CODES.has(roleCode || "")) return true;
  return Boolean(boundShopId && requestedShopId && boundShopId === requestedShopId);
}

export async function resolveAuthorizedShop(
  admin: any,
  userId: string,
  requestedShopId?: string | null,
): Promise<string | null> {
  const [{ data: role, error: roleError }, { data: staff, error: staffError }] = await Promise.all([
    admin.from("user_roles").select("role, role_code, suspended").eq("user_id", userId).maybeSingle(),
    admin.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (roleError || staffError) throw new StoreAccessError("无法确认门店权限", 500);
  if (role?.suspended) throw new StoreAccessError("账号已停用", 403);

  const isManager = role?.role === "admin" || MANAGEMENT_ROLE_CODES.has(role?.role_code || "");
  if (isManager) return requestedShopId || staff?.shop_id || null;

  const boundShopId = staff?.shop_id || null;
  if (!boundShopId) throw new StoreAccessError("账号尚未绑定门店，请联系管理员", 403);
  if (requestedShopId && requestedShopId !== boundShopId) {
    throw new StoreAccessError("无权访问其他门店", 403);
  }
  return boundShopId;
}

export async function assertStoreAccess(
  admin: any,
  userId: string,
  requestedShopId?: string | null,
): Promise<void> {
  const resolved = await resolveAuthorizedShop(admin, userId, requestedShopId);
  if (!requestedShopId || resolved !== requestedShopId) {
    throw new StoreAccessError("无权访问该门店", 403);
  }
}
