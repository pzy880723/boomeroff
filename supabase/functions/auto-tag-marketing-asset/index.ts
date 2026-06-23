// 上传后台静默打标:对刚入库的 marketing_assets(kind=photo) 调用 Lovable AI,
// 写回 tags/category/meta.summary/meta.ai_caption,避免在生成视频前再做一次识别。
// 前端 fire-and-forget,不阻塞上传速度。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CATEGORIES = ['服饰', '包袋', '配饰', '杂货', '玩具', '家居', '书刊', '店铺', '其他'];

interface AssetRow {
  id: string;
  output_url: string | null;
  tags: string[] | null;
  category: string | null;
  meta: any;
  user_id: string;
}

interface AiItem {
  index: number;
  summary?: string;
  tags?: string[];
  category?: string;
  best_for?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    let ids: string[] = [];
    if (typeof body.asset_id === 'string') ids = [body.asset_id];
    if (Array.isArray(body.asset_ids)) ids = ids.concat(body.asset_ids.filter((x: any) => typeof x === 'string'));
    ids = Array.from(new Set(ids)).slice(0, 12);
    if (ids.length === 0) return json({ ok: true, updated: 0 });

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const { data: rowsRaw, error: rErr } = await admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, user_id")
      .in("id", ids)
      .eq("user_id", u.user.id)
      .eq("kind", "photo");
    if (rErr) return json({ ok: false, error: rErr.message });
    const rows: AssetRow[] = (rowsRaw || []) as any;

    // 跳过已经打过标且不强制重跑的
    const force = !!body.force;
    const todo = rows.filter((r) => r.output_url && (force || !r?.meta?.ai_tagged_at));
    if (todo.length === 0) return json({ ok: true, updated: 0, skipped: rows.length });

    const sys = `你是中古杂货店「素材打标员」。看到一组实景照片(店铺/商品/陈列),逐张输出:
- summary: ≤30 中文字,直白描述画面里是什么、在哪、光感
- tags: 3-5 个中文短词,每个 ≤6 字,描述商品类别/材质/风格/场景关键词
- category: 必须从 ${CATEGORIES.join('|')} 里选最贴近的一个
- best_for: 这张图最适合放在视频的哪段,只能选「开场|中段|收尾」之一

只输出严格 JSON,不要 markdown 包裹:
{"items":[{"index":0,"summary":"...","tags":["..."],"category":"...","best_for":"中段"}]}`;

    const userContent: any[] = [
      { type: "text", text: `共 ${todo.length} 张图,按顺序(index 从 0 起)给出打标。` },
      ...todo.map((r) => ({ type: "image_url", image_url: { url: r.output_url! } })),
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
        temperature: 0.2,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[auto-tag] AI", aiRes.status, t.slice(0, 300));
      if (aiRes.status === 402) return json({ ok: false, error: "AI 额度已用尽" }, 402);
      if (aiRes.status === 429) return json({ ok: false, error: "AI 限流" }, 429);
      return json({ ok: false, error: "AI 识图失败" }, 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* */ }
    const items: AiItem[] = Array.isArray(parsed?.items) ? parsed.items : [];

    let updated = 0;
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      const it = items[i] || {};
      const summary = (it.summary || '').toString().slice(0, 60).trim();
      const tags = Array.isArray(it.tags)
        ? Array.from(new Set(it.tags.map((x) => String(x).slice(0, 10).trim()).filter(Boolean))).slice(0, 5)
        : [];
      const category = CATEGORIES.includes(String(it.category || '')) ? String(it.category) : '其他';
      const bestFor = ['开场', '中段', '收尾'].includes(String(it.best_for || '')) ? String(it.best_for) : '中段';
      if (!summary && tags.length === 0) continue;

      const nextMeta = {
        ...(row.meta || {}),
        summary: summary || (row.meta?.summary || ''),
        ai_caption: { summary, tags, best_for: bestFor, category },
        ai_tagged_at: new Date().toISOString(),
      };
      const { error: uErr } = await admin.from("marketing_assets").update({
        tags: tags.length ? tags : (row.tags || []),
        category: row.category || category,
        meta: nextMeta,
      }).eq("id", row.id);
      if (!uErr) updated += 1;
    }

    return json({ ok: true, updated, total: todo.length });
  } catch (e) {
    console.error("[auto-tag] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});
