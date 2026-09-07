// GO 主动拉取 ERP 授权范围并写镜像。
// - 只按 auth.getUser() -> canonical erp_user_links.aigc_user_id 取 erp_user_id，
//   绝不接受客户端传入的 erp_user_id。
// - 只 UPDATE 已存在的映射，永不创建新绑定。
// - ERP 端点不可达 / 报错时返回 sync.status = "pending"，不破坏现有旧 Web 权限。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseScopePayload } from "../_shared/erp-scope.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ERP_SCOPE_URL = "https://boomer-off-buddy.lovable.app/api/public/sso/aigc-scope";
const ERP_TIMEOUT_MS = 8_000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const ssoSecret = Deno.env.get("ERP_AIGC_SSO_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { ok: false, code: "server_misconfigured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { ok: false, code: "unauthorized" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (userErr || !uid) return json(401, { ok: false, code: "unauthorized" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // canonical 身份：必须唯一
  const { data: links, error: linkErr } = await admin
    .from("erp_user_links")
    .select("erp_user_id, link_status")
    .eq("aigc_user_id", uid)
    .limit(2);
  if (linkErr) return json(500, { ok: false, code: "mapping_lookup_failed" });

  const verifier = async () => {
    const { data, error } = await userClient.rpc("erp_verify_current_scope_v1");
    if (error) return null;
    return data;
  };

  if (!links || links.length === 0) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "unlinked", code: "no_erp_mapping" },
    });
  }
  if (links.length > 1) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "unlinked", code: "ambiguous_mapping" },
    });
  }

  const erpUserId = links[0].erp_user_id as string;

  if (!ssoSecret) {
    await admin.rpc("erp_mark_scope_sync_error_v1", {
      _erp_user_id: erpUserId,
      _error: "sso_secret_missing",
    });
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: "sso_secret_missing" },
    });
  }

  let scopeJson: unknown = null;
  let failCode = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ERP_TIMEOUT_MS);
    const resp = await fetch(ERP_SCOPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-erp-sso-secret": ssoSecret },
      body: JSON.stringify({ erp_user_id: erpUserId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || !body || (body as any).ok !== true) {
      failCode = typeof (body as any)?.code === "string" ? (body as any).code : `erp_http_${resp.status}`;
    } else {
      scopeJson = (body as any).data;
    }
  } catch (_e) {
    failCode = "erp_unreachable";
  }

  if (!scopeJson) {
    await admin.rpc("erp_mark_scope_sync_error_v1", {
      _erp_user_id: erpUserId,
      _error: failCode || "erp_unreachable",
    });
    console.log(JSON.stringify({ evt: "erp_scope_sync_pending", code: failCode }));
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: failCode || "erp_unreachable" },
    });
  }

  const parsed = parseScopePayload(scopeJson);
  if (!parsed.ok) {
    await admin.rpc("erp_mark_scope_sync_error_v1", {
      _erp_user_id: erpUserId,
      _error: parsed.code,
    });
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: parsed.code },
    });
  }

  if (parsed.payload.erp_user_id !== erpUserId) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: "erp_user_id_mismatch" },
    });
  }

  const { data: applied, error: applyErr } = await admin.rpc("erp_apply_scope_mirror_v1", {
    _erp_user_id: erpUserId,
    _payload: parsed.payload,
    _mode: "pull",
  });
  if (applyErr) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: "mirror_apply_failed" },
    });
  }

  const result = applied as Record<string, unknown> | null;
  const okApplied = result?.ok === true;
  return json(200, {
    ok: true,
    data: await verifier(),
    sync: {
      status: okApplied ? "synced" : "pending",
      code: String(result?.code ?? "unknown"),
      scope_version: result?.scope_version ?? null,
      lease_renewed: result?.lease_renewed ?? false,
    },
  });
});
