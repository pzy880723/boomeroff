import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const POOL_TARGET = 10; // 题库目标容量
const SERVE_COUNT = 5; // 每次抽题数量

const TOOL = {
  type: "function",
  function: {
    name: "make_quiz",
    description: "围绕给定中古商品/IP 知识点生成 10 道四选一选择题。",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 10,
          maxItems: 10,
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Question {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 兼容旧结构:旧版只在 quiz.questions 里存 1 套 5 题,统一当作初始 pool 用 */
function readPool(quizField: any): Question[] {
  if (!quizField) return [];
  if (Array.isArray(quizField.pool)) return quizField.pool as Question[];
  if (Array.isArray(quizField.questions)) return quizField.questions as Question[];
  return [];
}

async function callAiForQuiz(existingStems: string[]): Promise<Question[]> {
  const dedupHint = existingStems.length > 0
    ? `\n\n已经出过的题目（题干列表，新题必须避开这些角度，换不同的考点和切入面）：\n${existingStems.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const sys = "你是日本中古杂货店的资深店长，正在出题考察店员对一件商品/IP 的了解程度。题目要紧扣给定知识点，难度适中，干扰项要合理但明显错误。题目角度要丰富：年代、产地、品牌史、材质、辨真伪、保养、搭配、价格段、文化背景等都可以出。全部使用简体中文，禁止出现「主播」一词。只通过 make_quiz 工具回复 10 道题。";

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys + dedupHint },
        { role: "user", content: "请基于以下知识点出 10 道选择题。" },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "make_quiz" } },
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("AI quiz error", aiResp.status, t);
    const err = new Error(aiResp.status === 429 ? "AI 调用频率过高" : aiResp.status === 402 ? "AI 额度不足" : "AI 出题失败");
    (err as any).status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
    throw err;
  }
  const data = await aiResp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    const err = new Error("AI 未返回题目");
    (err as any).status = 500;
    throw err;
  }
  const args = JSON.parse(call.function.arguments || "{}");
  return (args.questions || []) as Question[];
}

async function callAiWithKnowledge(knowledge: any, existingStems: string[]): Promise<Question[]> {
  const dedupHint = existingStems.length > 0
    ? `\n\n已经出过的题目（题干列表，新题必须避开这些角度，换不同的考点和切入面）：\n${existingStems.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  const sys = "你是日本中古杂货店的资深店长，正在出题考察店员对一件商品/IP 的了解程度。题目要紧扣给定知识点，难度适中，干扰项要合理但明显错误。题目角度要丰富：年代、产地、品牌史、材质、辨真伪、保养、搭配、价格段、文化背景等都可以出。全部使用简体中文，禁止出现「主播」一词。只通过 make_quiz 工具回复 10 道题。";

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys + dedupHint },
        { role: "user", content: `请基于以下知识点出 10 道选择题：\n${JSON.stringify(knowledge, null, 2)}` },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "make_quiz" } },
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("AI quiz error", aiResp.status, t);
    const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
    const err = new Error(status === 429 ? "AI 调用频率过高" : status === 402 ? "AI 额度不足" : "AI 出题失败");
    (err as any).status = status;
    throw err;
  }
  const data = await aiResp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    const err = new Error("AI 未返回题目");
    (err as any).status = 500;
    throw err;
  }
  const args = JSON.parse(call.function.arguments || "{}");
  return (args.questions || []) as Question[];
}

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
    if (!userData?.user) return json({ error: "未登录" }, 401);

    const { id, kind = "official", force = false } = await req.json();
    if (!id || typeof id !== "string") return json({ error: "缺少 id" }, 400);

    let knowledge: any = null;
    let existingPool: Question[] = [];
    let cacheKey = "";
    let officialRow: any = null;

    if (kind === "official") {
      const { data: row } = await adminClient
        .from("official_knowledge").select("*").eq("id", id).maybeSingle();
      if (!row) return json({ error: "词条不存在" }, 404);
      officialRow = row;
      existingPool = readPool((row.content as any)?.quiz);
      knowledge = {
        name: row.name, ip_name: row.ip_name, era: row.era, origin: row.origin,
        summary: row.summary, selling_points: row.selling_points,
        tips: row.tips, body: row.body,
      };
      cacheKey = `quiz_cache:official:${id}`;
    } else if (kind === "favorite") {
      const { data: fav } = await adminClient
        .from("user_favorites").select("snapshot, source_type, source_id")
        .eq("id", id).maybeSingle();
      if (!fav) return json({ error: "收藏不存在" }, 404);
      const snap = (fav.snapshot as any) || {};
      knowledge = {
        name: snap.name, era: snap.era, origin: snap.origin,
        summary: snap.summary || snap.description,
        selling_points: snap.selling_points,
        tips: snap.tips, category: snap.category,
      };
      cacheKey = `quiz_cache:favorite:${id}`;
    } else if (kind === "knowledge") {
      const { data: k } = await adminClient
        .from("product_knowledge")
        .select("product_name, category, era, origin, selling_points, tips")
        .eq("id", id).maybeSingle();
      if (!k) return json({ error: "知识不存在" }, 404);
      knowledge = {
        name: k.product_name, era: k.era, origin: k.origin,
        selling_points: k.selling_points, tips: k.tips, category: k.category,
      };
      cacheKey = `quiz_cache:knowledge:${id}`;
    } else {
      return json({ error: "kind 不合法" }, 400);
    }

    // 非 official:从 app_settings 读 pool
    if (kind !== "official") {
      const { data: s } = await adminClient
        .from("app_settings").select("value").eq("key", cacheKey).maybeSingle();
      existingPool = readPool(s?.value);
    }

    // force = 清空 pool,完全重新出
    if (force) existingPool = [];

    let pool = existingPool;

    // pool 不足 → 调 AI 补足到 POOL_TARGET
    if (pool.length < POOL_TARGET) {
      const existingStems = pool.map((q) => q.stem);
      const newQs = await callAiWithKnowledge(knowledge, existingStems);
      pool = [...pool, ...newQs];

      // 写回缓存
      if (kind === "official") {
        const newContent = {
          ...((officialRow?.content as any) || {}),
          quiz: { pool, generated_at: new Date().toISOString() },
        };
        await adminClient.from("official_knowledge").update({ content: newContent }).eq("id", id);
      } else {
        await adminClient.from("app_settings").upsert(
          { key: cacheKey, value: { pool, generated_at: new Date().toISOString() }, updated_by: userData.user.id },
          { onConflict: "key" },
        );
      }
    }

    // 从 pool 里随机抽 SERVE_COUNT 道
    const served = shuffle(pool).slice(0, Math.min(SERVE_COUNT, pool.length));
    return json({ questions: served, pool_size: pool.length, cached: !force && existingPool.length >= POOL_TARGET });
  } catch (e: any) {
    const status = e?.status && typeof e.status === "number" ? e.status : 500;
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "未知错误" }, status);
  }
});
