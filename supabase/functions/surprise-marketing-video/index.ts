// 「惊喜一下」一键随机推广视频
// 流程:
//   1. 从店铺素材库随机挑 3–5 张实景商品/店铺图(实体店必须用真实素材)
//   2. 按店铺调性随机视频路线/风格
//   3. 调 generate-marketing-video-script 出完整脚本(钩子+中段+收尾,15s 9:16)
//   4. preview=true → 返回 { picked, assets, script, ... } 供前端展示分镜
//   5. preview=false → 用同一份 script 调 render-marketing-video 入队,返回 job_id
// 前端在"换一组"时重新挑;"就拍这条"时把已生成的 script + assets 一起回传,避免二次生成造成不一致。
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

function pickVtypeByAssets(assets: any[]): typeof VIDEO_TYPES[number]['v'] {
  const text = assets.flatMap((a) => [...(a.tags || []), a.category || '']).filter(Boolean).join(' ');
  const weighted = VIDEO_TYPES.map((t) => {
    let w = 1;
    for (const hint of t.tagHint) if (text.includes(hint)) w += 2;
    return { item: t.v, w };
  });
  return pickWeighted(weighted);
}

// 不放回加权采样
function sampleWeighted<T>(items: { item: T; w: number }[], n: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + Math.max(x.w, 0), 0);
    if (total <= 0) { out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].item); continue; }
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(pool[i].w, 0);
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return out;
}

function summarizeAsset(a: any): string {
  const meta = (a.meta || {}) as any;
  if (meta.summary) return String(meta.summary).slice(0, 120);
  const parts: string[] = [];
  if (a.category) parts.push(a.category);
  if (Array.isArray(a.tags) && a.tags.length) parts.push(a.tags.slice(0, 3).join('/'));
  return parts.join(' · ') || '店内实景';
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

    // ====== 提交模式:前端回传了 preview 时生成的 script,直接渲染 ======
    if (!preview && body.script && body.picked_assets && body.vtype && body.style) {
      // 幂等再跑一次去重(防用户中途手改)
      const fixed = enforceUniqueAssets(body.script, body.picked_assets);
      const renderRes = await fetch(`${SUPABASE_URL}/functions/v1/render-marketing-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ script: { ...fixed.script, video_type: body.vtype }, style: body.style, shop_id: shopId }),
      });
      const renderData = await renderRes.json().catch(() => ({}));
      if (!renderRes.ok || renderData?.ok === false || !renderData?.job_id) {
        return json({ ok: false, error: renderData?.error || '渲染提交失败' });
      }
      return json({ ok: true, job_id: renderData.job_id, segment_total: renderData.segment_total || 1 });
    }

    // ====== Preview / 兜底:全流程 ======
    // 1) 拉素材库里这家店的"商品图"
    const ninetyDays = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: assetsRaw, error: aErr } = await admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, created_at")
      .eq("shop_id", shopId)
      .eq("kind", "photo")
      .not("output_url", "is", null)
      .gte("created_at", ninetyDays)
      .order("created_at", { ascending: false })
      .limit(80);
    if (aErr) return json({ ok: false, error: "读取素材失败: " + aErr.message });
    let pool = (assetsRaw || []).filter((a: any) => !exclude.includes(a.id));
    if (pool.length === 0) {
      const { data: any2 } = await admin.from("marketing_assets")
        .select("id, output_url, tags, category, meta, created_at")
        .eq("shop_id", shopId).eq("kind", "photo").not("output_url", "is", null)
        .order("created_at", { ascending: false }).limit(40);
      pool = (any2 || []).filter((a: any) => !exclude.includes(a.id));
    }
    if (pool.length === 0) {
      return json({ ok: false, error: "素材库还没有商品图,先去拍/上传几张" });
    }

    // 2) 加权挑 3–5 张(越新权重越高);主图取第一张
    const weighted = pool.map((a: any, idx: number) => ({ item: a, w: 1 + Math.max(0, 20 - idx) * 0.1 }));
    const targetCount = Math.min(pool.length, 3 + Math.floor(Math.random() * 3)); // 3,4,5
    const pickedAssets = sampleWeighted(weighted, targetCount);
    const hero = pickedAssets[0];

    // 3) vtype + style
    const vtype = pickVtypeByAssets(pickedAssets);
    const shopCtx = await loadShopContext(shopId);
    const styleWhite = styleByTone(shopCtx?.tone);
    const style = styleWhite[Math.floor(Math.random() * styleWhite.length)];
    const vtypeLabel = VIDEO_TYPES.find((x) => x.v === vtype)?.label || '探店';

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

    // 5) 生成脚本 — 用全部入选素材
    const imageUrls = pickedAssets.map((a: any) => a.output_url);
    const imageDescriptions = pickedAssets.map((a: any, i: number) => ({
      index: i,
      summary: summarizeAsset(a),
    }));
    const heroSummary = summarizeAsset(hero);

    const briefTranscript =
      `店员:来一条 15 秒竖版${vtypeLabel}视频,主打${vtypeLabel === '探店' ? '店铺氛围' : '这件「' + heroSummary + '」'}。\n` +
      `助理:好的,按${vtypeLabel}节奏拆 3–4 个分镜,所有画面都用上传的实景照片,体现店铺调性。`;

    const scriptRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-marketing-video-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        shop_id: shopId,
        image_urls: imageUrls,
        video_type: vtype,
        duration: 15,
        aspect: '9:16',
        topic: `${vtypeLabel} · ${heroSummary}`,
        highlight: heroSummary.slice(0, 40),
        style,
        brief_transcript: briefTranscript,
        image_descriptions: imageDescriptions,
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

    const picked = {
      asset_id: hero.id,
      cover_url: hero.output_url,
      summary: heroSummary,
      tags: hero.tags || [],
      category: hero.category || null,
    };
    const assets = pickedAssets.map((a: any, i: number) => ({
      asset_id: a.id,
      index: i,
      url: a.output_url,
      summary: summarizeAsset(a),
      category: a.category || null,
    }));
    const characterOut = character
      ? { id: character.id, name: character.name, cover_url: character.cover_url }
      : null;

    const result = {
      ok: true,
      picked,
      assets,
      script,
      vtype,
      vtype_label: vtypeLabel,
      style,
      character: characterOut,
      duration: 15,
      aspect: '9:16',
    };

    if (preview) return json(result);

    // preview=false 且没有传 script:直接渲染当前脚本
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
