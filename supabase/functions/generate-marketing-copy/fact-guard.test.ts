// generate-marketing-copy 的事实保护直接测试(纯函数,不触网)。
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFactReviewPrompt,
  buildStrictFactsBlock,
  deterministicFactGuard,
  findForbiddenBrands,
  findUnsupportedNumbers,
  formatVerifiedFacts,
  parseFactReview,
} from "./fact-guard.ts";

const FACTS = formatVerifiedFacts({
  video_title: "BOOMER·OFF 门头探店",
  continuous_dialogue: "周末被朋友硬拉来南京西路说B1 藏了家中古杂货铺一进店就被满墙",
  visual_beats: [{ visual: "店内全景，货架高密度陈列", action: "环顾四周" }],
  reference_summaries: ["中古挂钟墙与陶瓷杯碟货架"],
  store: { brand_name: "BOOMER·OFF", category: "中古杂货门店" },
});

const ALLOWED = ["BOOMER", "BOOMER.OFF", "BOOMER·OFF"];

Deno.test("未核实数字 30,000+ 被判不通过", () => {
  const bad = findUnsupportedNumbers("30,000+ 件中古好物", FACTS);
  assertEquals(bad, ["30000"]);
});

Deno.test("B1 作为整体 token 放行", () => {
  assertEquals(findUnsupportedNumbers("下到 B1 层就看到店", FACTS), []);
  assertEquals(findUnsupportedNumbers("在B1闲逛", "（无楼层信息）"), []);
});

Deno.test("事实里出现过的数字可通过", () => {
  assertEquals(findUnsupportedNumbers("营业到 22 点", "- 营业时间：10:00-22:00"), []);
});

Deno.test("第三方品牌 / IP 被判不通过，允许品牌不受影响", () => {
  assert(findForbiddenBrands("满架子的 SATO 象", ALLOWED).includes("SATO"));
  assert(findForbiddenBrands("被奥特曼治愈了", ALLOWED).includes("奥特曼"));
  assert(findForbiddenBrands("佐藤象特写", ALLOWED).includes("佐藤象"));
  assertEquals(findForbiddenBrands("BOOMER·OFF 的中古杂货很治愈", ALLOWED), []);
});

Deno.test("确定性闸门：含 30,000+ / 奥特曼 / SATO 的候选整条被拒", () => {
  const r = deterministicFactGuard({
    title: "闯进 30,000+ 件中古宝库",
    body: "满架子的 SATO 象和奥特曼治愈了我。",
    hashtags: ["中古"],
  }, FACTS, ALLOWED);
  assertEquals(r.ok, false);
  assert(r.unsupported_claims.some((c) => c.includes("30000")));
  assert(r.unsupported_claims.some((c) => c.includes("SATO")));
  assert(r.unsupported_claims.some((c) => c.includes("奥特曼")));
});

Deno.test("确定性闸门：只重组已核实事实的候选可通过", () => {
  const r = deterministicFactGuard({
    title: "南京西路B1的中古杂货铺",
    body: "一进店就被满墙的中古挂钟和陶瓷杯碟震住，货架高密度陈列，随便逛都治愈。",
    hashtags: ["中古", "上海探店"],
  }, FACTS, ALLOWED);
  assertEquals(r, { ok: true, unsupported_claims: [] });
});

Deno.test("strict_facts prompt 含红线与已核实事实，不含密钥", () => {
  const block = buildStrictFactsBlock(FACTS, ALLOWED);
  assert(block.includes("strict_facts"));
  assert(block.includes("第三方品牌"));
  assert(block.includes("BOOMER·OFF"));
  assert(block.includes("中古挂钟墙"));
  assert(!/sb_secret|Bearer|api[_-]?key/i.test(block));
  assert(buildFactReviewPrompt(FACTS, ALLOWED).includes("unsupported_claims"));
});

Deno.test("审校返回解析：非法/矛盾一律不放行", () => {
  assertEquals(parseFactReview('{"supported": true, "unsupported_claims": []}'), { supported: true, unsupported_claims: [] });
  assertEquals(parseFactReview('```json\n{"supported": false, "unsupported_claims": ["数字"]}\n```')?.supported, false);
  assertEquals(parseFactReview("不是 JSON"), null);
  assertEquals(parseFactReview('{"supported":"yes"}'), null);
  // 自相矛盾（supported=true 但列出了问题）→ 判不通过
  assertEquals(parseFactReview('{"supported": true, "unsupported_claims": ["奥特曼"]}')?.supported, false);
});

Deno.test("非 automation 路径不引入 strict_facts（源码断言）", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("const strictFacts = isTrustedService && isAutomationMode && body?.strict_facts === true"));
  assert(src.includes('error: "no_fact_safe_candidate"'));
  const userPath = src.slice(src.indexOf("const admin = admin0;"));
  assert(!userPath.includes("deterministicFactGuard"), "人工调用路径不得改变");
});

Deno.test("字母+数字 token 必须整体出现在事实中", () => {
  const facts = "- 门店位置：南京西路 B1 层";
  assertEquals(findUnsupportedNumbers("下到 B1 就到店", facts), []);
  assertEquals(findUnsupportedNumbers("A99 号铺位", facts), ["A99"]);
  assertEquals(findUnsupportedNumbers("在 B2 层", facts), ["B2"]);
  assertEquals(findUnsupportedNumbers("X9 展柜", "（无楼层信息）"), ["X9"]);
  assert(deterministicFactGuard({ title: "B2 层新店", body: "来逛", hashtags: [] }, facts, ALLOWED).ok === false);
});
