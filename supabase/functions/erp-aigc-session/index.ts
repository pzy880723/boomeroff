import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-erp-sso-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ERP_EXCHANGE_URL =
  "https://boomer-off-buddy.lovable.app/api/public/sso/aigc-exchange";

const TICKET_RE = /^[A-Za-z0-9_-]{43}$/;

const ALLOWED_ROLES = new Set([
  "super_admin",
  "hq_operator",
  "store_manager",
  "store_staff",
]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, extra: Record<string, unknown> = {}) {
  return json(status, { ok: false, code, ...extra });
}

function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("") + "Aa1!";
}

function normStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail(405, "method_not_allowed");
  }

  const ssoSecret = req.headers.get("x-erp-sso-secret");
  if (!ssoSecret) {
    return fail(401, "missing_sso_secret");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }

  const ticket =
    body && typeof body === "object" && typeof (body as any).ticket === "string"
      ? (body as any).ticket
      : "";
  if (!TICKET_RE.test(ticket)) {
    return fail(400, "invalid_ticket");
  }

  // Exchange with ERP
  let erpResp: Response;
  try {
    erpResp = await fetch(ERP_EXCHANGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-erp-sso-secret": ssoSecret,
      },
      body: JSON.stringify({ ticket }),
    });
  } catch (_e) {
    return fail(502, "erp_unreachable");
  }

  let erpJson: any = null;
  try {
    erpJson = await erpResp.json();
  } catch {
    return fail(502, "erp_bad_response");
  }

  if (!erpResp.ok || !erpJson?.ok) {
    const code =
      typeof erpJson?.code === "string" ? erpJson.code : "erp_exchange_failed";
    return fail(erpResp.status || 400, code);
  }

  const user = erpJson?.data?.user;
  if (!user || typeof user !== "object") {
    return fail(502, "erp_bad_user");
  }

  const erpUserId: string = String(user.id ?? "");
  if (!erpUserId) {
    return fail(502, "erp_missing_user_id");
  }
  const phone: string | null =
    typeof user.phone === "string" && user.phone ? user.phone : null;
  const displayName: string | null =
    typeof user.display_name === "string" && user.display_name
      ? user.display_name
      : null;
  const roles = normStringArray(user.roles);
  const permissions = normStringArray(user.permissions);
  const shops = Array.isArray(user.shops) ? user.shops : [];

  const hasAccess =
    permissions.includes("aigc_access") ||
    roles.some((r) => ALLOWED_ROLES.has(r));
  if (!hasAccess) {
    return fail(403, "aigc_access_denied");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return fail(500, "server_misconfigured");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `erp+${erpUserId}@aigc.boomeroff.local`;

  // primary shop metadata
  const primaryShop = shops[0] && typeof shops[0] === "object" ? shops[0] : null;
  const shopId =
    primaryShop && typeof (primaryShop as any).id === "string"
      ? (primaryShop as any).id
      : null;
  const shopName =
    primaryShop && typeof (primaryShop as any).name === "string"
      ? (primaryShop as any).name
      : null;

  // 1. Lookup existing mapping
  let aigcUserId: string | null = null;
  {
    const { data, error } = await admin
      .from("erp_user_links")
      .select("aigc_user_id")
      .eq("erp_user_id", erpUserId)
      .maybeSingle();
    if (error) return fail(500, "link_lookup_failed");
    if (data?.aigc_user_id) aigcUserId = data.aigc_user_id as string;
  }

  // 2. Create shadow auth user if missing
  if (!aigcUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomPassword(),
      user_metadata: {
        phone: phone ?? undefined,
        display_name: displayName ?? undefined,
        shop_name: shopName ?? undefined,
      },
      app_metadata: {
        auth_source: "erp",
        erp_user_id: erpUserId,
        roles,
        permissions,
        shop_id: shopId,
        shops,
      },
    });
    if (created?.user?.id) {
      aigcUserId = created.user.id;
    } else {
      // Email may already exist; find via listUsers
      const msg = (createErr as any)?.message ?? "";
      const status = (createErr as any)?.status ?? 0;
      const alreadyExists =
        status === 422 ||
        /already registered|exists|duplicate/i.test(msg);
      if (!alreadyExists) {
        return fail(500, "shadow_user_create_failed");
      }
      let page = 1;
      while (page <= 20 && !aigcUserId) {
        const { data: list, error: listErr } =
          await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) return fail(500, "shadow_user_lookup_failed");
        const match = list?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
        );
        if (match) {
          aigcUserId = match.id;
          break;
        }
        if (!list || list.users.length < 200) break;
        page += 1;
      }
      if (!aigcUserId) {
        return fail(500, "shadow_user_not_found");
      }
    }

    // Concurrency-safe upsert of mapping (unique on aigc_user_id + PK on erp_user_id)
    const { error: upsertErr } = await admin
      .from("erp_user_links")
      .upsert(
        {
          erp_user_id: erpUserId,
          aigc_user_id: aigcUserId,
          phone,
          display_name: displayName,
          roles,
          permissions,
          shops,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: "erp_user_id" },
      );
    if (upsertErr) return fail(500, "link_upsert_failed");
  }

  // 3. Refresh auth user metadata (idempotent)
  {
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      aigcUserId!,
      {
        user_metadata: {
          phone: phone ?? undefined,
          display_name: displayName ?? undefined,
          shop_name: shopName ?? undefined,
        },
        app_metadata: {
          auth_source: "erp",
          erp_user_id: erpUserId,
          roles,
          permissions,
          shop_id: shopId,
          shops,
        },
      },
    );
    if (updateErr) return fail(500, "auth_user_update_failed");
  }

  // 4. Update audit fields
  {
    const { error: auditErr } = await admin
      .from("erp_user_links")
      .update({
        phone,
        display_name: displayName,
        roles,
        permissions,
        shops,
        last_login_at: new Date().toISOString(),
      })
      .eq("erp_user_id", erpUserId);
    if (auditErr) return fail(500, "link_update_failed");
  }

  // 5. Generate magic link
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return fail(500, "magiclink_failed");
  }

  return json(200, {
    ok: true,
    email,
    tokenHash: linkData.properties.hashed_token,
    displayName,
  });
});
