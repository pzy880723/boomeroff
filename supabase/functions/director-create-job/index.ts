// director-create-job:
// 前端在「惊喜一下」确认时调用。落一个 video_generation_jobs + 对应 shots,
// 然后异步触发 director-run-pipeline 去跑真正的流水线。返回 job_id 立刻给前端做进度轮询。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flattenScriptToShots, type DirectorScript } from "../_shared/director-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const shopId: string | null = typeof body.shop_id === 'string' && body.shop_id ? body.shop_id : null;
    const script: DirectorScript | null = body.script && typeof body.script === 'object' ? body.script : null;
    const pickedAssets: unknown[] = Array.isArray(body.picked_assets) ? body.picked_assets : [];
    const persona = body.persona && typeof body.persona === 'object' ? body.persona : null;
    const modelId: string | undefined = typeof body.model === 'string' ? body.model : undefined;
    const resolution: string | undefined = typeof body.resolution === 'string' ? body.resolution : undefined;
    const style: string | undefined = typeof body.style === 'string' ? body.style : undefined;
    const promptOverrides = body.prompt_overrides && typeof body.prompt_overrides === 'object' ? body.prompt_overrides : null;
    if (!shopId) return json({ ok: false, error: "缺少 shop_id" });
    if (!script) return json({ ok: false, error: "缺少脚本" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const brief = {
      goal: '门店探店 · 高转化短视频',
      platform: '通用短视频',
      duration_s: 15,
      aspect_ratio: '9:16',
      style: '复古生活方式 · BOOMER-OFF',
    };

    // 1) insert job
    const { data: job, error: jErr } = await admin
      .from("video_generation_jobs")
      .insert({
        user_id: u.user.id,
        shop_id: shopId,
        source_pick_json: { picked_assets: pickedAssets, persona, model: modelId, resolution, style, prompt_overrides: promptOverrides },
        brief_json: brief,
        script_json: script,
        status: 'queued',
        duration: 15,
        aspect_ratio: '9:16',
        meta: {},
      })
      .select()
      .single();
    if (jErr || !job) return json({ ok: false, error: '建任务失败: ' + (jErr?.message || 'unknown') }, 500);

    // 2) insert shots
    const flat = flattenScriptToShots(script);
    const shotRows = flat.map((s, i) => ({
      job_id: job.id,
      shot_index: i,
      duration: s.duration,
      scene: s.scene || null,
      subject: s.subject || null,
      action: s.action || null,
      camera: s.camera || null,
      subtitle: s.subtitle || null,
      dialogue: s.dialogue || null,
      prompt: s.prompt,
      status: 'pending',
    }));
    if (shotRows.length) {
      const { error: sErr } = await admin.from("video_generation_shots").insert(shotRows);
      if (sErr) {
        console.error("[director-create-job] shots insert", sErr);
      }
    }

    // 3) 异步触发 pipeline(不 await,直接放走)
    fetch(`${SUPABASE_URL}/functions/v1/director-run-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ job_id: job.id }),
    }).catch((e) => console.warn("[director-create-job] pipeline fire failed", e));

    return json({ ok: true, job_id: job.id, shot_count: shotRows.length });
  } catch (e) {
    console.error("[director-create-job] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});
