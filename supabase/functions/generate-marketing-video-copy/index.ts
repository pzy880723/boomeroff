// 根据已生成视频的脚本 (marketing_video_jobs.script) 生成一条**视频广告文案**。
// 抖音 / 小红书 / 视频号 / 快手 / B站 通用,不再是纯小红书体。
// 输入: { asset_id } —— 从 marketing_assets 定位 job_id → 拉 script → 让 AI 写文案 → 回写 meta.video_copy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets } from "../_shared/brand-context.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";
import { scrubThirdPartyBrands, OWN_BRAND_LOCK_ZH } from "../_shared/brand-scrub.ts";

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
      c?.scene ? `画面:${String(c.scene).trim().slice(0, 60)}` : '',
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

    const jobId = (asset as any).meta?.job_id;
    let script: any = null;
    if (jobId) {
      const { data: job } = await admin.from('marketing_video_jobs' as any).select('script').eq('id', jobId).maybeSingle();
      script = (job as any)?.script || null;
    }
    if (!script) return json({ error: "找不到视频脚本" }, 404);

    const shopId: string | null = asset.shop_id || (typeof body.shop_id === 'string' ? body.shop_id : null);
    const presets = await loadMarketingPresets();
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);

    const topic = (asset as any).meta?.topic || script?.topic || script?.title || '';
    const title = script?.title || topic || '';
    const styleLabel = script?.style_label || (asset as any).meta?.style_label || '';
    const duration = script?.total_duration_s || (asset as any).meta?.duration || 15;

    const scriptDigest = summarizeScript(script);

    const kbQuery = [title, topic, styleLabel].filter(Boolean).join(' ');
    const kbHits = kbQuery ? await kbSearch(admin, { query: kbQuery, scope: 'copy', shopId, k: 6 }) : [];
    const kbBlock = formatKbBlock(kbHits);

    const sys = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}
${OWN_BRAND_LOCK_ZH}
${kbBlock}
你的任务:为一条已经拍好的 ${duration} 秒短视频写一条**视频广告文案**,
下发目标平台包括:抖音 / 小红书 / 视频号 / 快手 / B站,所以写法要**跨平台通用**,不做单一平台的极端体裁。
硬性要求:
- 文案必须紧扣视频真的说了什么、拍了什么(下面会给你视频脚本摘要),不要发挥无关内容。
- 单条输出(不要多个候选)。
- **标题** ≤22 字,口语化、有钩子(悬念/反差/身份代入/数字冲击择一),可带 1 个 emoji,不要标题党式感叹号轰炸。
- **正文** 100–180 字,分 2–4 短段(段落之间空一行),节奏短平快;
  - 首句必须是 hook,能在 3 秒内让人愿意看下去;
  - 中段用视频里的一两句真话/画面点作证据;
  - 结尾一句自然的 CTA(评论 / 收藏 / 到店 / 私聊 / 下一条见),带 1 个 emoji 收束。
  - emoji 全文控制在 3–6 个,适度点缀即可,不做小红书那种堆砌。
- **hashtags** 5–8 个,每个以 \`#\` 开头,顺序:品类/单品词 → 中古/vintage/二手好物 → 门店/城市/人群相关;不加平台专属标签(如 #小红书推荐)。
- **首评** 1 句,引导互动或补充信息,可带 1 个 emoji。
- 严禁:淘宝体、"点击购买"、"扫码下单"、公众号腔、硬广感叹号轰炸、假大空商业话术、明显偏向单一平台的黑话。

输出严格 JSON(单个对象,不要数组,不要 markdown 围栏):
{ "title": "...", "body": "...(可含 \\n)", "hashtags": ["#..."], "first_comment": "..." }`;


    const userMsg = scrubThirdPartyBrands(`视频标题:${title}
${topic && topic !== title ? `视频立意:${topic}` : ''}
视频节奏:共 ${duration} 秒,分镜如下:
${scriptDigest}`);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        temperature: 0.85,
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

    const sanitize = (s: string) =>
      scrubThirdPartyBrands(
        (s || '').toString()
          .replace(/主播/g, '店员')
          .replace(/直播间/g, '店里')
          .replace(/保真|保证升值|秒杀|限时抢|全网最低|拍卖行级别/g, '')
      ).trim();

    const copy = {
      title: sanitize(cand.title || '').slice(0, 40),
      body: sanitize(cand.body || '').slice(0, 800),
      hashtags: Array.isArray(cand.hashtags) ? cand.hashtags.map((x: any) => sanitize(String(x))).filter(Boolean).slice(0, 12) : [],
      first_comment: sanitize(cand.first_comment || '').slice(0, 200),
    };

    const nextMeta = { ...((asset as any).meta || {}), video_copy: copy };
    await admin.from('marketing_assets').update({ meta: nextMeta }).eq('id', assetId);

    return json({ success: true, copy, __kb_sources: kbSourcesMeta(kbHits) });
  } catch (e) {
    console.error("[video-ad-copy] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
