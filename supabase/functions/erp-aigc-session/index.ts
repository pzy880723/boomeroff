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
  console.log(JSON.stringify({ evt: "erp_aigc_session_fail", status, code }));
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

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data?.users?.find(
      (u: any) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return { id: match.id };
    if (!data || data.users.length < 200) return null;
    page += 1;
  }
  return null;
}

async function findAuthUserByPhone(
  admin: ReturnType<typeof createClient>,
  phone: string,
): Promise<{ id: string } | null> {
  let page = 1;
  let matches: { id: string }[] = [];
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data?.users ?? []) {
      if ((u as any).phone && String((u as any).phone) === phone) {
        matches.push({ id: u.id });
        if (matches.length > 1) return null; // not unique
      }
    }
    if (!data || data.users.length < 200) break;
    page += 1;
  }
  return matches.length === 1 ? matches[0] : null;
}

async function findAuthUserByProfilePhone(
  admin: ReturnType<typeof createClient>,
  phone: string,
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("phone", phone)
    .limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  const userId = data[0]?.user_id;
  if (typeof userId !== "string" || !userId) return null;

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(
    userId,
  );
  if (authErr) throw authErr;
  return authUser?.user?.id ? { id: authUser.user.id } : null;
}

async function claimIfFree(
  admin: ReturnType<typeof createClient>,
  aigcUserId: string,
  erpUserId: string,
): Promise<"free" | "same" | "conflict"> {
  const { data, error } = await admin
    .from("erp_user_links")
    .select("erp_user_id")
    .eq("aigc_user_id", aigcUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "free";
  if (data.erp_user_id === erpUserId) return "same";
  return "conflict";
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

  const email = `erp+${erpUserId}@aigc.boomeroff.local`.toLowerCase();

  const primaryShop = shops[0] && typeof shops[0] === "object" ? shops[0] : null;
  const shopId =
    primaryShop && typeof (primaryShop as any).id === "string"
      ? (primaryShop as any).id
      : null;
  const shopName =
    primaryShop && typeof (primaryShop as any).name === "string"
      ? (primaryShop as any).name
      : null;

  let aigcUserId: string | null = null;

  // Step 1: existing mapping by erp_user_id
  try {
    const { data, error } = await admin
      .from("erp_user_links")
      .select("aigc_user_id")
      .eq("erp_user_id", erpUserId)
      .maybeSingle();
    if (error) throw error;
    if (data?.aigc_user_id) {
      // verify auth user still exists
      const { data: u, error: getErr } = await admin.auth.admin.getUserById(
        data.aigc_user_id as string,
      );
      if (getErr) throw getErr;
      if (u?.user?.id) {
        aigcUserId = u.user.id;
      }
    }
  } catch (e) {
    console.log(JSON.stringify({ evt: "erp_map_lookup_err", msg: (e as any)?.message }));
    return fail(500, "shadow_user_lookup_failed");
  }

  // Step 2: try to find existing auth user by email, then phone
  if (!aigcUserId) {
    try {
      const byEmail = await findAuthUserByEmail(admin, email);
      if (byEmail) {
        const state = await claimIfFree(admin, byEmail.id, erpUserId);
        if (state === "conflict") return fail(409, "shadow_user_conflict");
        aigcUserId = byEmail.id;
      }
    } catch (e) {
      console.log(JSON.stringify({ evt: "erp_lookup_email_err", msg: (e as any)?.message }));
      return fail(500, "shadow_user_lookup_failed");
    }
  }

  if (!aigcUserId && phone) {
    try {
      const byPhone =
        (await findAuthUserByPhone(admin, phone)) ??
        (await findAuthUserByProfilePhone(admin, phone));
      if (byPhone) {
        const state = await claimIfFree(admin, byPhone.id, erpUserId);
        if (state === "conflict") {
          return fail(409, "shadow_user_conflict", {
            conflict_count: 1,
            reason: "phone_user_already_linked_to_other_erp_user",
          });
        }
        aigcUserId = byPhone.id;
      }
    } catch (e) {
      console.log(JSON.stringify({ evt: "erp_lookup_phone_err", msg: (e as any)?.message }));
      return fail(500, "shadow_user_lookup_failed");
    }
  }

  // Step 3: create if still missing
  if (!aigcUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomPassword(),
      user_metadata: {
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
      const msg = String((createErr as any)?.message ?? "");
      const status = Number((createErr as any)?.status ?? 0);
      const code = String((createErr as any)?.code ?? "");
      const alreadyExists =
        status === 422 ||
        /email_exists|phone_exists|user_already_exists|already registered|exists|duplicate/i.test(
          `${code} ${msg}`,
        );
      // Re-lookup by email, then auth/profile phone. Some Auth create failures surface
      // profile-phone uniqueness as a generic 500, so we still attempt a safe claim.
      try {
        const byEmail = await findAuthUserByEmail(admin, email);
        if (byEmail) {
          const state = await claimIfFree(admin, byEmail.id, erpUserId);
          if (state === "conflict") {
            return fail(409, "shadow_user_conflict", {
              conflict_count: 1,
              reason: "email_user_already_linked_to_other_erp_user",
            });
          }
          aigcUserId = byEmail.id;
        } else if (phone) {
          const byPhone =
            (await findAuthUserByPhone(admin, phone)) ??
            (await findAuthUserByProfilePhone(admin, phone));
          if (byPhone) {
            const state = await claimIfFree(admin, byPhone.id, erpUserId);
            if (state === "conflict") {
              return fail(409, "shadow_user_conflict", {
                conflict_count: 1,
                reason: "phone_user_already_linked_to_other_erp_user",
              });
            }
            aigcUserId = byPhone.id;
          }
        }
      } catch (e) {
        console.log(JSON.stringify({ evt: "erp_relookup_err", msg: (e as any)?.message }));
        return fail(500, "shadow_user_lookup_failed");
      }
      if (!aigcUserId) {
        if (!alreadyExists) {
          console.log(JSON.stringify({ evt: "erp_create_err", status, code }));
        }
        return fail(500, "shadow_user_create_failed");
      }
    }
  }

  // Step 5: refresh metadata
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
    if (updateErr) {
      console.log(JSON.stringify({ evt: "erp_update_err", status: (updateErr as any)?.status }));
      return fail(500, "shadow_user_update_failed");
    }
  }

  // Upsert mapping
  {
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
    if (upsertErr) {
      console.log(JSON.stringify({ evt: "erp_link_err", code: (upsertErr as any)?.code }));
      // If unique violation on aigc_user_id, another erp user owns it.
      if ((upsertErr as any)?.code === "23505") {
        return fail(409, "shadow_user_conflict", {
          conflict_count: 1,
          reason: "aigc_user_already_linked_to_other_erp_user",
        });
      }
      return fail(500, "shadow_user_link_failed");
    }
  }

  // Generate magic link
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.log(JSON.stringify({ evt: "erp_magiclink_err", status: (linkErr as any)?.status }));
    return fail(500, "magiclink_failed");
  }

  return json(200, {
    ok: true,
    email,
    tokenHash: linkData.properties.hashed_token,
    displayName,
  });
});
