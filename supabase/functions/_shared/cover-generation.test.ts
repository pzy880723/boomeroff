// 一键视频完成后的封面生成:旧任务兼容 / JSONB 合并 / 原子 claim / 失败不降级 / 90 天去重 / poll 字段
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCoverPlan,
  coverPollFields,
  copyFingerprint,
  ensureCoverQueued,
  loadRecentSignatures,
  mergeCoverGeneration,
  normalizeFallbackNotes,
  readCoverGeneration,
  resolveCoverWorkerToken,
  variationKey,
} from "./cover-generation.ts";

Deno.test("旧任务兼容:数组 / null / 对象都能读", () => {
  assertEquals(normalizeFallbackNotes(["降级A"]).notes, ["降级A"]);
  assertEquals(normalizeFallbackNotes(["降级A"]).cover_generation, null);
  assertEquals(normalizeFallbackNotes(null).notes, []);
  const obj = normalizeFallbackNotes({ notes: ["x"], cover_generation: { status: "queued" }, other: 1 });
  assertEquals(obj.notes, ["x"]);
  assertEquals(obj.cover_generation?.status, "queued");
  assertEquals(obj.extra.other, 1);
});

Deno.test("JSONB 合并保留其它键与旧数组 notes", () => {
  const merged = mergeCoverGeneration(["旧提示"], { status: "queued" });
  assertEquals((merged.notes as string[]), ["旧提示"]);
  assertEquals((merged.cover_generation as any).status, "queued");

  const merged2 = mergeCoverGeneration(
    { notes: ["n"], other_key: { a: 1 }, cover_generation: { status: "queued", cover_url: null, copy: { headline: "h" } } },
    { status: "succeeded", cover_url: "https://cdn/c.jpg" },
  );
  assertEquals((merged2.other_key as any).a, 1);
  assertEquals((merged2.cover_generation as any).status, "succeeded");
  assertEquals((merged2.cover_generation as any).cover_url, "https://cdn/c.jpg");
  // 未在 patch 中的旧字段必须保留
  assertEquals((merged2.cover_generation as any).copy.headline, "h");
});

// ---- 假 supabase client ----
function fakeAdmin(rows: any[], opts: { claimWins?: boolean } = {}) {
  const calls: any[] = [];
  const api = {
    rows,
    calls,
    from() {
      const state: any = { filters: [], update: null };
      const builder: any = {
        select: () => builder,
        eq: (k: string, v: unknown) => { state.filters.push(["eq", k, v]); return builder; },
        gte: () => builder,
        lt: () => builder,
        in: () => builder,
        not: () => builder,
        is: (k: string, v: unknown) => { state.filters.push(["is", k, v]); return builder; },
        filter: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (patch: any) => { state.update = patch; calls.push(patch); return builder; },
        maybeSingle: () => {
          if (state.update) {
            const ok = opts.claimWins !== false;
            if (ok) rows[0].fallback_notes = state.update.fallback_notes;
            return Promise.resolve({ data: ok ? rows[0] : null });
          }
          return Promise.resolve({ data: rows[0] ?? null });
        },
        then: (r: any) => Promise.resolve({ data: rows }).then(r),
      };
      return builder;
    },
  };
  return api as any;
}

Deno.test("原子 claim:CAS 失败时不返回任务", async () => {
  const job = { id: "job-1", user_id: "u1", shop_id: "s1", video_url: "https://cdn/v.mp4", script: {}, fallback_notes: [] };
  const lost = fakeAdmin([{ ...job }], { claimWins: false });
  const r = await ensureCoverQueued(lost, job);
  assertEquals(r.queued, false);
});

Deno.test("入队幂等:已有 cover_generation 不重复写", async () => {
  const job = {
    id: "job-2", user_id: "u1", shop_id: "s1", video_url: "https://cdn/v.mp4", script: {},
    fallback_notes: { notes: [], cover_generation: { status: "generating" } },
  };
  const admin = fakeAdmin([job]);
  const r = await ensureCoverQueued(admin, job);
  assertEquals(r.queued, false);
  assertEquals(r.reason, "already_exists");
  assertEquals(admin.calls.length, 0);
});

Deno.test("没有 video_url 不入队;入队后状态为 queued", async () => {
  const noUrl = await ensureCoverQueued(fakeAdmin([]), { id: "j", video_url: null } as any);
  assertEquals(noUrl.reason, "no_video_url");

  const job = { id: "job-3", user_id: "u1", shop_id: "s1", video_url: "https://cdn/v.mp4", script: { title: "中古店翻筐实录", hero_product: "老相机" }, fallback_notes: ["旧提示"] };
  const admin = fakeAdmin([job]);
  const r = await ensureCoverQueued(admin, job);
  assertEquals(r.queued, true);
  const cg = readCoverGeneration(admin.calls[0].fallback_notes)!;
  assertEquals(cg.status, "queued");
  assert(cg.copy.headline.length > 0);
  assertEquals(cg.variation.product, "老相机");
  assertEquals((admin.calls[0].fallback_notes as any).notes, ["旧提示"]);
});

Deno.test("90 天去重:碰撞时换候选", () => {
  const base = buildCoverPlan({ jobId: "job-x", script: { products: ["中古花瓶", "旧唱片"] } });
  const next = buildCoverPlan({
    jobId: "job-x",
    script: { products: ["中古花瓶", "旧唱片"] },
    usedCopyFingerprints: [base.copy_fingerprint],
    usedVariationKeys: [base.variation_key],
  });
  // 文案完全由脚本事实决定,不再靠通用文案池换一套
  assertEquals(next.copy_fingerprint, base.copy_fingerprint);
  assert(next.variation_key !== base.variation_key, "变体必须换一套");
  assertEquals(copyFingerprint(next.copy), next.copy_fingerprint);
  assertEquals(variationKey(next.variation), next.variation_key);
  // 同一个 job 无碰撞时结果稳定
  assertEquals(buildCoverPlan({ jobId: "job-x", script: { products: ["中古花瓶", "旧唱片"] } }).copy_fingerprint, base.copy_fingerprint);
});

Deno.test("商品只来自脚本/素材,不杜撰品牌", () => {
  const plan = buildCoverPlan({ jobId: "job-y", script: { shots: [{ product: "搪瓷杯" }] } });
  assertEquals(plan.variation.product, "搪瓷杯");
  const generic = buildCoverPlan({ jobId: "job-z", script: { title: "中古店翻筐实录" } });
  assertEquals(generic.variation.product, "中古店翻筐实录");
});

Deno.test("90 天签名读取只取有 cover_generation 的任务", async () => {
  const admin = fakeAdmin([
    { id: "a", fallback_notes: ["旧"] },
    { id: "b", fallback_notes: { cover_generation: { copy_fingerprint: "fp1", variation_key: "vk1" } } },
    { id: "self", fallback_notes: { cover_generation: { copy_fingerprint: "fp-self", variation_key: "vk-self" } } },
  ]);
  const sig = await loadRecentSignatures(admin, { shopId: "s1", excludeJobId: "self" });
  assertEquals(sig.copy, ["fp1"]);
  assertEquals(sig.variation, ["vk1"]);
});

Deno.test("失败不降级:failed 只返回错误,不给任何 cover_url", () => {
  const failed = mergeCoverGeneration([], { status: "failed", error: "Seedream 拒绝", cover_url: null });
  const fields = coverPollFields(failed);
  assertEquals(fields.cover_status, "failed");
  assertEquals(fields.cover_url, null);
  assertEquals(fields.cover_error, "Seedream 拒绝");
});

Deno.test("poll 字段:未成功时不暴露 cover_url,成功后暴露", () => {
  assertEquals(coverPollFields(["旧"]).cover_status, null);
  const gen = mergeCoverGeneration([], { status: "generating", progress: { percent: 40, stage: "seedream", message: "生成中" }, cover_url: null });
  const f1 = coverPollFields(gen);
  assertEquals(f1.cover_status, "generating");
  assertEquals(f1.cover_url, null);
  assertEquals(f1.cover_progress?.percent, 40);

  const ok = mergeCoverGeneration(gen, { status: "succeeded", cover_url: "https://cdn/cover.jpg" });
  const f2 = coverPollFields(ok);
  assertEquals(f2.cover_status, "succeeded");
  assertEquals(f2.cover_url, "https://cdn/cover.jpg");
  assertEquals(f2.cover_error, null);
});

Deno.test("worker token:COVER_WORKER_TOKEN > WORKER_SHARED_SECRET > COMPOSE_WORKER_TOKEN", () => {
  const mk = (m: Record<string, string>) => (k: string) => m[k];
  assertEquals(resolveCoverWorkerToken(mk({ COVER_WORKER_TOKEN: "a", WORKER_SHARED_SECRET: "b", COMPOSE_WORKER_TOKEN: "c" })), "a");
  assertEquals(resolveCoverWorkerToken(mk({ WORKER_SHARED_SECRET: "b", COMPOSE_WORKER_TOKEN: "c" })), "b");
  assertEquals(resolveCoverWorkerToken(mk({ COMPOSE_WORKER_TOKEN: "c" })), "c");
  assertEquals(resolveCoverWorkerToken(mk({ COVER_WORKER_TOKEN: "   ", WORKER_SHARED_SECRET: "  ", COMPOSE_WORKER_TOKEN: "c" })), "c");
  assertEquals(resolveCoverWorkerToken(mk({})), null);
  assertEquals(resolveCoverWorkerToken(mk({ COVER_WORKER_TOKEN: "", WORKER_SHARED_SECRET: "", COMPOSE_WORKER_TOKEN: "" })), null);
});

