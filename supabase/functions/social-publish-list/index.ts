// 拉当前 shop 下的发布历史
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    const shopId = (body.shop_id as string) || "";
    const limit = Math.min(Number(body.limit) || 50, 100);
    if (!shopId) {
      return new Response(JSON.stringify({ error: "shop_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: jobs } = await supa
      .from("social_publish_jobs")
      .select("id, title, cover_url, status, schedule_at, created_at, updated_at, asset_id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const jobIds = (jobs || []).map((j) => j.id);
    let targets: any[] = [];
    if (jobIds.length > 0) {
      const { data: ts } = await supa
        .from("social_publish_targets")
        .select("id, job_id, platform, status, error_message, social_accounts(account_name, avatar_url)")
        .in("job_id", jobIds);
      targets = ts || [];
    }

    return new Response(JSON.stringify({ jobs: jobs || [], targets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
