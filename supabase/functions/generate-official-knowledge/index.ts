import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "upsert_knowledge",
    description: "根据对话整理一份官方知识词条草稿。",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "面向管理员的简短中文回复（≤80字），说明本次更新了哪些字段，可继续追问什么。" },
        draft: {
          type: "object",
          properties: {
            name: { type: "string", description: "商品/IP 名称，简体中文，必填。" },
            category: {
              type: "string",
              enum: [
                "tableware","glassware","figure","stationery","textile",
                "toy","electronics","accessory","book","other",
              ],
              description: "品类。未知则填 other。",
            },
            ip_name: { type: "string", description: "IP / 系列名，可空。" },
            era: { type: "string", description: "年代，如 昭和中期、1970s。" },
            origin: { type: "string", description: "产地，如 日本·有田。" },
            summary: { type: "string", description: "1-2 句简介，≤80字。" },
            selling_points: {
              type: "array",
              items: { type: "string" },
              description: "3-5 条核心卖点短句，每条≤25字。",
            },
            tips: { type: "string", description: "店员小贴士，≤60字。" },
            importance_score: { type: "number", description: "0-100 重要程度估值。" },
          },
          required: ["name", "category"],
        },
        cover_prompt: {
          type: "string",
          description:
            "一句英文 prompt，用于生成方形产品封面图。要求：素净背景、自然光、产品居中、写实风、不带文字水印。",
        },
      },
      required: ["reply", "draft", "cover_prompt"],
    },
  },
} as const;

const SYSTEM = `你是日本中古杂货店的资深选品官，正在协助门店管理员录入「官方知识库」词条。
- 全程使用简体中文，绝不使用「主播」一词，称呼对方为「您」或「店员」。
- 根据用户描述（可附带参考图）整理出准确、克制、有信息量的词条。
- 若用户在追问中要求修改，请基于已存在的草稿做增量更新，未提及字段保持不变。
- selling_points 要写成可直接对客人讲的短句，避免空话。
- 永远只通过 upsert_knowledge 工具回复，不要输出 JSON 文本。`;

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

    const { messages = [], currentDraft = null, referenceImageUrl = null } = await req.json();

    const chatMessages: any[] = [
      { role: "system", content: SYSTEM },
    ];
    if (currentDraft) {
      chatMessages.push({
        role: "system",
        content: `当前草稿（请在此基础上增量更新）：\n${JSON.stringify(currentDraft, null, 2)}`,
      });
    }
    for (const m of messages) {
      if (m.role === "user" && m.imageUrl) {
        chatMessages.push({
          role: "user",
          content: [
            { type: "text", text: m.content || "请基于这张参考图整理词条。" },
            { type: "image_url", image_url: { url: m.imageUrl } },
          ],
        });
      } else {
        chatMessages.push({ role: m.role, content: m.content });
      }
    }
    if (referenceImageUrl && !messages.some((m: any) => m.imageUrl)) {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: "请参考这张图。" },
          { type: "image_url", image_url: { url: referenceImageUrl } },
        ],
      });
    }

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
        tool_choice: { type: "function", function: { name: "upsert_knowledge" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      const msg = status === 429 ? "AI 调用频率过高，请稍后再试。" : status === 402 ? "AI 额度不足，请补充。" : "AI 调用失败。";
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
