import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  pickCanonicalVideoAsset,
  resolveVideoAssetOwner,
} from "./marketing-video-assets.ts";

Deno.test("视频素材始终归属渲染任务用户而不是轮询用户", () => {
  assertEquals(resolveVideoAssetOwner("job-user", "poll-user"), "job-user");
});

Deno.test("封面回写优先选择任务所有者的唯一素材", () => {
  const rows = [
    { id: "wrong", user_id: "poll-user", created_at: "2026-08-31T08:40:00Z" },
    { id: "right", user_id: "job-user", created_at: "2026-08-31T08:34:00Z" },
  ];
  assertEquals(pickCanonicalVideoAsset(rows, "job-user")?.id, "right");
});
