// ERP 保存/撤销后主动推送授权变更。
// - 共用 ERP_AIGC_SSO_SECRET（恒定时间比较），不新增 GO service key。
// - timestamp ±5 分钟窗 + nonce 真实落库去重；重复 nonce 直接 409 且不续租。
// - 只 UPDATE 已存在映射，撤销写墓碑，不删除 canonical。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isValidNonce,
  parseScopePayload,
  timestampWithinWindow,
  timingSafeEqualStr,
} from "../_shared/erp-scope.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-erp-sso-secret, x-erp-timestamp, x-erp-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  const ssoSecret = Deno.env.get("ERP_AIGC_SSO_SECRET");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, code: "server_misconfigured" });
  if (!ssoSecret) return json(500, { ok: false, code: "server_misconfigured" });

  const provided = req.headers.get("x-erp-sso-secret") ?? "";
  if (!timingSafeEqualStr(provided, ssoSecret)) {
    return json(401, { ok: false, code: "unauthorized" });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }

  const ts = body?.timestamp ?? req.headers.get("x-erp-timestamp");
  if (!timestampWithinWindow(ts)) return json(400, { ok: false, code: "timestamp_out_of_window" });

  const nonce = body?.nonce ?? req.headers.get("x-erp-nonce");
  if (!isValidNonce(nonce)) return json(400, { ok: false, code: "invalid_nonce" });

  const parsed = parseScopePayload(body?.data ?? body);
  if (!parsed.ok) return json(400, { ok: false, code: parsed.code });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: nonceErr } = await admin
    .from("erp_scope_push_nonces")
    .insert({ nonce, erp_user_id: parsed.payload.erp_user_id });
  if (nonceErr) {
    if ((nonceErr as any).code === "23505") {
      // 重复 push：不续租、不改镜像
      return json(409, { ok: false, code: "duplicate_nonce" });
    }
    return json(500, { ok: false, code: "nonce_store_failed" });
  }

  const { data: applied, error: applyErr } = await admin.rpc("erp_apply_scope_mirror_v1", {
    _erp_user_id: parsed.payload.erp_user_id,
    _payload: parsed.payload,
    _mode: "push",
  });
  if (applyErr) return json(500, { ok: false, code: "mirror_apply_failed" });

  const result = applied as Record<string, unknown> | null;
  const status = result?.ok === true ? 200 : 409;
  console.log(JSON.stringify({ evt: "erp_scope_push", code: result?.code ?? "unknown" }));
  return json(status, {
    ok: result?.ok === true,
    code: String(result?.code ?? "unknown"),
    scope_version: result?.scope_version ?? null,
    lease_renewed: result?.lease_renewed ?? false,
  });
});
