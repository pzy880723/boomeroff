// 给前端轮询/拉某个 job 的父子状态;同时把卡 5 分钟以上的 running 子任务标记 failed。
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

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: job } = await supa.from("social_publish_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 权限
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== job.shop_id) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 收尾: 把卡 5 分钟以上 queued/running 的子任务标记 failed (timeout)
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supa.from("social_publish_targets").update({
      status: "failed",
      error_message: "worker 超时未回执,请到平台后台确认是否已发布",
      finished_at: new Date().toISOString(),
    }).eq("job_id", jobId).in("status", ["queued", "running"]).lt("created_at", cutoff);

    const { data: targets } = await supa.from("social_publish_targets")
      .select("*, social_accounts(account_name, avatar_url, platform)")
      .eq("job_id", jobId).order("created_at");

    return new Response(JSON.stringify({ job, targets: targets || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
