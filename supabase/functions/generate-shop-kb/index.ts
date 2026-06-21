import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY 未配置");

    const { type = "sop", topic = "", hint = "", categories = [], shop_id = null } = await req.json();
    if (!topic.trim()) throw new Error("缺少主题");

    const catList = (categories as { id: string; name: string }[])
      .map((c) => `- ${c.name}`).join("\n") || "（暂无现有分类）";

    const sysSop = `你是日本中古杂货店「BOOMER-OFF」的运营顾问，为门店店员撰写可执行的 SOP（标准作业程序）。
风格：复古、安静、整洁、强调商品故事感；不出现"主播"二字，称呼用"店员/你"。
每条 SOP 200-400 字，使用结构：
**目的** → 一句话
**时间节点** → 何时执行
**步骤清单** → 用 ☐ 复选号列出 4-8 步
**注意事项** → 2-4 条
**异常处理** → 2-3 条
正文使用 markdown，但不要出现一级标题。`;

    const sysQa = `你是日本中古杂货店「BOOMER-OFF」的客服主管，为店员撰写「常见问题应答模板」。
风格：自然、有温度、不夸张。称呼客人用"您"，称呼自己用"我们"或"店员"。
每条 200-300 字，结构：
**客户场景** → 一句话描述
**回答要点** → 3-5 条要点（带 ✓）
**示范话术** → 一段可直接读出来的话术，自然口语化
**升级处理** → 1-2 条何时上报店长`;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const kbHits = await kbSearch(admin, { query: `${topic} ${hint}`.trim(), scope: 'copy', shopId: shop_id, k: 5 });
    const kbBlock = formatKbBlock(kbHits);
    const system = (type === "qa" ? sysQa : sysSop) + kbBlock;

    const userPrompt = `请为以下主题生成一条${type === "qa" ? "客户问答" : "门店 SOP"}词条：

主题：${topic}
${hint ? `补充说明：${hint}\n` : ""}
现有分类（请优先匹配，匹配不上再新建简短中文分类名）：
${catList}

请通过工具返回结构化结果。`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_kb_entry",
            description: "输出一条知识库词条草稿",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "词条标题（≤20 字，中文）" },
                body: { type: "string", description: "正文 markdown，按 system 中的结构组织" },
                category_name: { type: "string", description: "最匹配的分类名，必须从现有分类里挑；若都不合适则给一个新的简短中文分类名（≤8 字）" },
                tags: { type: "array", items: { type: "string" }, description: "2-4 个中文标签，每个 ≤6 字" },
              },
              required: ["title", "body", "category_name"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_kb_entry" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请联系管理员充值");
      throw new Error(`AI ${resp.status}: ${t}`);
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI 未返回内容");
    const draft = JSON.parse(args);

    return new Response(JSON.stringify({ ok: true, draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-shop-kb error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
