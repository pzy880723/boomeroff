// 给营销参考图做一次性 AI 描述,供 BriefChat / 分镜脚本对齐图文。
// 结果按 output_url 写入 marketing_assets.meta.ai_caption 做缓存,命中跳过 AI。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Caption = { index: number; summary: string; tags: string[]; best_for: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body.image_urls)
      ? body.image_urls.filter((x: any) => typeof x === "string").slice(0, 20)
      : [];
    if (!urls.length) return json({ success: true, descriptions: [] });

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // 1) 命中缓存
    const { data: hits } = await admin
      .from("marketing_assets")
      .select("output_url, meta")
      .in("output_url", urls);
    const cache = new Map<string, Caption>();
    (hits || []).forEach((row: any) => {
      const cap = row?.meta?.ai_caption;
      if (cap && typeof cap.summary === "string") {
        cache.set(row.output_url, {
          index: 0,
          summary: cap.summary,
          tags: Array.isArray(cap.tags) ? cap.tags : [],
          best_for: cap.best_for || "中段",
        });
      }
    });

    const missing: { url: string; index: number }[] = [];
    urls.forEach((url, i) => { if (!cache.has(url)) missing.push({ url, index: i }); });

    let aiCaptions: Record<string, Caption> = {};
    if (missing.length) {
      const sys = `你是中古店铺短视频「图像审稿员」。看到一组参考图,逐张用一句中文(≤40字)说清楚:画面里是什么、光线/色调、最适合放在视频的哪段(开场/中段/收尾)。只输出 JSON,不要解释。`;
      const userContent: any[] = [
        { type: "text", text: `共 ${missing.length} 张图,按顺序(0 起)输出。\n严格 JSON:\n{"items":[{"index":0,"summary":"...","tags":["..."],"best_for":"开场|中段|收尾"}]}` },
      ];
      for (const m of missing) userContent.push({ type: "image_url", image_url: { url: m.url } });

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
          temperature: 0.3,
        }),
      });
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("[describe] AI", aiRes.status, t.slice(0, 300));
        if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
        if (aiRes.status === 429) return json({ error: "AI 限流,请稍后" }, 429);
        return json({ error: "AI 识图失败" }, 500);
      }
      const data = await aiRes.json();
      let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) raw = m[0];
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { /* */ }
      const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];

      // 按顺序对齐 missing
      missing.forEach((m, i) => {
        const it = items[i] || {};
        const cap: Caption = {
          index: m.index,
          summary: (it.summary || "").toString().slice(0, 60) || "(无描述)",
          tags: Array.isArray(it.tags) ? it.tags.slice(0, 4).map((x: any) => String(x).slice(0, 12)) : [],
          best_for: ["开场", "中段", "收尾"].includes(it.best_for) ? it.best_for : "中段",
        };
        aiCaptions[m.url] = cap;
      });

      // 写回缓存(失败忽略)
      for (const [url, cap] of Object.entries(aiCaptions)) {
        try {
          const { data: row } = await admin
            .from("marketing_assets")
            .select("id, meta")
            .eq("output_url", url)
            .eq("created_by", u.user.id)
            .limit(1)
            .maybeSingle();
          if (row?.id) {
            await admin.from("marketing_assets").update({
              meta: { ...(row.meta || {}), ai_caption: { summary: cap.summary, tags: cap.tags, best_for: cap.best_for } },
            }).eq("id", row.id);
          }
        } catch { /* */ }
      }
    }

    const descriptions: Caption[] = urls.map((url, i) => {
      const cap = cache.get(url) || aiCaptions[url];
      return cap
        ? { ...cap, index: i }
        : { index: i, summary: "(未识别)", tags: [], best_for: "中段" };
    });

    return json({ success: true, descriptions });
  } catch (e) {
    console.error("[describe] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
