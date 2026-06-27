// 一次性给历史无标签的素材图打 AI 标签
// - 仅 admin 可调用
// - 每次最多处理 ~120 张(每 8 张一批,15 批),避免函数超时
// - 返回 { processed, updated, remaining }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CATEGORIES = ['服饰', '包袋', '配饰', '杂货', '玩具', '家居', '书刊', '店铺', '其他'];
const BATCH = 8;
const MAX_BATCHES = 15;

interface AiItem {
  index: number;
  summary?: string;
  tags?: string[];
  category?: string;
  best_for?: string;
}

async function tagBatch(admin: any, rows: any[], apiKey: string): Promise<number> {
  if (!rows.length) return 0;
  const sys = `你是中古杂货店「素材打标员」。看到一组实景照片(店铺/商品/陈列),逐张输出:
- summary: ≤30 中文字
- tags: 3-5 个中文短词,每个 ≤6 字
- category: 必须从 ${CATEGORIES.join('|')} 里选最贴近的一个
- best_for: 「开场|中段|收尾」之一

只输出严格 JSON:
{"items":[{"index":0,"summary":"...","tags":["..."],"category":"...","best_for":"中段"}]}`;
  const content: any[] = [
    { type: "text", text: `共 ${rows.length} 张,按 index 0..${rows.length - 1} 输出。` },
    ...rows.map((r) => ({ type: "image_url", image_url: { url: r.output_url } })),
  ];
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: sys }, { role: "user", content }],
      temperature: 0.2,
    }),
  });
  if (!aiRes.ok) {
    console.warn("[backfill-tags] ai", aiRes.status, (await aiRes.text()).slice(0, 200));
    return 0;
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
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
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
  return updated;
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

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // admin gate
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, error: "仅管理员可操作" }, 403);

    const limit = BATCH * MAX_BATCHES;
    const { data: candRaw, error: cErr } = await admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta")
      .eq("kind", "photo")
      .not("output_url", "is", null)
      .or("tags.is.null,tags.eq.{}")
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cErr) return json({ ok: false, error: cErr.message });
    const cand = (candRaw || []).filter((r: any) => !r?.meta?.ai_tagged_at);
    const toProcess = cand.slice(0, limit);
    const remaining = Math.max(0, cand.length - toProcess.length);

    let processed = 0;
    let updated = 0;
    for (let i = 0; i < toProcess.length; i += BATCH) {
      const slice = toProcess.slice(i, i + BATCH);
      const got = await tagBatch(admin, slice, LOVABLE_API_KEY);
      updated += got;
      processed += slice.length;
      // 限流
      if (i + BATCH < toProcess.length) await new Promise((r) => setTimeout(r, 800));
    }

    return json({ ok: true, processed, updated, remaining });
  } catch (e) {
    console.error("[backfill-tags] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});
