// 「惊喜一下」一键随机推广视频(锁死洗脑探店口播)
// 流程:
//   1. 从店铺素材库挑实景 + 优先找一张门头/店招做开场
//   2. 低概率使用与人物和门店自然匹配的临近节日(不自动蹭暑假)
//   3. 调 generate-marketing-video-script 出洗脑探店脚本(钩子+中段+收尾,15s 9:16)
//   4. preview=true → 返回 { picked, assets, script, holiday, ... } 给前端展示
//   5. preview=false → 用同一份 script 调 render-marketing-video 入队,渲染策略恒为 one_shot
// 注意:不再做"分镜↔素材一对一"绑定;assets 就是 reference_image 池(≤9),
//      由 Seedance one_shot 自己排镜头,人物一致性靠角色板 + 门头锁开场。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadShopContext } from "../_shared/shop-context.ts";
import { pickUpcomingHoliday, formatHolidayBrief } from "../_shared/holiday-context.ts";
import { generatePersona, formatPersonaDirective, formatPersonaBriefZh, type InfluencerPersona } from "../_shared/persona-generator.ts";
import { resolveStorefrontOpeningEn, resolveStorefrontOpeningZh } from "../_shared/storefront-constraints.ts";
import { bindSurpriseReferences, normalizeSurpriseScript } from "../_shared/surprise-one-shot.ts";

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
      const submittedAssets = Array.isArray(body.picked_assets) ? body.picked_assets : [];
      const submittedReferences = submittedAssets
        .map((asset: any) => ({ asset, url: String(asset?.url || asset?.output_url || '').trim() }))
        .filter((entry: any) => Boolean(entry.url))
        .slice(0, 9);
      const submittedImageUrls = submittedReferences.map((entry: any) => entry.url);
      if (!submittedImageUrls.length) {
        return json({ ok: false, error: '惊喜一下必须选择至少一张店铺实景图' });
      }
      const submittedDescriptions = submittedReferences.map(({ asset }: any, index: number) => ({
        index,
        summary: String(asset?.summary || (asset?.role === 'storefront' ? '门头和开放式店面' : `店内实景${index + 1}`)).slice(0, 160),
        role: asset?.role === 'storefront' ? 'storefront' : 'scene',
      }));
      const renderBody: any = {
        script: bindSurpriseReferences(normalizeSurpriseScript({
          ...body.script,
          video_type: 'store_tour',
          surprise_mode: true,
          intent: 'viral_store_tour',
          image_urls: submittedImageUrls,
          image_descriptions: submittedDescriptions,
          reference_manifest: submittedDescriptions,
        }), submittedImageUrls.length),
        style: body.style,
        shop_id: shopId,
        render_strategy: 'one_shot',
      };
      if (typeof body.model === 'string' && body.model) renderBody.model = body.model;
      if (typeof body.resolution === 'string' && body.resolution) renderBody.resolution = body.resolution;
      if (body.realism === 'photoreal' || body.realism === 'stylized') renderBody.realism = body.realism;
      // 员工极速成片必须以店铺实景图为事实锚点，禁止退化成无参考图生成。
      renderBody.disable_references = false;
      if (body.face_pipeline === 'character_sheet' || body.face_pipeline === 'illustration' || body.face_pipeline === 'faceless') {
        renderBody.face_pipeline = body.face_pipeline;
      }
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

    // 只挑用户上传的实景图,排除任何 AI 生成来源(分镜头/AI智能广告/AI 图等)
    const GENERATED_SOURCES = new Set([
      "storyboard", "ai_smart_ad", "ai-smart-ad", "ai_image",
      "smart_ad", "generated", "ai_generated",
    ]);
    const GENERATED_CATEGORIES = new Set(["分镜头", "AI生成", "AI 生成", "ai生成"]);
    const isUserUploaded = (a: any) => {
      const klass = a?.meta?.asset_class;
      if (klass === "generated") return false;
      if (klass === "base" || klass === "upload") return true;
      const src = a?.meta?.source;
      if (typeof src === "string" && GENERATED_SOURCES.has(src)) return false;
      if (a?.category && GENERATED_CATEGORIES.has(String(a.category))) return false;
      return true;
    };

    const { data: assetsRaw, error: aErr } = await admin.from("marketing_assets")
      .select("id, output_url, tags, category, meta, created_at")
      .eq("shop_id", shopId)
      .eq("kind", "photo")
      .not("output_url", "is", null)
      .gte("created_at", ninetyDays)
      .order("created_at", { ascending: false })
      .limit(160);
    if (aErr) return json({ ok: false, error: "读取素材失败: " + aErr.message });
    let pool = (assetsRaw || []).filter((a: any) => !exclude.includes(a.id) && isUserUploaded(a));
    if (pool.length === 0) {
      const { data: any2 } = await admin.from("marketing_assets")
        .select("id, output_url, tags, category, meta, created_at")
        .eq("shop_id", shopId).eq("kind", "photo").not("output_url", "is", null)
        .order("created_at", { ascending: false }).limit(80);
      pool = (any2 || []).filter((a: any) => !exclude.includes(a.id) && isUserUploaded(a));
    }
    if (pool.length === 0) {
      return json({ ok: false, error: "素材库还没有你上传的实景图,先去『素材库 › 图片』上传几张(AI 生成图不参与)" });
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
    // 节日只做低概率可选背景，避免每条内容都机械蹭热点。
    const holiday = pickUpcomingHoliday(new Date(), { chance: 0.2 });
    const holidayBrief = formatHolidayBrief(holiday);

    // 7) 动态生成「探店博主」人设(按品类/节日/店铺现场出 persona)
    const shopCtx = await loadShopContext(shopId);
    const allTags = Array.from(new Set(pickedAssets.flatMap((a: any) =>
      Array.isArray(a.tags) ? a.tags.map((t: any) => String(t)) : []
    )));
    const allCats = Array.from(new Set(pickedAssets.map((a: any) =>
      String(a.category || '')).filter(Boolean)));
    const persona: InfluencerPersona = await generatePersona({
      assetTags: allTags,
      assetCategories: allCats,
      shopName: shopCtx?.name || null,
      shopCategory: (shopCtx as any)?.category || null,
      holidayName: holiday?.name || null,
    });

    // 8) 拼装 brief:门头锁开场 + 节日借势 + 博主人设
    const style = pickWeighted(VIRAL_STYLE_WEIGHTS);
    const heroSummary = storefrontHit
      ? `${shopCtx?.name || '本店'}门头店招`
      : summarizeAsset(scenicAssets[0] || pickedAssets[0]);

    const randomHooks = sampleN(HOOK_POOL, 2).map((s) => `"${s}"`).join(" / ");
    const storefrontEvidence = `${JSON.stringify(shopCtx || {})}\n${pickedAssets.map((asset: any) => summarizeAsset(asset)).join('\n')}`;
    const storefrontOpeningZh = resolveStorefrontOpeningZh(storefrontEvidence);
    const openingDirective = storefrontHit
      ? `${storefrontOpeningZh} 参考图 1 是门头/店招/logo,务必在 0-3s 内露出;subtitle 像「${shopCtx?.name || '这家店'},冲!」之类。从第 2 镜起镜头已在店内货架间。`
      : `${storefrontOpeningZh} subtitle 像「${shopCtx?.name || '这家店'},冲!」。`;

    const briefTranscript =
      `店员:来一条 15 秒竖版探店口播,节奏严格按下面博主人设走(慢就慢、快就快,不要前后割裂)。\n` +
      `${formatPersonaBriefZh(persona)}\n` +
      `${openingDirective}\n` +
      `${holidayBrief ? holidayBrief + '\n' : ''}` +
      `【钩子句池】这次开场的钩子可参考(可改写,不要照抄,必须贴合博主语气与节奏):${randomHooks}。每次拍都要不一样,不要复用上次开头。\n` +
      `【全片要求】严格 5 个 3 秒镜头:钩子 1 镜 + 递进种草 3 镜 + CTA 1 镜。主角始终是上面那位虚构博主(同人同发型同服装),每镜都有动作(指/拿/试/转身/对镜头说话);**每一镜都必须有 dialogue 和 subtitle,严禁空台词**,五句合计 90–100 个汉字,用中文逗号连接后就是一条从 0.1 秒持续到 14.9 秒的完整口播。五段分别讲钩子 → 进店发现 → 商品细节 → 价值体验 → 行动召唤,画面、对白、字幕必须逐段对应。使用高能、兴奋、清楚的超快语速,切镜时声音不停。随机变化钩子、人设和表达,但主旨永远是强力种草当前门店;门店事实和卖点只能来自店铺画像、品牌知识库与已选实景素材,严禁编造价格或活动。博主每一镜都要有情绪推进,全部用上传的店内实景;结尾必须带 CTA(参考博主 CTA「${persona.cta}」)。`;

    // 9) 生成脚本
    const imageUrls = pickedAssets.map((a: any) => a.output_url);
    const imageDescriptions = pickedAssets.map((a: any, i: number) => ({
      index: i,
      summary: i === 0 && storefrontHit ? `门头/店招 · ${summarizeAsset(a)}` : summarizeAsset(a),
      role: i === 0 && storefrontHit ? 'storefront' : 'scene',
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
        // 把 persona 当虚构主角喂给脚本(用 character 字段复用现有 prompt 通路),不带 cover_url 避免被加进参考图
        character: {
          name: persona.label,
          role_label: '探店博主',
          visual_signature: persona.visual,
          core_emotion: persona.vibe,
          age_bucket: persona.age_bucket,
        },
      }),
    });
    const scriptData = await scriptRes.json().catch(() => ({}));
    if (!scriptRes.ok || !scriptData?.script) {
      return json({ ok: false, error: scriptData?.error || '脚本生成失败' });
    }
    const script = bindSurpriseReferences(normalizeSurpriseScript({
      ...scriptData.script,
      surprise_mode: true,
      intent: 'viral_store_tour',
      image_descriptions: imageDescriptions,
      reference_manifest: imageDescriptions,
      persona,
    }), imageUrls.length);

    // 10) 输出 assets(给前端做参考图横排展示)
    const assets = pickedAssets.map((a: any, i: number) => ({
      asset_id: a.id,
      index: i,
      url: a.output_url,
      summary: i === 0 && storefrontHit ? `门头 · ${summarizeAsset(a)}` : summarizeAsset(a),
      category: a.category || null,
      role: i === 0 && storefrontHit ? 'storefront' : 'scene',
    }));

    const coverUrl = storefrontHit?.output_url || pickedAssets[0]?.output_url;
    const picked = {
      asset_id: (storefrontHit || pickedAssets[0])?.id,
      cover_url: coverUrl,
      summary: heroSummary,
      tags: (storefrontHit || pickedAssets[0])?.tags || [],
      category: (storefrontHit || pickedAssets[0])?.category || null,
      theme_tag: themeTag,
      needs_storefront: needsStorefront,
    };

    // 11) 渲染 prompt_overrides:博主人设 + 开场强制门头 + 节日 vibe
    const storefrontOpeningEn = resolveStorefrontOpeningEn(storefrontEvidence);
    const openingEn = storefrontHit
      ? `${storefrontOpeningEn} The brand sign / logo from reference image #1 must remain visible in the opening 0-3s.`
      : storefrontOpeningEn;
    const styleCue = holiday?.vibe || undefined;
    const promptOverrides = {
      opening: openingEn,
      persona_directive: formatPersonaDirective(persona),
      ...(styleCue ? { style_cue: styleCue } : {}),
    };

    const result: any = {
      ok: true, picked, assets, script,
      vtype: 'store_tour', vtype_label: '洗脑探店', style,
      character: null,
      persona,
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
