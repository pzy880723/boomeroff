// GO ↔ ERP 授权镜像共享逻辑。
// 契约（已冻结）：ERP 返回
// { ok, data: { erp_user_id, active, revoked, roles[], permissions[], scope_version, updated_at,
//               shops: [{ go_shop_id, erp_location_id, name }] } }
// GO 只信任 go_shop_id；任何一个元素不合法 => 整份 invalid_shop_mapping。

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUSH_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export interface ScopeShop {
  go_shop_id: string;
  erp_location_id: string;
  name: string | null;
}

export interface ScopePayload {
  erp_user_id: string;
  active: boolean;
  revoked: boolean;
  roles: string[];
  permissions: string[];
  scope_version: number;
  updated_at: string | null;
  shops: ScopeShop[];
}

export type ParseResult =
  | { ok: true; payload: ScopePayload }
  | { ok: false; code: string };

/** 恒定时间字符串比较，避免通过响应时间试探 secret。 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // 长度不同也要走完整轮比较，避免长度侧信道之外的提前返回
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !x) return null;
    out.push(x);
  }
  return out;
}

/** 严格解析 ERP 下发的 scope payload。失败一律 fail closed，不做部分容错。 */
export function parseScopePayload(input: unknown): ParseResult {
  if (!input || typeof input !== "object") return { ok: false, code: "invalid_payload" };
  const d = input as Record<string, unknown>;

  const erpUserId = typeof d.erp_user_id === "string" ? d.erp_user_id : "";
  if (!UUID_RE.test(erpUserId)) return { ok: false, code: "invalid_erp_user_id" };

  if (typeof d.active !== "boolean" || typeof d.revoked !== "boolean") {
    return { ok: false, code: "invalid_status" };
  }

  const roles = strArray(d.roles);
  const permissions = strArray(d.permissions);
  if (!roles || !permissions) return { ok: false, code: "invalid_roles" };

  const version = typeof d.scope_version === "number" && Number.isSafeInteger(d.scope_version)
    ? d.scope_version
    : NaN;
  if (!Number.isFinite(version) || version < 0) return { ok: false, code: "invalid_scope_version" };

  if (!Array.isArray(d.shops)) return { ok: false, code: "invalid_shop_mapping" };
  const shops: ScopeShop[] = [];
  for (const raw of d.shops) {
    if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_shop_mapping" };
    const e = raw as Record<string, unknown>;
    const goShopId = typeof e.go_shop_id === "string" ? e.go_shop_id : "";
    const locationId = typeof e.erp_location_id === "string" ? e.erp_location_id : "";
    if (!UUID_RE.test(goShopId) || !UUID_RE.test(locationId)) {
      return { ok: false, code: "invalid_shop_mapping" };
    }
    shops.push({
      go_shop_id: goShopId,
      erp_location_id: locationId,
      name: typeof e.name === "string" ? e.name : null,
    });
  }

  return {
    ok: true,
    payload: {
      erp_user_id: erpUserId,
      active: d.active,
      revoked: d.revoked,
      roles,
      permissions,
      scope_version: version,
      updated_at: typeof d.updated_at === "string" ? d.updated_at : null,
      shops,
    },
  };
}

/** 校验 push 的时间戳窗口（±5 分钟）。服务端自己取 now，不接受传入未来时间作为同步时间。 */
export function timestampWithinWindow(raw: unknown, nowMs = Date.now()): boolean {
  if (typeof raw !== "string" && typeof raw !== "number") return false;
  const t = typeof raw === "number" ? raw : Date.parse(raw);
  if (!Number.isFinite(t)) return false;
  return Math.abs(nowMs - t) <= PUSH_TIMESTAMP_SKEW_MS;
}

export function isValidNonce(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(raw);
}
