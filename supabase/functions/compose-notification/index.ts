// 门店通知/资讯 AI 撰稿：一次调用直接出 JSON 草稿
// 入参: { messages: [{role, content}], current_draft?: {title, body, type} }
// 出参: { title, body, type, reply, need_more?: boolean } 或 { reply, need_more: true }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: "未登录" }, 401);

    const { messages = [], current_draft } = await req.json();

    const draftBlock = current_draft && (current_draft.title || current_draft.body)
      ? `\n\n【当前草稿】\n标题：${current_draft.title || ''}\n导语：${current_draft.summary || ''}\n类型：${current_draft.type || ''}\n正文：\n${current_draft.body || ''}`
      : '';

    const system = `你是 BOOMER GO 门店运营助手，帮管理员写门店通知/资讯。返回**必须是纯 JSON 对象**（不要 markdown、不要围栏、不要多余文字），schema：
{
  "need_more": boolean,        // true 表示信息严重不足需追问；否则 false 且必须给出稿件
  "reply": string,             // 一句话简短说明（追问或说明）
  "title": string,             // ≤ 24 字，开门见山
  "summary": string,           // 20-40 字的公众号式导语：一句话说清"这条讲的是什么、跟店员有什么关系"；不重复标题、不用感叹号堆砌
  "body": string,              // Markdown，2-5 段，使用 ## 小标题 / - 列表 / **加粗**
  "type": "announcement"|"policy"|"activity"|"urgent"
}
核心原则：
1) 默认「直接出稿」，能拼一段就出稿；只有输入不足 6 字且完全没有主题时才 need_more=true。
2) summary 必填，用作列表卡片摘要；不要照抄标题，也不要照抄正文首句。
3) 用户后续说「更短/更正式/更活泼/加数据/换个角度」等，基于【当前草稿】改写并再出稿（含 summary）。
4) 语气：专业但亲和，符合门店对店员的日常沟通，不要客服模板。
5) 严禁输出除 JSON 之外的任何字符。${draftBlock}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          ...messages.map((m: any) => ({ role: m.role, content: String(m.content || '') })),
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) return json({ error: "AI 请求过多，请稍后再试" }, 429);
    if (resp.status === 402) return json({ error: "AI 额度已用完，请到工作区充值" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `AI 错误：${resp.status} ${t.slice(0, 200)}` }, 500);
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    let parsed: any = null;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { /* fallback */ }
    if (!parsed || typeof parsed !== 'object') {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!parsed) return json({ need_more: true, reply: '我没听清，再说一下要发什么？' });

    return json(parsed);
  } catch (e: any) {
    return json({ error: e?.message || 'unknown error' }, 500);
  }
});
