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
    description: "整理一份「店员学习卡 + 客户话术卡」级别的官方知识词条草稿。",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "面向管理员的简短中文回复（≤80字），说明本次更新了哪些字段。" },
        draft: {
          type: "object",
          properties: {
            name: { type: "string", description: "商品/IP 名称，简体中文，必填。" },
            category: {
              type: "string",
              enum: [
                "jp_porcelain","eu_porcelain","incense","antique_art","local_craft",
                "anime_toy","otaku_goods","luxury","vintage_jewelry",
                "game_console","walkman","ccd","media_record","playback_device",
                "home_appliance","hobby","other",
              ],
              description: "品类英文键，严格使用枚举之一。",
            },
            ip_name: { type: "string", description: "IP / 系列 / 品牌名。" },
            era: { type: "string", description: "年代，如 昭和中期、1970s、1894 创立。" },
            origin: { type: "string", description: "产地，如 日本·有田。" },
            pronunciation: { type: "string", description: "罗马音/读法，如 Koransha / こうらんしゃ。" },
            aliases: {
              type: "array", items: { type: "string" },
              description: "常见别名/中日英写法，3-6 个。",
            },
            summary: { type: "string", description: "1-2 句中性简介，60-100字。" },
            one_liner: {
              type: "string",
              description:
                "★最重要★ 一句客户话术金句（≤30字），必须包含类比，模仿『香兰社是日瓷界的爱马仕』『Sonny Angel 是日本娃圈的盲盒鼻祖』这种结构。",
            },
            quick_facts: {
              type: "array",
              minItems: 5, maxItems: 5,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", enum: ["创立年代","产地","工艺","代表元素","价位段"] },
                  value: { type: "string", description: "8-20字具体内容。" },
                },
                required: ["label","value"],
              },
              description: "5 张速记卡，标签固定为 创立年代/产地/工艺/代表元素/价位段。",
            },
            customer_pitches: {
              type: "array",
              minItems: 3, maxItems: 3,
              items: {
                type: "object",
                properties: {
                  scene: { type: "string", enum: ["送礼","自用","收藏"] },
                  line: { type: "string", description: "可直接对客人念的话术，≤40字。" },
                },
                required: ["scene","line"],
              },
              description: "送礼/自用/收藏三场景各一句话术。",
            },
            selling_points: {
              type: "array",
              minItems: 4, maxItems: 6,
              items: {
                type: "object",
                properties: {
                  tag: { type: "string", description: "2-4字标签，如 工艺/历史/稀缺/质感。" },
                  text: { type: "string", description: "卖点主句，≤25字。" },
                  detail: { type: "string", description: "1-2句展开说明，40-80字。" },
                },
                required: ["tag","text","detail"],
              },
            },
            comparisons: {
              type: "array",
              minItems: 2, maxItems: 4,
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "易混淆品牌/类目名。" },
                  diff: { type: "string", description: "30-60字差异要点，帮店员一眼区分。" },
                },
                required: ["name","diff"],
              },
              description: "至少2条易混对比。",
            },
            tips: { type: "string", description: "店员小贴士：常见疑问/忌讳/保养，60-120字。" },
            body: {
              type: "string",
              description:
                "Markdown 长文，至少 800 字，使用二级标题 (## ) 分段，必须包含：## 历史由来 / ## 工艺与材质 / ## 鉴别要点（落款·釉色·重量·包装）/ ## 价位行情 / ## 与同类对比 / ## 保养与禁忌。要有具体年份、人名、品牌名、价格区间，不准空话套话。",
            },
            importance_score: { type: "number", description: "0-100 重要程度。" },
          },
          required: ["name","category","one_liner","quick_facts","customer_pitches","selling_points","body"],
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

const SYSTEM = `你是日本中古杂货店的金牌买手与培训讲师，正在为门店「官方知识库」撰写「店员学习卡 + 客户话术卡」。

【受众】
- 一线店员要能 30 秒读完核心，3 分钟掌握全貌，遇到客人能直接背话术。
- 全程简体中文。绝不使用「主播」一词；称呼对方「您」或「店员」。

【写作要求】
- one_liner 必须是带类比的金句，让顾客 3 秒记住。范例：
  · 「香兰社是日瓷界的爱马仕」
  · 「Sonny Angel 是日本娃圈的盲盒鼻祖」
  · 「Walkman 是 80 年代的 iPod」
- quick_facts 5 条标签固定：创立年代 / 产地 / 工艺 / 代表元素 / 价位段，每条要有具体数字或专有名词。
- customer_pitches 三句覆盖 送礼 / 自用 / 收藏，能直接对客人念。
- selling_points 4-6 条，每条 tag + 主句 + 展开 detail，不准空话。
- body 至少 800 字，强制二级标题分段：## 历史由来 / ## 工艺与材质 / ## 鉴别要点 / ## 价位行情 / ## 与同类对比 / ## 保养与禁忌。
- comparisons 至少 2 条易混品牌或类目对比，写明一眼可辨的差别。
- 数字、年份、人名、价格区间要尽量具体；不知道就给合理范围而不是空。

【品类映射（category 必须是英文键之一）】
- 日本陶瓷/有田/九谷/伊万里/美浓/香兰社/深川制磁 → jp_porcelain
- 欧洲瓷/Meissen/Wedgwood/Royal Copenhagen → eu_porcelain
- 线香/香道具 → incense
- 古美术/书画/铜器/漆器/木器 → antique_art
- 本地手作/民艺 → local_craft
- 动漫手办/玩具/Sonny Angel → anime_toy
- 二次元周边/痛包/谷子 → otaku_goods
- 奢侈品包袋/服饰 → luxury
- 中古首饰/胸针/项链 → vintage_jewelry
- 游戏机/掌机 → game_console
- 随身听/Walkman → walkman
- CCD/老相机 → ccd
- CD/磁带/黑胶/音像制品 → media_record
- 音响/CD机/功放/播放设备 → playback_device
- 家用电器/小家电 → home_appliance
- 模型/兴趣爱好杂物 → hobby
- 不确定 → other
不得返回上述列表外的任何 category 值。

【行为】
- 若用户在追问中要求修改，请基于已存在的草稿做增量更新，未提及字段保持不变；body 等长字段在追问时要持续扩充而非删减。
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
        content: `当前草稿（请在此基础上增量更新，未提及字段保持原值，body 等长文字段持续扩充）：\n${JSON.stringify(currentDraft, null, 2)}`,
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
        model: "google/gemini-2.5-pro",
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
