import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "write_body",
    description: "为词条撰写长正文 body（Markdown，≥800字，6 个二级标题）。",
    parameters: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "Markdown 长文，约 500-700 字。必须使用以下二级标题且按顺序：## 历史由来 / ## 工艺与材质 / ## 鉴别要点（落款·釉色·重量·包装）/ ## 价位行情 / ## 与同类对比 / ## 保养与禁忌。每段 60-120 字，要有具体年份、人名、品牌名、价格区间，不准空话套话。",
        },
      },
      required: ["body"],
    },
  },
} as const;

const SYSTEM = `你是日本中古杂货店的金牌买手与培训讲师，正在为门店「官方知识库」撰写长正文 body。

【规则】
- 全程简体中文，绝不使用「主播」一词，称呼对方「您」或「店员」。
- 约 500-700 字 Markdown，每段 60-120 字，紧凑实用。
- 强制使用以下 6 个二级标题且按顺序出现：
  ## 历史由来
  ## 工艺与材质
  ## 鉴别要点（落款·釉色·重量·包装）
  ## 价位行情
  ## 与同类对比
  ## 保养与禁忌
- 要有具体年份、人名、品牌名、价格区间；不要空话套话。
- 只通过 write_body 工具回复。`;

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
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "仅管理员可用" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { coreDraft = null } = await req.json();

    const chatMessages: any[] = [
      { role: "system", content: SYSTEM },
      {
        role: "system",
        content: `当前词条核心字段如下，请基于这些事实撰写长正文 body：\n${JSON.stringify(coreDraft, null, 2)}`,
      },
      { role: "user", content: "请撰写这条词条的长正文 body，约 500-700 字，严格使用规定的 6 个二级标题。" },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: chatMessages,
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "write_body" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI body error", aiResp.status, t);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      const msg = status === 429 ? "AI 调用频率过高，请稍后再试。" : status === 402 ? "AI 额度不足。" : "AI 调用失败。";
      return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiResp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "AI 未返回结构化结果" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const args = JSON.parse(call.function.arguments || "{}");
    return new Response(JSON.stringify(args), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
