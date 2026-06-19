// 多段视频兜底：若用户没选角色，给本店铺 + 视频类型生成（或复用）一张"自动锚定角色"。
// 1. 查 marketing_characters where shop_id=? and auto_anchor=true and meta->>video_type=? 命中直接返回
// 2. 否则用 Lovable AI 把 brief 压成一句"角色设定"，再调内部 generate-character-board 逻辑
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const shop_id = body.shop_id;
    const video_type = (body.video_type || "store_tour").toString();
    const style = (body.style || "steady").toString();
    const brief_summary = (body.brief_summary || "").toString().slice(0, 600);
    if (!shop_id) return json({ error: "缺少 shop_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 1) 复用
    const { data: hits } = await admin
      .from("marketing_characters")
      .select("*")
      .eq("shop_id", shop_id)
      .eq("auto_anchor", true)
      .eq("meta->>video_type", video_type)
      .order("created_at", { ascending: false })
      .limit(1);
    if (hits && hits.length) {
      return json({ success: true, character: hits[0], cached: true });
    }

    // 2) 用 AI 给一句角色设定
    const sys = `你是一位影像创意指导。根据店员的拍摄简报，为这支【${video_type}】短视频拟定一位"出镜主角"的视觉设定。要求中文输出 JSON：
{
  "name": "短名,2-6字,可中可英",
  "role_label": "角色定位,例如店长/熟客/路人/模特",
  "core_emotion": "核心情绪,5-10字",
  "visual_signature": "视觉标志,30字以内,涵盖性别气质/年龄段/发型/服饰/体型/色彩",
  "extra_desc": "若有助于一致性,可补一句细节,40字以内"
}
风格基调：${style}。该主角必须适合反复出镜、所有镜头都用同一人。只输出 JSON,不要 \`\`\` 包裹。`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: brief_summary || `拍摄类型:${video_type},风格:${style}` },
        ],
        temperature: 0.8,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[anchor] AI", aiRes.status, t.slice(0, 200));
      return json({ error: "兜底角色设定失败" }, 500);
    }
    const j = await aiRes.json();
    let raw: string = (j?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let spec: any = null;
    try { spec = JSON.parse(raw); } catch {}
    if (!spec?.name) {
      spec = {
        name: "出镜店员",
        role_label: "店长",
        core_emotion: "温柔笃定",
        visual_signature: "30岁出头女性，黑色短发，米色亚麻衬衫",
        extra_desc: "",
      };
    }

    // 3) 调内部 generate-character-board
    const fnUrl = `${SUPABASE_URL}/functions/v1/generate-character-board`;
    const r = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        shop_id,
        name: spec.name,
        role_label: spec.role_label,
        core_emotion: spec.core_emotion,
        visual_signature: spec.visual_signature,
        extra_desc: spec.extra_desc,
        auto_anchor: true,
        meta: { video_type, style },
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out?.character) {
      return json({ error: out?.error || "生成兜底角色失败" }, 500);
    }
    return json({ success: true, character: out.character, cached: false });
  } catch (e) {
    console.error("[anchor] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
