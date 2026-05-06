import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "make_quiz",
    description: "围绕给定中古商品/IP 知识点生成 5 道四选一选择题。",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              stem: { type: "string", description: "问题题干，简体中文，≤60字。" },
              options: {
                type: "array",
                items: { type: "string" },
                minItems: 4,
                maxItems: 4,
                description: "4 个选项，简体中文，≤30字。",
              },
              correctIndex: { type: "number", description: "正确答案下标 0-3。" },
              explanation: { type: "string", description: "≤60字的简短解析。" },
            },
            required: ["stem", "options", "correctIndex", "explanation"],
          },
        },
      },
      required: ["questions"],
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { id, force = false } = await req.json();
    if (!id || typeof id !== "string") {
      return new Response(JSON.stringify({ error: "缺少 id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: row, error: rowErr } = await adminClient
      .from("official_knowledge").select("*").eq("id", id).single();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "词条不存在" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cached = (row.content as any)?.quiz?.questions;
    if (!force && Array.isArray(cached) && cached.length === 5) {
      return new Response(JSON.stringify({ questions: cached, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const knowledge = {
      name: row.name,
      ip_name: row.ip_name,
      era: row.era,
      origin: row.origin,
      summary: row.summary,
      selling_points: row.selling_points,
      tips: row.tips,
      body: row.body,
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "你是日本中古杂货店的资深店长，正在出题考察店员对一件商品/IP 的了解程度。题目要紧扣给定知识点，难度适中，干扰项要合理但明显错误。全部使用简体中文，禁止出现「主播」一词。只通过 make_quiz 工具回复。" },
          { role: "user", content: `请基于以下知识点出 5 道选择题：\n${JSON.stringify(knowledge, null, 2)}` },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "make_quiz" } },
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI quiz error", aiResp.status, t);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: status === 429 ? "AI 调用频率过高" : status === 402 ? "AI 额度不足" : "AI 出题失败" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiResp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "AI 未返回题目" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const args = JSON.parse(call.function.arguments || "{}");
    const questions = args.questions || [];

    // 用 service role 缓存到 content.quiz
    const newContent = { ...(row.content as any || {}), quiz: { questions, generated_at: new Date().toISOString() } };
    await adminClient.from("official_knowledge").update({ content: newContent }).eq("id", id);

    return new Response(JSON.stringify({ questions, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
