import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "upsert_core",
    description: "整理「店员学习卡 + 客户话术卡」核心字段（不含 body 长正文）。",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "≤60字中文回复，说明本次更新了哪些字段。" },
        draft: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: {
              type: "string",
              enum: [
                "jp_porcelain","eu_porcelain","incense","antique_art","local_craft",
                "anime_toy","otaku_goods","luxury","jewelry",
                "game_console","walkman","ccd","media_record","playback_device",
                "home_appliance","hobby","stationery","lacquerware","bronze",
                "woodcraft","textile","painting","porcelain","other",
              ],
            },
            ip_name: { type: "string" },
            era: { type: "string" },
            origin: { type: "string" },
            pronunciation: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            summary: { type: "string", description: "1-2 句中性简介，60-100字。" },
            one_liner: {
              type: "string",
              description: "★金句★ ≤30字，必须含类比，模仿『香兰社是日瓷界的爱马仕』。",
            },
            quick_facts: {
              type: "array", minItems: 5, maxItems: 5,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", enum: ["创立年代","产地","工艺","代表元素","价位段"] },
                  value: { type: "string" },
                },
                required: ["label","value"],
              },
            },
            customer_pitches: {
              type: "array", minItems: 3, maxItems: 3,
              items: {
                type: "object",
                properties: {
                  scene: { type: "string", enum: ["送礼","自用","收藏"] },
                  line: { type: "string", description: "≤40字。" },
                },
                required: ["scene","line"],
              },
            },
            selling_points: {
              type: "array", minItems: 4, maxItems: 6,
              items: {
                type: "object",
                properties: {
                  tag: { type: "string" },
                  text: { type: "string" },
                  detail: { type: "string", description: "40-80字。" },
                },
                required: ["tag","text","detail"],
              },
            },
            comparisons: {
              type: "array", minItems: 2, maxItems: 4,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  diff: { type: "string", description: "30-60字。" },
                },
                required: ["name","diff"],
              },
            },
            tips: { type: "string", description: "60-120字保养与禁忌。" },
            importance_score: { type: "integer", minimum: 0, maximum: 100, description: "0-100 整数。" },
          },
          required: ["name","category","one_liner","quick_facts","customer_pitches","selling_points","comparisons","tips","importance_score"],
        },
        cover_prompt: {
          type: "string",
          description:
            "英文 prompt，方形产品封面图。禁止任何品牌/IP/角色/系列/公司/动漫/游戏名（中英日罗马字均禁）；只用通俗外观语言（物体类别+材质+颜色+形状/纹样+拍摄风格）；必须以 'on plain white background, soft natural light, centered, photorealistic, no text, no watermark, no logo' 收尾。已有封面时可不返回。",
        },
      },
      required: ["reply", "draft"],
    },
  },
} as const;

const SYSTEM = `你是日本中古杂货店的金牌买手，正在为门店「官方知识库」撰写「店员学习卡 + 客户话术卡」的核心卡片字段（不含正文 body）。

【受众】门店一线店员，全程简体中文，绝不使用「主播」一词，称呼对方「您」或「店员」。

【写作要求】
- one_liner 必须是带类比的金句，3 秒记住。
- quick_facts 5 条标签固定：创立年代/产地/工艺/代表元素/价位段，每条要有具体数字或专有名词。
- customer_pitches 三句覆盖 送礼/自用/收藏。
- selling_points 4-6 条，每条 tag + 主句 + detail，不准空话。
- comparisons 至少 2 条易混对比，写明一眼可辨的差别。
- tips 包含保养与禁忌。
- 数字、年份、人名、价格区间要尽量具体。

【category 映射】jp陶瓷→jp_porcelain；欧瓷→eu_porcelain；线香→incense；古美术/书画/铜漆木→antique_art；民艺→local_craft；手办玩具→anime_toy；二次元周边→otaku_goods；奢侈品→luxury；首饰→jewelry；游戏机→game_console；随身听→walkman；CCD相机→ccd；CD/磁带/黑胶→media_record；音响→playback_device；家电→home_appliance；模型杂物→hobby；不确定→other。

只通过 upsert_core 工具回复，绝不输出 JSON 文本。`;

async function callAI(chatMessages: any[]) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: chatMessages,
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "upsert_core" } },
    }),
  });
}

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

    const { currentDraft = null } = await req.json();
    const chatMessages: any[] = [
      { role: "system", content: SYSTEM },
    ];
    if (currentDraft) {
      chatMessages.push({
        role: "system",
        content: `当前草稿（在此基础上把所有核心字段重写补强到最高完成度，未提及字段也要补满；不要返回 body 长正文，本步只产出核心卡片字段）：\n${JSON.stringify(currentDraft, null, 2)}`,
      });
    }
    chatMessages.push({
      role: "user",
      content: "请把这条词条的核心卡片字段全部重写补全到最高完成度：金句更出圈、速记卡 5 条全填、客户话术 3 场景、卖点 4-6 条带 tag/text/detail、对比 ≥3 条、tips 保养与禁忌齐全。",
    });

    const aiResp = await callAI(chatMessages);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI core error", aiResp.status, t);
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
