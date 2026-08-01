import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePublishCopy, normalizeSurpriseScript } from "./surprise-one-shot.ts";
import { buildCoverPlan, coverPollFields } from "./cover-generation.ts";

Deno.test("正文里重复的标题前缀会被删除", () => {
  const copy = normalizePublishCopy({
    title: "中古杂货店翻筐实录",
    body: "中古杂货店翻筐实录，一进门满眼老物件。慢慢翻能挑到心头好。",
    topics: ["中古"],
  });
  assertEquals(copy.title, "中古杂货店翻筐实录");
  assertEquals(copy.body, "一进门满眼老物件。慢慢翻能挑到心头好。");
});

Deno.test("话题标签规范成单个 # 并去重", () => {
  const copy = normalizePublishCopy({
    title: "标题",
    body: "正文",
    topics: ["##中古", "＃中古", " 复古 ", "复古", "", "淘货#"],
  });
  assertEquals(copy.topics, ["#中古", "#复古", "#淘货"]);
});

Deno.test("normalizeSurpriseScript 保留 publish_copy,缺失时只用脚本事实兜底", () => {
  const base = {
    hook: { dialogue: "来这家中古店别错过" },
    scenes: [{ dialogue: "一进门满眼复古杂货" }, { dialogue: "随手一拿都有故事" }, { dialogue: "预算不高也有惊喜" }],
    outro: { dialogue: "到店认真翻一圈" },
    title: "中古店翻筐实录",
  };
  const kept = normalizeSurpriseScript({ ...base, publish_copy: { title: "标题甲", body: "标题甲，正文乙", topics: ["中古"] } } as never);
  assertEquals(kept.publish_copy?.title, "标题甲");
  assertEquals(kept.publish_copy?.body, "正文乙");
  assertEquals(kept.publish_copy?.topics, ["#中古"]);

  const fallback = normalizeSurpriseScript({ ...base } as never);
  assertEquals(fallback.publish_copy?.title, "中古店翻筐实录");
  assertEquals(fallback.publish_copy?.body, fallback.continuous_dialogue);
  assertEquals(fallback.publish_copy?.topics, []);
});

Deno.test("封面文案来自当前脚本,不再使用通用文案池", () => {
  const plan = buildCoverPlan({
    jobId: "job-1",
    script: {
      title: "脚本标题",
      publish_copy: { title: "中古店翻筐实录", body: "一进门满眼老物件，慢慢翻能挑到心头好", topics: ["#中古"] },
      hero_product: "老唱片",
    },
  });
  assertEquals(plan.copy.headline, "中古店翻筐实录");
  assertEquals(plan.copy.subtitle, "一进门满眼老物件");
  assertEquals(plan.copy.highlight_keyword, "中古");
  assertEquals(plan.variation.product, "老唱片");

  const legacy = ["这家店我不许你不知道", "下班顺路挖到的宝", "一进门就走不动路", "中古控的快乐星球"];
  assert(!legacy.includes(plan.copy.headline));

  const noProduct = buildCoverPlan({ jobId: "job-2", script: { publish_copy: { title: "标题", body: "正文", topics: ["#老物件"] } } });
  assertEquals(noProduct.variation.product, "老物件");
});

Deno.test("coverPollFields 同时返回封面字段与 publish_copy", () => {
  const fields = coverPollFields(
    { notes: [], cover_generation: { status: "generating", progress: { percent: 40, stage: "seedream", message: "生成中" } } },
    { publish_copy: { title: "中古店翻筐实录", body: "中古店翻筐实录，一进门满眼老物件", topics: ["中古"] } },
  );
  assertEquals(fields.cover_status, "generating");
  assertEquals(fields.cover_url, null);
  assertEquals(fields.publish_copy?.title, "中古店翻筐实录");
  assertEquals(fields.publish_copy?.body, "一进门满眼老物件");
  assertEquals(fields.publish_copy?.topics, ["#中古"]);

  assertEquals(coverPollFields(null).publish_copy, null);
});
