// director-generate-publish-copy:
// 用大模型基于 script + user_prompt + 门店信息,一次性生成小红书/抖音文案 + hashtag + 封面标题
// 写到 video_generation_jobs.meta.publish_copy,供 complete-job 落到 marketing_assets
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CHAT_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

interface PublishCopy {
  caption: string;
  douyin_caption: string;
  hashtags: string[];
  cover_title: string;
  cover_subtitle: string;
}

function safeParse(s: string): PublishCopy | null {
  try {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      caption: String(j.caption || "").slice(0, 200),
      douyin_caption: String(j.douyin_caption || "").slice(0, 80),
      hashtags: Array.isArray(j.hashtags) ? j.hashtags.slice(0, 8).map((x: any) => String(x)) : [],
      cover_title: String(j.cover_title || "").slice(0, 14),
      cover_subtitle: String(j.cover_subtitle || "").slice(0, 20),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ ok: false, error: "缺少 LOVABLE_API_KEY" }, 500);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    let shop: any = null;
    if (job.shop_id) {
      const { data: s } = await admin.from("shops").select("name, city, tags").eq("id", job.shop_id).maybeSingle();
      shop = s;
    }

    const script = (job.script_json as any) || {};
    const src = (job.source_pick_json as any) || {};
    const persona = src.persona || {};
    const userPrompt = job.user_prompt || script.title || "门店探店短片";

    const scenesText = (script.scenes || []).map((s: any, i: number) => `#${i + 1} ${s.scene || ""}｜${s.subtitle || s.dialogue || ""}`).join("\n");
    const styleLabel = src.style || "自然真实";

    const system = "你是 BOOMER.OFF 中古门店的社媒编辑,给一条 15 秒短视频写发布文案。只返回 JSON,不要任何解释。";
    const user = `视频主题: ${userPrompt}
风格: ${styleLabel}
门店: ${shop?.name || "BOOMER 中古"}${shop?.city ? " · " + shop.city : ""}
门店标签: ${(shop?.tags || []).slice(0, 5).join(",") || "复古/中古/日式生活方式"}
角色: ${persona.label || "店员"} · ${persona.vibe || ""}
分镜:
${scenesText}

请输出以下 JSON:
{
  "caption": "小红书正文 100-140 字,轻松种草口吻,可以带 emoji,不要硬广,结尾自然过渡到 hashtag",
  "douyin_caption": "抖音风格 40-60 字,更抓人,可以带钩子",
  "hashtags": ["#BOOMEROFF", "#中古店", "..."] // 5-8 个,首个必须是 #BOOMEROFF
  "cover_title": "封面主标题 6-10 字,大字",
  "cover_subtitle": "封面副标题 8-14 字"
}`;

    const r = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return json({ ok: false, error: `模型 ${r.status}: ${txt.slice(0, 200)}` }, 502);
    }
    const jr: any = await r.json().catch(() => ({}));
    const content: string = jr?.choices?.[0]?.message?.content || "";
    const copy = safeParse(content);
    if (!copy) return json({ ok: false, error: "模型返回无法解析", raw: content.slice(0, 300) }, 502);

    // 保底: 首个 hashtag 强制 #BOOMEROFF
    if (!copy.hashtags.some((h) => /BOOMER/i.test(h))) copy.hashtags.unshift("#BOOMEROFF");

    const jobMeta = (job.meta as any) || {};
    await admin.from("video_generation_jobs").update({
      meta: { ...jobMeta, publish_copy: { ...copy, model: MODEL, generated_at: new Date().toISOString() } },
    }).eq("id", jobId);

    return json({ ok: true, publish_copy: copy });
  } catch (e) {
    console.error("[director-generate-publish-copy] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});
