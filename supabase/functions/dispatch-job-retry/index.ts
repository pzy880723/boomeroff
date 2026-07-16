// 重试单个 target:放回队列，由腾讯云 Worker 重新领取。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "unauthorized" }, 401);

    const { target_id } = await req.json();
    if (!target_id) return j({ error: "target_id required" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: target } = await supa.from("social_publish_targets").select("*").eq("id", target_id).maybeSingle();
    if (!target) return j({ error: "not found" }, 404);
    const { data: job } = await supa.from("social_publish_jobs").select("*").eq("id", target.job_id).maybeSingle();
    if (!job) return j({ error: "job not found" }, 404);

    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== job.shop_id) return j({ error: "forbidden" }, 403);
    }

    const { data: account } = await supa.from("social_accounts").select("worker_account_id,worker_account_key,cookie_status").eq("id", target.account_id).maybeSingle();
    if (!account?.worker_account_key && !account?.worker_account_id) return j({ error: "账号未在 worker 注册" }, 400);
    if (account.cookie_status === "expired") return j({ error: "账号登录已失效,请重新扫码" }, 400);

    await supa.from("social_publish_targets").update({
      status: "pending", progress: 0, started_at: null, finished_at: null,
      error_message: null, last_step: "retry_queued", worker_task_id: null,
      retry_count: (target.retry_count || 0) + 1, last_retry_at: new Date().toISOString(),
    }).eq("id", target_id);
    await supa.from("social_publish_jobs").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", job.id);
    return j({ ok: true, queued: true });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
