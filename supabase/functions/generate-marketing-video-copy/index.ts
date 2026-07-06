// 根据已生成视频的脚本 (marketing_video_jobs.script) 生成一条小红书文案。
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
你的任务:为一条已经拍好的 ${duration} 秒短视频写一条**小红书发帖文案**,要有正宗小红书那味儿——姐妹们唠嗑感、活泼、有 emoji、有互动欲。
硬性要求:
- 文案必须紧扣视频真的说了什么、拍了什么(下面会给你视频脚本摘要),不要发挥无关内容。
- 单条输出(不要多个候选)。
- **标题** ≤22 字,**必须带 1–2 个 emoji**(✨🔥📦💖🎁👀🛍️😭🤌🥹💫🫶 等挑合适的用);句式可用"姐妹们/家人们/谁懂啊/绝了/这也太…了吧/××人狂喜"这类小红书口播感开头。
- **正文** 120–200 字,分 3–5 短段(段落之间空一行);**每 1–2 句自然穿插一个相关 emoji**,可用【】‼️⁉️~ 等符号点缀;可以引用视频里的一两句台词;**结尾必须一句 call-to-action 带 emoji**(如 "冲鸭🛍️" "蹲一个💫" "评论区聊聊👇")。
- **hashtags** 6–10 个,每个以 `#` 开头;顺序:品类/单品词 → 中古/vintage/二手好物 → 门店/城市/人群相关。
- **首评** 1 句,引导互动或补充信息,**带 1 个 emoji**。
- 严禁:淘宝体、"点击购买"、"扫码下单"、公众号腔、硬广感叹号轰炸、假大空商业话术。

输出严格 JSON(单个对象,不要数组):
{ "title": "...", "body": "...(可含 \\n)", "hashtags": ["#..."], "first_comment": "..." }
只返回 JSON,不要 \`\`\` 包裹,不要多余文字。`;


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
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[video-copy] AI", aiRes.status, t.slice(0, 400));
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
    console.error("[video-copy] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
