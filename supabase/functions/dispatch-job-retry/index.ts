// 重试单个 target:重新派单到 worker。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauPostVideoBatch, PLATFORM_CODE } from "../_shared/sau.ts";

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

    const { data: account } = await supa.from("social_accounts").select("*").eq("id", target.account_id).maybeSingle();
    if (!account?.worker_account_id) return j({ error: "账号未在 worker 注册" }, 400);
    if (!job.worker_file_path) return j({ error: "原视频文件已不在 worker,请重新发布" }, 400);

    await supa.from("social_publish_targets").update({
      status: "running", started_at: new Date().toISOString(), error_message: null,
      retry_count: (target.retry_count || 0) + 1, last_retry_at: new Date().toISOString(),
    }).eq("id", target_id);

    const pp = (job.per_platform || {})[target.platform] || {};
    const res = await sauPostVideoBatch({
      filePath: job.worker_file_path,
      accountIds: [account.worker_account_id],
      platformCode: PLATFORM_CODE[target.platform],
      title: pp.title || job.title,
      tags: pp.tags && pp.tags.length ? pp.tags : (job.tags || []),
      category: pp.category,
    });

    if (!res.ok) {
      await supa.from("social_publish_targets").update({
        status: "failed", error_message: res.error || "未知错误", finished_at: new Date().toISOString(),
      }).eq("id", target_id);
      return j({ ok: false, error: res.error });
    }
    await supa.from("social_publish_targets").update({
      status: "success", progress: 100, finished_at: new Date().toISOString(),
    }).eq("id", target_id);
    return j({ ok: true });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
