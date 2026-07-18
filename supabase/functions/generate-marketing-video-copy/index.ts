// 根据已生成视频的脚本 (marketing_video_jobs.script 或 video_generation_jobs.script_json)
// 生成一条**视频广告文案**。抖音 / 小红书 / 视频号 / 快手 / B站 通用。
// 允许把真实分店名/商场名/城市写进正文和 hashtag(文案不进 Seedance,不会触发版权拦截);
// 只禁止地铁站/线路/公交/路名/门牌号/导航之类不准确的信息。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets } from "../_shared/brand-context.ts";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function summarizeScript(script: any): string {
  if (!script) return '';
  const seq: { label: string; c: any }[] = [];
  if (script.hook) seq.push({ label: '钩子', c: script.hook });
  if (Array.isArray(script.scenes)) script.scenes.forEach((c: any, i: number) => seq.push({ label: `镜${String(i + 1).padStart(2, '0')}`, c }));
  if (script.outro) seq.push({ label: '收尾', c: script.outro });
  const lines = seq.map(({ label, c }) => {
    const parts = [
      c?.dialogue ? `台词「${String(c.dialogue).trim()}」` : '',
      c?.subtitle ? `字幕「${String(c.subtitle).trim()}」` : '',
      c?.scene ? `画面:${String(c.scene).trim().slice(0, 80)}` : '',
    ].filter(Boolean).join(' · ');
    return `- [${label}] ${parts}`;
  });
  return lines.join('\n');
}

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
    const assetId: string = (body.asset_id || '').toString();
    if (!assetId) return json({ error: "缺少 asset_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: asset, error: aErr } = await admin.from('marketing_assets').select('*').eq('id', assetId).maybeSingle();
    if (aErr || !asset) return json({ error: "找不到素材" }, 404);
    if (asset.user_id !== u.user.id) return json({ error: "无权访问" }, 403);
    if (asset.kind !== 'video') return json({ error: "仅支持视频类型" }, 400);

    // 1) 优先从 marketing_video_jobs.script 拉;
    // 2) 兜底从 video_generation_jobs.script_json (Director / 惊喜一下 链路);
    // 3) 再兜底用 asset.meta.publish_copy/topic/summary 拼一个最小脚本。
    const meta: any = (asset as any).meta || {};
    // 生成结果是成片的一部分:已存在就直接返回,不因重复打开详情而重新采样。
    const savedCopy = meta.video_copy || meta.publish_copy;
    if (savedCopy && typeof savedCopy === 'object') {
      const copy = {
        title: savedCopy.title || savedCopy.cover_title || '',
        body: savedCopy.body || savedCopy.caption || savedCopy.douyin_caption || '',
        hashtags: Array.isArray(savedCopy.hashtags) ? savedCopy.hashtags : [],
        first_comment: savedCopy.first_comment || '',
      };
      if (!meta.video_copy) {
        await admin.from('marketing_assets').update({ meta: { ...meta, video_copy: copy } }).eq('id', assetId);
      }
      return json({ success: true, copy, cached: true });
    }
    let script: any = null;
    if (meta.job_id) {
      const { data: job } = await admin.from('marketing_video_jobs' as any).select('script').eq('id', meta.job_id).maybeSingle();
      script = (job as any)?.script || null;
    }
    if (!script && meta.director_job_id) {
      const { data: djob } = await admin.from('video_generation_jobs' as any).select('script_json').eq('id', meta.director_job_id).maybeSingle();
      script = (djob as any)?.script_json || null;
    }
    if (!script) {
      // 极简兜底:让 AI 至少能围绕主题写
      const pc = meta.publish_copy || {};
      const fallbackTitle = pc.cover_title || meta.title || meta.topic || meta.summary || 'BOOMER·OFF 中古探店';
      script = {
        title: fallbackTitle,
        topic: meta.topic || meta.summary || fallbackTitle,
        total_duration_s: meta.duration || meta.duration_s || 15,
        style_label: meta.style_label || '',
        scenes: [],
        __fallback: true,
      };
    }

    const shopId: string | null = asset.shop_id || (typeof body.shop_id === 'string' ? body.shop_id : null);
    const presets = await loadMarketingPresets();

    // 加载店铺基础信息:文案侧允许出现真实分店名/地址,种草感更真实。
    let shopName = '';
    let shopAddress = '';
    let shopCity = '';
    if (shopId) {
      const { data: shop } = await admin.from('shops').select('name, address, city').eq('id', shopId).maybeSingle();
      shopName = ((shop as any)?.name || '').toString().trim();
      shopAddress = ((shop as any)?.address || '').toString().trim();
      shopCity = ((shop as any)?.city || '').toString().trim();
    }

    // 从地址里挑一个"商场关键词"(如"中信泰富"),让 AI 有明确 hashtag 素材。
    const mallHint = (() => {
      const src = `${shopName} ${shopAddress}`;
      const m = src.match(/(中信泰富|恒隆|IFC|新天地|来福士|K11|久光|环贸|陆家嘴|SKP|国贸|万象城|万象汇|万象天地|龙湖天街|万达|凯德|合生汇|大悦城|太古里|太古汇|新光天地|印象城|前滩太古里)/);
      return m ? m[1] : '';
    })();

    const shopBlock = shopName || shopAddress
      ? `【店铺信息 —— 只用于文案,不进画面】
- 分店名:${shopName || '(未命名)'}
${shopCity ? `- 城市:${shopCity}\n` : ''}${shopAddress ? `- 地址:${shopAddress}\n` : ''}${mallHint ? `- 所在商场关键词:${mallHint}(可以放进正文与 hashtag)\n` : ''}- 营业时间:每天 10:00–22:00(标准营业时间,文末自然带一句即可,不要单独列时刻表)
这些字段**允许**写进正文和 hashtag —— 视频画面里不会出现商标,不会触发版权,请大胆用真实商场名让客户找得到。`
      : `【店铺信息】未绑定门店。文案不要暗示具体位置,不要编造分店名/商场名/城市。`;

    const topic = meta.topic || script?.topic || script?.title || '';
    const title = script?.title || topic || '';
    const styleLabel = script?.style_label || meta.style_label || '';
    const duration = script?.total_duration_s || meta.duration || meta.duration_s || 15;

    const scriptDigest = summarizeScript(script);
    const scriptFallback = !!script?.__fallback;

    const kbQuery = [title, topic, styleLabel].filter(Boolean).join(' ');
    const kbHits = kbQuery ? await kbSearch(admin, { query: kbQuery, scope: 'copy', shopId, k: 6 }) : [];
    const kbBlock = formatKbBlock(kbHits);

    const sys = `${presets.brand}

${shopBlock}

${kbBlock}
你的任务:为一条已经拍好的 ${duration} 秒短视频写一条**视频广告文案**,
下发目标平台:抖音 / 小红书 / 视频号 / 快手 / B站,写法跨平台通用,但整体偏"小红书网红种草感"—— 有画面、有情绪、有钩子。

【身份与口吻】
- 你是探店博主视角。提到自己/门店时,统一用品牌名「BOOMER·OFF」(简称「BOOMER」),不要写成"本店 / 我们门店 / 小店"这类奇怪口播。
- 如果上面【店铺信息】给了真实分店名/商场名(如"中信泰富 B1"),**鼓励**在正文里自然带一句"就在 XX B1"这种定位,让人一下能对上号;hashtag 里也可以直接放 #中信泰富 #静安中古 #上海中古店 之类。
- 结尾附近**必须**自然带一句营业时间(比如"每天 10:00–22:00,路过随时来逛"),不要生硬列成"营业时间:10:00–22:00"。

【严禁】
- 地铁线路号、地铁站名、公交线路、路名、门牌号、"步行 X 分钟"这类导航信息 —— 系统里没有准确数据,宁可不写,客户会自己搜。
- 虚假承诺:保真 / 保证升值 / 秒杀 / 限时抢 / 全网最低 / 拍卖行级别。
- 淘宝体:"点击购买"、"扫码下单"、公众号腔、感叹号轰炸。

【硬性输出规格】
- 单条输出(不要多个候选)。
- **标题** ≤22 字,要"标题党"式的钩子:悬念 / 反差 / 数字冲击 / 身份代入 / "谁懂啊家人们" / "刷到别划走"这种小红书网红体,允许 1–2 个 emoji,不要一堆感叹号。
- **正文** 140–200 字,分 2–3 短段(段落之间空一行),网红种草口吻;
  - 首句 3 秒 hook:反差感 / 私藏感 / 情绪拉扯 / 数字冲击择一;
  - 中段用视频里真实出现的画面或台词种草(比如"那件羊毛外套的手感"),可以顺势带一句"就在 ${mallHint || '商场'} B1 那家 BOOMER·OFF";
  - 末段一句自然营业时间 + CTA(评论 / 收藏 / 到店 / 私聊)。
- **emoji** 全文 4–7 个,允许小红书式点缀,别堆成一片。
- **hashtags** 6–10 个,每个以 \`#\` 开头,首个必须是 \`#BOOMEROFF\`;
  顺序建议:品类/单品词 → 中古/vintage/二手好物 → ${mallHint ? `商场(如 #${mallHint}) → ` : ''}${shopCity ? `城市(如 #${shopCity}中古) → ` : ''}人群相关(#通勤穿搭 / #复古女孩 等)。
  不加平台专属标签(如 #小红书推荐 #抖音推荐),不加地铁/交通类标签。
- **首评** 1 句,可以补充营业时间/位置或引导互动,可带 1 个 emoji。

${scriptFallback ? '注意:视频原始脚本没保留下来,请围绕上面的标题/立意/店铺信息发挥,画面细节不要瞎编。' : '文案必须紧扣下方视频脚本真实说了什么、拍了什么,不要发挥无关内容。'}

输出严格 JSON(单个对象,不要数组,不要 markdown 围栏):
{ "title": "...", "body": "...(可含 \\n)", "hashtags": ["#BOOMEROFF", "#..."], "first_comment": "..." }`;

    const userMsg = `视频标题:${title}
${topic && topic !== title ? `视频立意:${topic}\n` : ''}${styleLabel ? `风格:${styleLabel}\n` : ''}视频节奏:共 ${duration} 秒${scriptDigest ? ',分镜如下:\n' + scriptDigest : '(分镜细节已丢失,请围绕标题/立意写)'}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        temperature: 0.9,
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[video-ad-copy] AI", aiRes.status, t.slice(0, 400));
      if (aiRes.status === 429) return json({ error: "AI 限流，请稍后重试" }, 429);
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      return json({ error: "AI 生成失败" }, 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let cand: any = null;
    try { cand = JSON.parse(raw); } catch { /* */ }
    if (!cand || (!cand.title && !cand.body)) return json({ error: "AI 返回格式异常" }, 500);

    // 只做话术层敏感词过滤;允许出现分店名/商场名,不再抹除。
    const sanitize = (s: string) =>
      (s || '').toString()
        .replace(/主播/g, '店员')
        .replace(/直播间/g, '店里')
        .replace(/(?:^|[^a-zA-Z])本店/g, (m0) => m0.replace('本店', 'BOOMER·OFF'))
        .replace(/(BOOMER·OFF\s*){2,}/g, 'BOOMER·OFF')
        .replace(/保真|保证升值|秒杀|限时抢|全网最低|拍卖行级别/g, '')
        .trim();


    const copy = {
      title: sanitize(cand.title || '').slice(0, 40),
      body: sanitize(cand.body || '').slice(0, 800),
      hashtags: Array.isArray(cand.hashtags) ? cand.hashtags.map((x: any) => sanitize(String(x))).filter(Boolean).slice(0, 12) : [],
      first_comment: sanitize(cand.first_comment || '').slice(0, 200),
    };
    // 兜底:首个 hashtag 必是 #BOOMEROFF
    if (!copy.hashtags.some((h) => /BOOMEROFF/i.test(h))) copy.hashtags.unshift('#BOOMEROFF');

    const nextMeta = { ...meta, video_copy: copy };
    await admin.from('marketing_assets').update({ meta: nextMeta }).eq('id', assetId);

    return json({ success: true, copy, __kb_sources: kbSourcesMeta(kbHits) });
  } catch (e) {
    console.error("[video-ad-copy] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
