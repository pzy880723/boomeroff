// 上传后台静默打标:对刚入库的 marketing_assets(kind=photo) 调用 Lovable AI,
// 写回 tags/category/meta.summary/meta.ai_caption,避免在生成视频前再做一次识别。
// 前端 fire-and-forget,不阻塞上传速度。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { selectPendingAutoTagAssetIds } from "../_shared/auto-tag-assets.ts";
import { isCanonicalStorefrontAsset } from "../_shared/storefront-assets.ts";
import { imageDimensionsFromMeta, probeImageDimensions, withImageDimensions } from "../_shared/image-orientation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-auto-tag-cron",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CATEGORIES = ['服饰', '包袋', '配饰', '杂货', '玩具', '家居', '书刊', '店铺', '其他'];
// Only the SHA-256 digest is committed. The raw cron token lives in the database
// scheduler command and can be rotated without exposing it to browsers.
const AUTO_TAG_CRON_TOKEN_SHA256 = "61c9191d9ceb52896ae3d106890138f21bb869f48446212dc587dd177c83c178";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface AssetRow {
  id: string;
  output_url: string | null;
  tags: string[] | null;
  category: string | null;
  meta: any;
  user_id: string;
  shop_id: string | null;
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

    const body = await req.json().catch(() => ({}));
    const cronHeader = req.headers.get("X-Auto-Tag-Cron") || "";
    const configuredCronSecret = Deno.env.get("AUTO_TAG_CRON_TOKEN") || "";
    const isCron = !!cronHeader && (
      (configuredCronSecret && cronHeader === configuredCronSecret) ||
      await sha256Hex(cronHeader) === AUTO_TAG_CRON_TOKEN_SHA256
    );
    const auth = req.headers.get("Authorization");
    let userId: string | null = null;
    if (!isCron) {
      if (!auth) return json({ ok: false, error: "未授权" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u.user) return json({ ok: false, error: "未授权" }, 401);
      userId = u.user.id;
    }

    let ids: string[] = [];
    if (typeof body.asset_id === 'string') ids = [body.asset_id];
    if (Array.isArray(body.asset_ids)) ids = ids.concat(body.asset_ids.filter((x: any) => typeof x === 'string'));
    ids = Array.from(new Set(ids)).slice(0, 12);
    if (ids.length === 0 && !isCron) return json({ ok: true, updated: 0 });

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    let query = admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, user_id, shop_id")
      .eq("kind", "photo")
      .not("output_url", "is", null);
    if (ids.length) query = query.in("id", ids);
    else {
      query = query
        .in("meta->>ai_tag_status", ["pending", "failed", "processing"])
        .order("created_at", { ascending: true })
        .limit(40);
    }
    if (userId) query = query.eq("user_id", userId);
    const { data: rowsRaw, error: rErr } = await query;
    if (rErr) return json({ ok: false, error: rErr.message });
    const rows: AssetRow[] = (rowsRaw || []) as any;

    const force = !!body.force;
    const generatedSources = new Set([
      "storyboard", "ai_smart_ad", "ai-smart-ad", "ai_image", "smart_ad", "generated", "ai_generated",
    ]);
    const candidates = rows.filter((row) => {
      const meta = row.meta || {};
      if (meta.asset_class === "generated") return false;
      return !(typeof meta.source === "string" && generatedSources.has(meta.source));
    });
    const pendingIds = force
      ? candidates.filter((row) => row.output_url).map((row) => row.id).slice(0, 12)
      : selectPendingAutoTagAssetIds(candidates, isCron ? 4 : 12);
    const pendingSet = new Set(pendingIds);
    const todo = candidates.filter((row) => pendingSet.has(row.id));
    if (todo.length === 0) {
      return json({ ok: true, updated: 0, skipped: rows.length, mode: isCron ? "cron" : "user" });
    }

    const startedAt = new Date().toISOString();
    for (const row of todo) {
      let rowWithDimensions = row;
      if (!imageDimensionsFromMeta(row.meta) && row.output_url) {
        try {
          const dimensions = await probeImageDimensions(row.output_url);
          if (dimensions) rowWithDimensions = withImageDimensions(row, dimensions);
        } catch (error) {
          console.warn(`[auto-tag] image dimension probe failed asset=${row.id}`, error);
        }
      }
      const nextMeta = {
        ...(rowWithDimensions.meta || {}),
        ai_tag_status: "processing",
        ai_tag_started_at: startedAt,
        ai_tag_attempts: Number(row.meta?.ai_tag_attempts || 0) + 1,
      };
      row.meta = nextMeta;
      await admin.from("marketing_assets").update({ meta: nextMeta }).eq("id", row.id);
    }

    const markFailed = async (message: string) => {
      const failedAt = new Date().toISOString();
      await Promise.all(todo.map((row) => admin.from("marketing_assets").update({
        meta: {
          ...(row.meta || {}),
          ai_tag_status: "failed",
          ai_tag_error: message,
          ai_tag_failed_at: failedAt,
        },
      }).eq("id", row.id)));
    };

    const sys = `你是中古杂货店「素材打标员」。看到一组实景照片(店铺/商品/陈列),逐张输出:
- summary: ≤30 中文字,直白描述画面里是什么、在哪、光感
- tags: 3-5 个中文短词,每个 ≤6 字,描述商品类别/材质/风格/场景关键词
- category: 必须从 ${CATEGORIES.join('|')} 里选最贴近的一个
- best_for: 这张图最适合放在视频的哪段,只能选「开场|中段|收尾」之一

门头识别硬规则:
- 只有画面完整展示真实店铺入口,并且能看见 BOOMER·OFF 店招/Logo 时,才认定为标准门头照。
- 符合时 summary 必须包含「店铺入口全景」,tags 必须包含「探店首图」「门头全景」「店招」,category 必须是「店铺」,best_for 必须是「开场」。
- 店内货架、商品墙、收银台、局部门牌、AI 合成入口都不可以标记为「探店首图」。

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
      const message = aiRes.status === 402 ? "AI 额度已用尽" : aiRes.status === 429 ? "AI 限流" : "AI 识图失败";
      await markFailed(message);
      return json({ ok: false, error: message }, aiRes.status === 402 || aiRes.status === 429 ? aiRes.status : 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* */ }
    const items: AiItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
    if (items.length === 0) {
      await markFailed("AI 返回内容无法解析");
      return json({ ok: false, error: "AI 返回内容无法解析" }, 500);
    }

    let updated = 0;
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      const it = items.find((item) => Number(item.index) === i) || items[i] || {};
      const summary = (it.summary || '').toString().slice(0, 60).trim();
      const tags = Array.isArray(it.tags)
        ? Array.from(new Set(it.tags.map((x) => String(x).slice(0, 10).trim()).filter(Boolean))).slice(0, 5)
        : [];
      const category = CATEGORIES.includes(String(it.category || '')) ? String(it.category) : '其他';
      const bestFor = ['开场', '中段', '收尾'].includes(String(it.best_for || '')) ? String(it.best_for) : '中段';
      if (!summary && tags.length === 0) {
        await admin.from("marketing_assets").update({
          meta: {
            ...(row.meta || {}),
            ai_tag_status: "failed",
            ai_tag_error: "该图片没有返回有效标签",
            ai_tag_failed_at: new Date().toISOString(),
          },
        }).eq("id", row.id);
        continue;
      }

      const nextMeta = {
        ...(row.meta || {}),
        summary: summary || (row.meta?.summary || ''),
        ai_caption: { summary, tags, best_for: bestFor, category },
        ai_tagged_at: new Date().toISOString(),
        ai_tag_status: "succeeded",
        ai_tag_error: null,
      };
      const { error: uErr } = await admin.from("marketing_assets").update({
        tags: tags.length ? tags : (row.tags || []),
        category: row.category || category,
        meta: nextMeta,
      }).eq("id", row.id);
      if (!uErr) {
        updated += 1;
        if (row.shop_id && row.output_url && isCanonicalStorefrontAsset({
          ...row,
          tags: tags.length ? tags : (row.tags || []),
          category: row.category || category,
          meta: nextMeta,
        })) {
          const { data: profile } = await admin.from("shop_marketing_profiles")
            .select("shop_id, cover_image_url")
            .eq("shop_id", row.shop_id)
            .maybeSingle();
          if (!profile) {
            await admin.from("shop_marketing_profiles").insert({
              shop_id: row.shop_id,
              cover_image_url: row.output_url,
              updated_by: row.user_id,
            });
          } else if (!profile.cover_image_url) {
            await admin.from("shop_marketing_profiles").update({
              cover_image_url: row.output_url,
              updated_by: row.user_id,
            }).eq("shop_id", row.shop_id);
          }
        }
      }
    }

    return json({ ok: true, updated, total: todo.length, mode: isCron ? "cron" : "user" });
  } catch (e) {
    console.error("[auto-tag] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});
