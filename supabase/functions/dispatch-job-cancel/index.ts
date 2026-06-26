// 取消尚未派单的定时任务(scheduled / queued)。
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

    const { job_id } = await req.json();
    if (!job_id) return j({ error: "job_id required" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: job } = await supa.from("social_publish_jobs").select("*").eq("id", job_id).maybeSingle();
    if (!job) return j({ error: "not found" }, 404);

    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== job.shop_id) return j({ error: "forbidden" }, 403);
    }
    if (!["scheduled", "queued"].includes(job.status)) return j({ error: "任务已在执行,无法取消" }, 400);

    await supa.from("social_publish_targets").update({
      status: "cancelled", finished_at: new Date().toISOString(),
    }).eq("job_id", job_id).in("status", ["scheduled", "queued"]);
    await supa.from("social_publish_jobs").update({
      status: "cancelled", updated_at: new Date().toISOString(),
    }).eq("id", job_id);
    return j({ ok: true });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
