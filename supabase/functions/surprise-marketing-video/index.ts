// 「惊喜一下」一键随机推广视频
// 从店铺素材库随机挑一张商品图,按店铺调性随机视频路线/风格,
// 生成 15s 9:16 竖版脚本并提交渲染,返回 job_id。
// preview=true 时只返回 picked 不渲染,用于"换一组"。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadShopContext } from "../_shared/shop-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const VIDEO_TYPES = [
  { v: 'store_tour', label: '探店', tagHint: ['店铺', '氛围', '货架'] },
  { v: 'product_showcase', label: '产品展示', tagHint: ['服饰', '包', '配饰', '杂货', '玩具'] },
  { v: 'store_ambience', label: '店铺氛围', tagHint: ['杂货', '陈列', '角落'] },
  { v: 'new_arrival', label: '新品上架', tagHint: ['新品', '上新'] },
] as const;

const STYLES = ['steady', 'lively', 'energetic', 'elegant', 'nostalgic', 'playful'] as const;
type SType = typeof STYLES[number];

// 店铺 tone → 允许的风格白名单(模糊匹配)
function styleByTone(tone: string | null | undefined): readonly SType[] {
  const t = (tone || '').toLowerCase();
  if (/高冷|高级|沉稳|稳重|克制/.test(t)) return ['elegant', 'steady', 'nostalgic'];
  if (/年轻|活力|俏皮|可爱|搞笑|轻松/.test(t)) return ['playful', 'lively', 'energetic'];
  if (/怀旧|复古|文艺|岁月/.test(t)) return ['nostalgic', 'elegant', 'steady'];
  if (/热闹|激情|促销/.test(t)) return ['energetic', 'lively'];
  return STYLES;
}

function pickWeighted<T>(items: { item: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + Math.max(x.w, 0), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)].item;
  let r = Math.random() * total;
  for (const x of items) {
    r -= Math.max(x.w, 0);
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

function pickVtypeByAsset(asset: any): typeof VIDEO_TYPES[number]['v'] {
  const tags: string[] = [...(asset.tags || []), asset.category || ''].filter(Boolean);
  const text = tags.join(' ');
  const weighted = VIDEO_TYPES.map((t) => {
    let w = 1;
    for (const hint of t.tagHint) if (text.includes(hint)) w += 2;
    return { item: t.v, w };
  });
  return pickWeighted(weighted);
}

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
    if (!shopId) return json({ ok: false, error: "缺少 shop_id" });
    const preview: boolean = !!body.preview;
    const exclude: string[] = Array.isArray(body.exclude_asset_ids) ? body.exclude_asset_ids.slice(0, 50) : [];

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 1) 拉素材库里这家店的"商品图"(kind=photo, 有 output_url)
    const ninetyDays = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    let query = admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, created_at")
      .eq("shop_id", shopId)
      .eq("kind", "photo")
      .not("output_url", "is", null)
      .gte("created_at", ninetyDays)
      .order("created_at", { ascending: false })
      .limit(80);
    const { data: assetsRaw, error: aErr } = await query;
    if (aErr) return json({ ok: false, error: "读取素材失败: " + aErr.message });
    let assets = (assetsRaw || []).filter((a: any) => !exclude.includes(a.id));
    if (assets.length === 0) {
      // 兜底:不限 90 天
      const { data: any2 } = await admin.from("marketing_assets")
        .select("id, output_url, tags, category, meta, created_at")
        .eq("shop_id", shopId).eq("kind", "photo").not("output_url", "is", null)
        .order("created_at", { ascending: false }).limit(40);
      assets = (any2 || []).filter((a: any) => !exclude.includes(a.id));
    }
    if (assets.length === 0) {
      return json({ ok: false, error: "素材库还没有商品图,先去拍/上传几张" });
    }

    // 2) 加权随机选品(越新权重越高)
    const weighted = assets.map((a: any, idx: number) => ({ item: a, w: 1 + Math.max(0, 20 - idx) * 0.1 }));
    const picked = pickWeighted(weighted);

    // 3) 选 vtype + style
    const vtype = pickVtypeByAsset(picked);
    const shopCtx = await loadShopContext(shopId);
    const styleWhite = styleByTone(shopCtx?.tone);
    const style = styleWhite[Math.floor(Math.random() * styleWhite.length)];

    // 4) 50% 概率取一个角色
    let character: any = null;
    try {
      const { data: chars } = await admin.from("marketing_characters")
        .select("id, name, role_label, visual_signature, core_emotion, cover_url, extra_reference_urls")
        .eq("shop_id", shopId)
        .limit(20);
      if (chars && chars.length && Math.random() < 0.5) {
        character = chars[Math.floor(Math.random() * chars.length)];
      }
    } catch (_) { /* ignore */ }

    const vtypeLabel = VIDEO_TYPES.find((x) => x.v === vtype)?.label || '探店';
    const pickedSummary = (picked.meta as any)?.summary || picked.tags?.join('/') || picked.category || '这件中古好物';
    const pickedTitle = (picked.meta as any)?.title || picked.category || '中古好物';

    const result = {
      ok: true,
      picked: {
        asset_id: picked.id,
        cover_url: picked.output_url,
        title: pickedTitle,
        summary: pickedSummary,
        tags: picked.tags || [],
        category: picked.category || null,
      },
      vtype,
      vtype_label: vtypeLabel,
      style,
      character: character ? { id: character.id, name: character.name, cover_url: character.cover_url } : null,
      duration: 15,
      aspect: '9:16',
    };

    if (preview) return json(result);

    // 5) 调脚本生成
    const briefTranscript = `店员：来一条 15 秒竖版${vtypeLabel}视频，主角是这件「${pickedTitle}」。\n助理：好的，按${vtypeLabel}节奏，${VIDEO_TYPES.find((x) => x.v === vtype)?.label}风格，体现店铺调性。`;
    const scriptRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-marketing-video-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        shop_id: shopId,
        image_urls: [picked.output_url],
        video_type: vtype,
        duration: 15,
        aspect: '9:16',
        topic: `${vtypeLabel} · ${pickedTitle}`,
        highlight: pickedSummary.slice(0, 40),
        style,
        brief_transcript: briefTranscript,
        approved_script: '',
        image_descriptions: [{ index: 0, summary: pickedSummary }],
        character: character ? {
          id: character.id, name: character.name, role_label: character.role_label,
          visual_signature: character.visual_signature, core_emotion: character.core_emotion,
          cover_url: character.cover_url,
          extra_reference_urls: character.extra_reference_urls || [],
        } : null,
      }),
    });
    const scriptData = await scriptRes.json().catch(() => ({}));
    if (!scriptRes.ok || !scriptData?.script) {
      return json({ ok: false, error: scriptData?.error || '脚本生成失败' });
    }
    const script = scriptData.script;

    // 6) 提交渲染
    const renderRes = await fetch(`${SUPABASE_URL}/functions/v1/render-marketing-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ script: { ...script, video_type: vtype }, style, shop_id: shopId }),
    });
    const renderData = await renderRes.json().catch(() => ({}));
    if (!renderRes.ok || renderData?.ok === false || !renderData?.job_id) {
      return json({ ok: false, error: renderData?.error || '渲染提交失败' });
    }

    return json({ ...result, job_id: renderData.job_id, segment_total: renderData.segment_total || 1 });
  } catch (e) {
    console.error("[surprise] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});
