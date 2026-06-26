// Sync worker accounts -> social_accounts table for one shop. Returns merged list.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauGetAccounts, sauGetValidAccounts, CODE_PLATFORM } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const shopId = body.shop_id as string;
    const validate = !!body.validate;
    if (!shopId) {
      return new Response(JSON.stringify({ error: "shop_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Authz
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    if (!isAdmin) {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Pull from DB
    const { data: rows } = await supa.from("social_accounts").select("*").eq("shop_id", shopId);
    const dbAccounts = rows || [];

    // Pull worker truth
    const workerRaw = validate ? await sauGetValidAccounts() : await sauGetAccounts();
    const workerByKey = new Map<string, { wid: number; platform: string; name: string; ok: boolean }>();
    for (const row of workerRaw) {
      const [wid, ptype, , wname, status] = row;
      const platform = CODE_PLATFORM[ptype];
      if (!platform) continue;
      workerByKey.set(wname || "", { wid, platform, name: wname, ok: status === 1 });
    }

    // Reconcile: update cookie_status + worker_account_id for our rows
    const updates: any[] = [];
    for (const r of dbAccounts) {
      const w = workerByKey.get(r.worker_account_key);
      if (w) {
        const newStatus = w.ok ? "active" : "expired";
        if (r.cookie_status !== newStatus || r.worker_account_id !== w.wid) {
          updates.push(supa.from("social_accounts").update({
            cookie_status: newStatus,
            worker_account_id: w.wid,
            last_check_at: validate ? new Date().toISOString() : r.last_check_at,
          }).eq("id", r.id));
        }
      } else if (r.cookie_status !== "invalid") {
        updates.push(supa.from("social_accounts").update({
          cookie_status: "invalid",
          last_check_at: validate ? new Date().toISOString() : r.last_check_at,
        }).eq("id", r.id));
      }
    }
    if (updates.length) await Promise.all(updates);

    const { data: fresh } = await supa.from("social_accounts").select("*").eq("shop_id", shopId).order("created_at");
    return new Response(JSON.stringify({ accounts: fresh || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
