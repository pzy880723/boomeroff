// GO 主动拉取 ERP 授权范围并写镜像（最小接入版）。
// - 通道：GET https://erp.boomeroff.com/api/public/go/authorization
//   固定 origin、禁止 redirect、转发调用者本人的 GO JWT（不使用任何 SSO secret）。
// - 身份：只按 auth.getUser() -> canonical erp_user_links.aigc_user_id 取 erp_user_id，
//   绝不接受客户端传入的 erp_user_id；并核对 ERP 响应中的 erp_user_id 一致。
// - 只 UPDATE 已存在的映射，永不创建新绑定。
// - 网络/解析失败一律 pending，且不写镜像、不续租。
// - 写镜像成功（applied / lease_renewed）后，用同一本人 GO JWT 调用 ERP ack；
//   ack 失败时本地新权限已生效，但状态明确为 ack_pending，后续同版本 pull 可重试。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseScopePayload } from "../_shared/erp-scope.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ERP_ORIGIN = "https://erp.boomeroff.com";
const ERP_SCOPE_URL = `${ERP_ORIGIN}/api/public/go/authorization`;
const ERP_ACK_URL = `${ERP_ORIGIN}/api/public/go/authorization-ack`;
const ERP_TIMEOUT_MS = 8_000;
const ERP_ACK_TIMEOUT_MS = 5_000;

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

  const verifier = async () => {
    const { data, error } = await userClient.rpc("erp_verify_current_scope_v1");
    if (error) return null;
    return data;
  };

  // canonical 身份：必须唯一
  const { data: links, error: linkErr } = await admin
    .from("erp_user_links")
    .select("erp_user_id, link_status")
    .eq("aigc_user_id", uid)
    .limit(2);
  if (linkErr) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: "mapping_lookup_failed" },
    });
  }

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

  // 1) 拉取（ERP 用调用者的 GO token 自行核验本人身份）
  let scopeJson: unknown = null;
  let failCode = "";
  {
    const pull = decidePullOutcome(
      await erpFetchJson({
        url: ERP_SCOPE_URL,
        timeoutMs: ERP_TIMEOUT_MS,
        expectedOrigin: ERP_ORIGIN,
        init: {
          method: "GET",
          redirect: "error", // 固定 origin，禁止任何跳转（避免 token 外泄）
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
          },
        },
      }),
    );
    if (pull.ok) scopeJson = pull.data;
    else failCode = pull.code;
  }



  if (!scopeJson) {
    const code = failCode || "erp_unreachable";
    // 仅记录错误，绝不写镜像、绝不续租
    await admin.rpc("erp_mark_scope_sync_error_v1", { _erp_user_id: erpUserId, _error: code });
    console.log(JSON.stringify({ evt: "erp_scope_sync_pending", code }));
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code },
    });
  }

  // 2) 严格解析 + 身份一致性
  const parsed = parseScopePayload(scopeJson);
  if (!parsed.ok) {
    await admin.rpc("erp_mark_scope_sync_error_v1", { _erp_user_id: erpUserId, _error: parsed.code });
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: parsed.code },
    });
  }
  if (parsed.payload.erp_user_id !== erpUserId) {
    await admin.rpc("erp_mark_scope_sync_error_v1", {
      _erp_user_id: erpUserId,
      _error: "erp_user_id_mismatch",
    });
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code: "erp_user_id_mismatch" },
    });
  }

  // 3) 原子写镜像（版本规则在数据库里）
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

  const result = (applied ?? {}) as Record<string, unknown>;
  const code = String(result.code ?? "unknown");
  const scopeVersion = (result.scope_version ?? null) as number | null;
  const leaseRenewed = result.lease_renewed === true;

  if (result.ok !== true) {
    return json(200, {
      ok: true,
      data: await verifier(),
      sync: { status: "pending", code, scope_version: scopeVersion, lease_renewed: false },
    });
  }

  // 4) ACK（ERP 会用本人 token 反查 GO receipt 核验真实版本/新鲜度，不信客户端）
  //    只有「对象 且 ok === true」才算 ACK 成功；200 空 body / HTML / 非法 JSON => ack_bad_response
  const ackResult = decideAckOutcome(
    await erpFetchJson({
      url: ERP_ACK_URL,
      timeoutMs: ERP_ACK_TIMEOUT_MS,
      expectedOrigin: ERP_ORIGIN,
      init: {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
      },
    }),
  );
  const ackOk = ackResult.ok;
  const ackCode = ackResult.code;


  console.log(
    JSON.stringify({ evt: "erp_scope_sync_done", code, scope_version: scopeVersion, ack: ackOk ? "ok" : ackCode }),
  );

  return json(200, {
    ok: true,
    data: await verifier(),
    sync: {
      status: ackOk ? "synced" : "ack_pending",
      code,
      scope_version: scopeVersion,
      lease_renewed: leaseRenewed,
      ack: ackOk ? { ok: true, code: "acked" } : { ok: false, code: ackCode || "ack_failed" },
    },
  });
});
