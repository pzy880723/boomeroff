import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectPendingAutoTagAssetIds } from "./auto-tag-assets.ts";

Deno.test("自动打标补偿只选择未完成且仍可重试的真实图片", () => {
  const now = Date.parse("2026-08-29T10:00:00.000Z");
  const assets = [
    { id: "done", output_url: "done.jpg", meta: { ai_tagged_at: "2026-08-29" } },
    { id: "pending", output_url: "pending.jpg", meta: { ai_tag_status: "pending" } },
    { id: "failed-once", output_url: "failed.jpg", meta: { ai_tag_status: "failed", ai_tag_attempts: 1 } },
    { id: "exhausted", output_url: "exhausted.jpg", meta: { ai_tag_status: "failed", ai_tag_attempts: 3 } },
    { id: "missing-url", output_url: null, meta: { ai_tag_status: "pending" } },
    { id: "processing", output_url: "processing.jpg", meta: { ai_tag_status: "processing", ai_tag_started_at: "2026-08-29T09:58:00.000Z" } },
    { id: "stale-processing", output_url: "stale.jpg", meta: { ai_tag_status: "processing", ai_tag_started_at: "2026-08-29T09:50:00.000Z" } },
  ];

  assertEquals(selectPendingAutoTagAssetIds(assets, 10, now), ["pending", "failed-once", "stale-processing"]);
});
