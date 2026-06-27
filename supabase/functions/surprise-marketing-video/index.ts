// 「惊喜一下」一键随机推广视频(锁死洗脑探店口播)
// 流程:
//   1. 从店铺素材库挑实景 + 优先找一张门头/店招做开场
//   2. 借势最近的节日(暑假/端午/中秋/国庆…)
//   3. 调 generate-marketing-video-script 出洗脑探店脚本(钩子+中段+收尾,15s 9:16)
//   4. preview=true → 返回 { picked, assets, script, holiday, ... } 给前端展示
//   5. preview=false → 用同一份 script 调 render-marketing-video 入队,渲染策略恒为 one_shot
// 注意:不再做"分镜↔素材一对一"绑定;assets 就是 reference_image 池(≤9),
//      由 Seedance one_shot 自己排镜头,人物一致性靠角色板 + 门头锁开场。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadShopContext } from "../_shared/shop-context.ts";
import { pickUpcomingHoliday, formatHolidayBrief } from "../_shared/holiday-context.ts";
import { generatePersona, formatPersonaDirective, formatPersonaBriefZh, type InfluencerPersona } from "../_shared/persona-generator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STYLES = ['energetic', 'lively', 'playful'] as const;
type SType = typeof STYLES[number];

// 高转化探店的风格池
const VIRAL_STYLE_WEIGHTS: { item: SType; w: number }[] = [
  { item: 'energetic', w: 5 },
  { item: 'lively', w: 3 },
  { item: 'playful', w: 2 },
];

// 钩子句式池:每次随机抽 2 个塞进 brief,让相同店每次产出不同钩子
const HOOK_POOL = [
  "姐妹冲!",
  "别再去 XX 了",
  "我真的会谢",
  "不是吧还有人不知道",
  "这家店我能吹一年",
  "这家店神了!",
  "整条街最猛的一家",
  "拜托快冲!",
  "别再瞎逛了",
  "一进门就破防",
];

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

function sampleN<T>(arr: T[], n: number): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
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

const STOREFRONT_KW = ['门头', '门店', '店面', '门口', '店招', '招牌', '外观', '门头照', 'logo', 'storefront', 'facade'];
function isStorefrontAsset(a: any): boolean {
  const cat = String(a.category || '').toLowerCase();
  if (STOREFRONT_KW.some((k) => cat.includes(k.toLowerCase()))) return true;
  const tags = Array.isArray(a.tags) ? a.tags.map((t: any) => String(t || '').toLowerCase()) : [];
  if (tags.some((t) => STOREFRONT_KW.some((k) => t.includes(k.toLowerCase())))) return true;
  const summary = String((a.meta || {})?.summary || '').toLowerCase();
  if (STOREFRONT_KW.some((k) => summary.includes(k.toLowerCase()))) return true;
  return false;
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
    const realism: 'stylized' | 'photoreal' = body.realism === 'photoreal' ? 'photoreal' : 'stylized';

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ====== 提交模式:前端回传 preview 时生成的 script,直接渲染 ======
    if (!preview && body.script && body.picked_assets && body.style) {
      const renderBody: any = {
        script: { ...body.script, video_type: 'store_tour' },
        style: body.style,
        shop_id: shopId,
        render_strategy: 'one_shot',
      };
      if (typeof body.model === 'string' && body.model) renderBody.model = body.model;
      if (typeof body.resolution === 'string' && body.resolution) renderBody.resolution = body.resolution;
      if (body.realism === 'photoreal' || body.realism === 'stylized') renderBody.realism = body.realism;
      if (body.disable_references) renderBody.disable_references = true;
      if (body.prompt_overrides && typeof body.prompt_overrides === 'object') {
        renderBody.prompt_overrides = body.prompt_overrides;
      }
      const renderRes = await fetch(`${SUPABASE_URL}/functions/v1/render-marketing-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(renderBody),
      });
      const renderData = await renderRes.json().catch(() => ({}));
      if (!renderRes.ok || renderData?.ok === false || !renderData?.job_id) {
        return json({ ok: false, error: renderData?.error || '渲染提交失败' });
      }
      return json({ ok: true, job_id: renderData.job_id, segment_total: renderData.segment_total || 1 });
    }

    // ====== Preview / 兜底:全流程 ======
    // 1) 拉素材库里这家店的实景商品图(剔除合成静帧)
    const ninetyDays = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: assetsRaw, error: aErr } = await admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, created_at")
      .eq("shop_id", shopId)
      .eq("kind", "photo")
      .not("output_url", "is", null)
      .or("category.is.null,category.neq.分镜头")
      .not("meta->>source", "eq", "storyboard")
      .gte("created_at", ninetyDays)
      .order("created_at", { ascending: false })
      .limit(80);
    if (aErr) return json({ ok: false, error: "读取素材失败: " + aErr.message });
    let pool = (assetsRaw || []).filter((a: any) => !exclude.includes(a.id));
    if (pool.length === 0) {
      const { data: any2 } = await admin.from("marketing_assets")
        .select("id, output_url, tags, category, meta, created_at")
        .eq("shop_id", shopId).eq("kind", "photo").not("output_url", "is", null)
        .or("category.is.null,category.neq.分镜头")
        .not("meta->>source", "eq", "storyboard")
        .order("created_at", { ascending: false }).limit(40);
      pool = (any2 || []).filter((a: any) => !exclude.includes(a.id));
    }
    if (pool.length === 0) {
      return json({ ok: false, error: "素材库还没有商品图,先去拍/上传几张" });
    }

    // 2) 找门头:命中则锁第 1 位;没命中只标记,不阻塞
    const storefrontHit = pool.find(isStorefrontAsset) || null;
    const needsStorefront = !storefrontHit;
    const remainPool = storefrontHit ? pool.filter((a: any) => a.id !== storefrontHit.id) : pool;

    // 3) 主题聚拢:按 tag/category 频次抽一个主题词,围绕它从剩余 pool 挑实景
    const themeCounter = new Map<string, number>();
    remainPool.forEach((a: any) => {
      const cat = (a.category || '').toString().trim();
      if (cat) themeCounter.set(cat, (themeCounter.get(cat) || 0) + 1);
      (Array.isArray(a.tags) ? a.tags : []).forEach((t: any) => {
        const k = String(t || '').trim();
        if (k) themeCounter.set(k, (themeCounter.get(k) || 0) + 1);
      });
    });
    const themeCandidates = Array.from(themeCounter.entries())
      .filter(([, c]) => c >= 2)
      .map(([k, c]) => ({ item: k, w: c }));
    let themeTag: string | null = null;
    if (themeCandidates.length) themeTag = pickWeighted(themeCandidates);

    const matchTheme = (a: any) => {
      if (!themeTag) return false;
      if ((a.category || '') === themeTag) return true;
      return (Array.isArray(a.tags) ? a.tags : []).some((t: any) => String(t) === themeTag);
    };
    const hits = themeTag ? remainPool.filter(matchTheme) : [];
    const misses = themeTag ? remainPool.filter((a: any) => !matchTheme(a)) : remainPool;

    // 参考图槽位封顶 9(对齐 Seedance 2.0 reference_image 上限)
    // 惊喜流程不使用角色板,主角是 AI 现场生成的虚构「探店博主」,不绑参考图。
    // 已用槽:门头 1 张;剩下全部给实景。
    const storefrontSlot = storefrontHit ? 1 : 0;
    const ASSET_SLOT_FOR_SCENES = Math.max(3, 9 - storefrontSlot);
    const targetCount = Math.min(remainPool.length, ASSET_SLOT_FOR_SCENES);
    let scenicAssets: any[];
    if (themeTag && hits.length >= 3) {
      const hitsW = hits.map((a: any, idx: number) => ({ item: a, w: 1 + Math.max(0, 20 - idx) * 0.1 }));
      scenicAssets = sampleWeighted(hitsW, Math.min(targetCount, hits.length));
    } else if (themeTag && hits.length > 0) {
      const extraN = Math.max(0, targetCount - hits.length);
      const extraW = misses.map((a: any, idx: number) => ({ item: a, w: 1 + Math.max(0, 20 - idx) * 0.1 }));
      const extras = sampleWeighted(extraW, Math.min(extraN, misses.length));
      scenicAssets = [...hits.slice(0, targetCount), ...extras];
    } else {
      const weighted = remainPool.map((a: any, idx: number) => ({ item: a, w: 1 + Math.max(0, 20 - idx) * 0.1 }));
      scenicAssets = sampleWeighted(weighted, targetCount);
    }

    // 4) 最终 pickedAssets:门头(若有)+ 实景
    const pickedAssets: any[] = [
      ...(storefrontHit ? [storefrontHit] : []),
      ...scenicAssets,
    ];
    // 若实景不够,继续从剩余池补满 9 张
    if (pickedAssets.length < 9) {
      const used = new Set(pickedAssets.map((a: any) => a.id));
      const extras = remainPool.filter((a: any) => !used.has(a.id)).slice(0, 9 - pickedAssets.length);
      pickedAssets.push(...extras);
    }


    // 6) 节日借势
    const holiday = pickUpcomingHoliday(new Date());
    const holidayBrief = formatHolidayBrief(holiday);

    // 7) 拼装 brief:门头锁开场 + 节日借势 + 随机钩子句池 + 多样性指令
    const style = pickWeighted(VIRAL_STYLE_WEIGHTS);
    const shopCtx = await loadShopContext(shopId);
    const heroSummary = storefrontHit
      ? `${shopCtx?.name || '本店'}门头店招`
      : summarizeAsset(scenicAssets[0] || pickedAssets[0]);

    const randomHooks = sampleN(HOOK_POOL, 2).map((s) => `"${s}"`).join(" / ");
    const openingDirective = storefrontHit
      ? `【强制开场(第 1 镜 / 0–2s · 不可改)】镜头先给参考图 1(门头/店招/logo)2 秒特写或推镜,主角站在门口或推门进店;subtitle 像「${shopCtx?.name || '这家店'},冲!」之类。从第 2 镜开始才进店内场景。`
      : `【强制开场(第 1 镜 / 0–2s)】先给一个店门口的镜头,主角推门或转身进店;subtitle 像「${shopCtx?.name || '这家店'},冲!」。注意:店里还没传门头照,模型自由发挥即可。`;

    const briefTranscript =
      `店员:来一条 15 秒竖版洗脑探店口播。\n` +
      `${openingDirective}\n` +
      `${holidayBrief ? holidayBrief + '\n' : ''}` +
      `【钩子句池】这次开场的钩子从下面里挑一种风格(可改写,不要照抄):${randomHooks}。每次拍都要不一样,不要复用上次开头。\n` +
      `【全片要求】共 6-8 个 1.5-2.5 秒小镜头,主角始终是同一个人(沿用上面锁定的角色),每镜都有动作(指/拿/试/转身);全部用上传的店内实景;字幕大白话带情绪符号,结尾必须带 CTA(「地址放评论区」「现在冲」「错过等一年」)。`;

    // 8) 生成脚本
    const imageUrls = pickedAssets.map((a: any) => a.output_url);
    const imageDescriptions = pickedAssets.map((a: any, i: number) => ({
      index: i,
      summary: i === 0 && storefrontHit ? `门头/店招 · ${summarizeAsset(a)}` : summarizeAsset(a),
    }));

    const scriptRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-marketing-video-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        shop_id: shopId,
        image_urls: imageUrls,
        video_type: 'store_tour',
        duration: 15,
        aspect: '9:16',
        topic: `${holiday?.name ? holiday.name + ' · ' : ''}探店 · ${heroSummary}`,
        highlight: heroSummary.slice(0, 40),
        style,
        intent: 'viral_store_tour',
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

    // 9) 输出 assets(给前端做参考图横排展示):门头/角色板优先,顺序就是 reference_image 顺序
    const assets = pickedAssets.map((a: any, i: number) => ({
      asset_id: a.id,
      index: i,
      url: a.output_url,
      summary: i === 0 && storefrontHit ? `门头 · ${summarizeAsset(a)}` : summarizeAsset(a),
      category: a.category || null,
      role: i === 0 && storefrontHit ? 'storefront' : 'scene',
    }));

    // cover:门头优先,其次角色板,再次第一张实景
    const coverUrl = storefrontHit?.output_url || character?.cover_url || pickedAssets[0]?.output_url;
    const picked = {
      asset_id: (storefrontHit || pickedAssets[0])?.id,
      cover_url: coverUrl,
      summary: heroSummary,
      tags: (storefrontHit || pickedAssets[0])?.tags || [],
      category: (storefrontHit || pickedAssets[0])?.category || null,
      theme_tag: themeTag,
      needs_storefront: needsStorefront,
    };

    // 10) 渲染 prompt_overrides:开场强制门头 + 节日 vibe
    const openingEn = storefrontHit
      ? "Opening shot (0-2s): exterior storefront sign and brand logo in reference image #1, character walks toward the door or pushes the door open, hand-held push-in. Only from shot #2 the camera enters the shop interior."
      : "Opening shot (0-2s): exterior shop entrance, character pushes the door open with a hand-held push-in. Only from shot #2 the camera enters the shop interior.";
    const styleCue = holiday?.vibe || undefined;
    const promptOverrides = { opening: openingEn, ...(styleCue ? { style_cue: styleCue } : {}) };

    const characterOut = character
      ? { id: character.id, name: character.name, cover_url: character.cover_url }
      : null;

    const result: any = {
      ok: true, picked, assets, script,
      vtype: 'store_tour', vtype_label: '洗脑探店', style,
      character: characterOut,
      holiday: holiday ? { name: holiday.name, days_away: holiday.daysAway } : null,
      duration: 15, aspect: '9:16',
      prompt_overrides: promptOverrides,
    };

    if (preview) return json(result);

    // preview=false 且没回传 script:直接渲染
    const renderRes = await fetch(`${SUPABASE_URL}/functions/v1/render-marketing-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        script: { ...script, video_type: 'store_tour' },
        style, shop_id: shopId, realism,
        render_strategy: 'one_shot',
        prompt_overrides: promptOverrides,
      }),
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
