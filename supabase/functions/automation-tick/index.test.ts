// 2026-07-30：automation-tick 自动化入队必须先生成平台文案，不再走 resolveDraft 通用草稿。
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("AUTOMATION_TICK_TEST", "1");

const mod = await import("./index.ts");

const PRESET_BASE = {
  tone: "探店",
  fixed_tags: ["中古", "boomeroff"],
  shop_poi_map: {
    "shop-1": {
      verified: true,
      location_name: "BOOMER·OFF 中信泰富店",
      platform_poi_id: "poi-123",
      merchant_name: "BOOMER·OFF 中信泰富店",
      merchant_poi_id: "dp-777",
    },
  },
  video_annotation: "含AI生成内容",
};

function account(platform: string, preset: any = PRESET_BASE) {
  return {
    id: `acc-${platform}`,
    platform,
    shop_id: "shop-1",
    cookie_status: "valid",
    worker_account_id: `w-${platform}`,
    meta: { publish_preset: preset },
  };
}

const ASSET = {
  id: "asset-1",
  output_url: "https://cdn/v.mp4",
  input_image_urls: ["https://cdn/1.jpg", "https://cdn/2.jpg"],
  meta: { title: "中古杂货翻筐", cover_url: "https://cdn/c.jpg" },
};
const TASK = { id: "task-1", name: "每日探店", shop_id: "shop-1", config: { content_strategy: "记录逛店" } };

function makeSupa(invokeImpl: (name: string, opts: any) => any) {
  const inserted: any[] = [];
  return {
    inserted,
    functions: { invoke: async (name: string, opts: any) => invokeImpl(name, opts) },
    from(table: string) {
      return {
        insert(rows: any) {
          inserted.push({ table, rows });
          return {
            select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }),
            then: undefined,
            error: null,
          } as any;
        },
      } as any;
    },
  } as any;
}

function okCandidate(platform: string) {
  const title = platform === "dianping" ? "中古杂货铺逛一圈超治愈" : "翻筐两小时的快乐";
  return { candidates: [{ title, body: "正文内容".repeat(20), hashtags: ["#中古", "上海探店"] }] };
}

Deno.test("参考图优先 input_image_urls，最多 9 张", () => {
  assertEquals(mod.collectReferenceImages(ASSET), ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  assertEquals(mod.collectReferenceImages({ meta: { one_shot_refs: ["a"] } }), ["a"]);
  assertEquals(mod.collectReferenceImages({ meta: { reference_manifest: [{ url: "b" }] } }), ["b"]);
  assertEquals(mod.collectReferenceImages({ meta: { cover_url: "c" } }), ["c"]);
  const many = { input_image_urls: Array.from({ length: 12 }, (_, i) => `u${i}`) };
  assertEquals(mod.collectReferenceImages(many).length, 9);
});

Deno.test("无参考图时不创建 job", async () => {
  const supa = makeSupa(() => ({ data: okCandidate("xhs") }));
  const r = await mod.buildPlatformCopies(supa, { scoped: [account("xhs")], asset: { id: "a", meta: {} }, task: TASK, shopId: "shop-1" });
  assertEquals(r.ok, false);
  assertEquals((r as any).error, "no_copy_reference_images");
  assertEquals(supa.inserted.length, 0);
});

Deno.test("五个平台分别写入独立 per_platform", async () => {
  const seen: string[] = [];
  const supa = makeSupa((_n, opts) => {
    seen.push(opts.body.platform);
    assertEquals(opts.body.mode, "automation");
    assertEquals(opts.body.shop_id, "shop-1");
    assert(opts.body.image_urls.length > 0);
    assert(String(opts.body.content_context).includes("每日探店"));
    return { data: okCandidate(opts.body.platform) };
  });
  const scoped = ["xhs", "douyin", "wechat_video", "kuaishou", "dianping"].map((p) => account(p));
  const r = await mod.buildPlatformCopies(supa, { scoped, asset: ASSET, task: TASK, shopId: "shop-1" });
  assert(r.ok, JSON.stringify(r));
  const copies = (r as any).platformCopies;
  assertEquals(Object.keys(copies).sort(), ["dianping", "douyin", "kuaishou", "wechat_video", "xhs"]);
  assertEquals(seen.length, 5);
  for (const k of Object.keys(copies)) {
    assert(copies[k].title && copies[k].body);
    assert(copies[k].tags.length > 0);
    assert(copies[k].tags.every((t: string) => !t.startsWith("#")));
    assert(!copies[k].title.includes("[自动]"));
  }
  assertEquals(copies.xhs.location_verified, true);
  assertEquals(copies.xhs.platform_poi_id, "poi-123");
  assertEquals(copies.douyin.location_name, "BOOMER·OFF 中信泰富店");
  assertEquals(copies.wechat_video.video_annotation, "含AI生成内容");
  assertEquals(copies.wechat_video.location_name, "BOOMER·OFF 中信泰富店");
  assertEquals(copies.wechat_video.location_verified, true);
  assertEquals(copies.wechat_video.category, undefined);
  assertEquals(copies.wechat_video.original_declaration, true);
  assertEquals([...copies.wechat_video.short_title].length >= 6, true);
  assertEquals(copies.kuaishou.original_declaration, true);
  assertEquals(copies.dianping.merchant_verified, true);
  assertEquals(copies.dianping.merchant_poi_id, "dp-777");
});

Deno.test("空预设 / 空 fixed_tags 被拦截", async () => {
  const supa = makeSupa(() => ({ data: okCandidate("xhs") }));
  const noPreset = { ...account("xhs"), meta: {} };
  let r = await mod.buildPlatformCopies(supa, { scoped: [noPreset], asset: ASSET, task: TASK, shopId: "shop-1" });
  assertEquals((r as any).error, "xhs_publish_preset_missing");

  r = await mod.buildPlatformCopies(supa, {
    scoped: [account("xhs", { ...PRESET_BASE, fixed_tags: [] })],
    asset: ASSET, task: TASK, shopId: "shop-1",
  });
  assertEquals((r as any).error, "xhs_fixed_tags_missing");
});

Deno.test("小红书未确认 POI 被拦截", async () => {
  const supa = makeSupa(() => ({ data: okCandidate("xhs") }));
  const r = await mod.buildPlatformCopies(supa, {
    scoped: [account("xhs", { ...PRESET_BASE, shop_poi_map: { "shop-1": { verified: false, location_name: "x" } } })],
    asset: ASSET, task: TASK, shopId: "shop-1",
  });
  assertEquals((r as any).error, "xhs_poi_not_verified");
});

Deno.test("视频号无 category 但真实字段齐全可通过；点评缺商户被拦截", async () => {
  const supa = makeSupa((_n, o) => ({ data: okCandidate(o.body.platform) }));
  const p1: any = { ...PRESET_BASE };
  delete p1.category;
  let r = await mod.buildPlatformCopies(supa, { scoped: [account("wechat_video", p1)], asset: ASSET, task: TASK, shopId: "shop-1" });
  assert(r.ok, JSON.stringify(r));
  assertEquals((r as any).platformCopies.wechat_video.video_annotation, "含AI生成内容");

  r = await mod.buildPlatformCopies(supa, {
    scoped: [account("dianping", { ...PRESET_BASE, shop_poi_map: { "shop-1": { verified: true, location_name: "x" } } })],
    asset: ASSET, task: TASK, shopId: "shop-1",
  });
  assertEquals((r as any).error, "dianping_merchant_not_verified");
});

Deno.test("候选不合格 / 调用失败都不创建 job", async () => {
  let supa = makeSupa(() => ({ data: { candidates: [{ title: "这个标题非常非常非常非常非常非常长超过限制了", body: "x", hashtags: ["a"] }] } }));
  let r = await mod.buildPlatformCopies(supa, { scoped: [account("xhs")], asset: ASSET, task: TASK, shopId: "shop-1" });
  assertEquals((r as any).error, "xhs_copy_invalid");

  supa = makeSupa(() => ({ data: { candidates: [{ title: "标题", body: "正文", hashtags: [] }] } }));
  r = await mod.buildPlatformCopies(supa, { scoped: [account("xhs")], asset: ASSET, task: TASK, shopId: "shop-1" });
  assertEquals((r as any).error, "xhs_copy_invalid");

  supa = makeSupa(() => ({ error: { message: "boom" } }));
  r = await mod.buildPlatformCopies(supa, { scoped: [account("xhs")], asset: ASSET, task: TASK, shopId: "shop-1" });
  assert(String((r as any).error).startsWith("xhs_copy_failed"));
  assertEquals(supa.inserted.length, 0);
});

Deno.test("runTask 不再调用 resolveDraft 草稿路径", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const runTaskSrc = src.slice(src.indexOf("export async function runTask"));
  assert(!runTaskSrc.includes("resolveDraft("), "runTask 仍在调用 resolveDraft");
  assert(runTaskSrc.includes("per_platform: platformCopies"));
});

Deno.test("视频号缺 video_annotation / 缺 POI 在建 job 前被阻断", async () => {
  const supa = makeSupa((_n, o) => ({ data: okCandidate(o.body.platform) }));
  const noAnno: any = { ...PRESET_BASE };
  delete noAnno.video_annotation;
  let r = await mod.buildPlatformCopies(supa, { scoped: [account("wechat_video", noAnno)], asset: ASSET, task: TASK, shopId: "shop-1" });
  assertEquals((r as any).error, "wechat_video_annotation_preset_missing");
  assertEquals(supa.inserted.length, 0);

  r = await mod.buildPlatformCopies(supa, {
    scoped: [account("wechat_video", { ...PRESET_BASE, shop_poi_map: {} })],
    asset: ASSET, task: TASK, shopId: "shop-1",
  });
  assertEquals((r as any).error, "wechat_video_location_preset_missing");
  assertEquals(supa.inserted.length, 0);
});

Deno.test("真实门店 POI + 含AI生成内容 全字段落入 per_platform", async () => {
  const supa = makeSupa((_n, o) => ({ data: okCandidate(o.body.platform) }));
  const preset = {
    tone: "探店",
    fixed_tags: ["中古"],
    video_annotation: "含AI生成内容",
    shop_poi_map: { "shop-1": { verified: true, location_name: "BOOMER·OFF vintage(中信泰富店)", platform_poi_id: "poi-xin" } },
  };
  const r = await mod.buildPlatformCopies(supa, { scoped: [account("wechat_video", preset)], asset: ASSET, task: TASK, shopId: "shop-1" });
  assert(r.ok, JSON.stringify(r));
  const c = (r as any).platformCopies.wechat_video;
  assertEquals(c.location_name, "BOOMER·OFF vintage(中信泰富店)");
  assertEquals(c.location_verified, true);
  assertEquals(c.video_annotation, "含AI生成内容");
  assertEquals([...c.short_title].length >= 6, true);
});

// ---------------- dry-run 预检 ----------------

function makeDryRunSupa(opts: { asset?: any; assets?: any[]; accounts?: any[] }) {
  const writes: any[] = [];
  const queries: any[] = [];
  const accounts = opts.accounts ?? [account("xhs"), account("wechat_video")];
  const supa: any = {
    writes,
    queries,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "x@y.z", app_metadata: {} } } }) } },
    functions: { invoke: async (_n: string, o: any) => ({ data: okCandidate(o.body.platform) }) },
    from(table: string) {
      const q: any = {
        _table: table,
        _eq: {} as Record<string, any>,
        select() { return q; },
        eq(col: string, val: any) { q._eq[col] = val; return q; },
        in() { return q; },
        not() { return q; },
        overlaps() { return q; },
        order() { return q; },
        limit() { return q; },
        insert(rows: any) { writes.push({ op: "insert", table, rows }); return { select: () => ({ single: async () => ({ data: { id: "job-x" }, error: null }) }) }; },
        update(rows: any) { writes.push({ op: "update", table, rows }); return { eq: async () => ({ error: null }) }; },
        delete() { writes.push({ op: "delete", table }); return { eq: async () => ({ error: null }) }; },
        async maybeSingle() {
          queries.push({ table, eq: { ...q._eq } });
          if (table === "marketing_assets") {
            const found = (opts.assets ?? (opts.asset ? [opts.asset] : [])).find((a: any) => a.id === q._eq.id) || null;
            return { data: found, error: null };
          }
          if (table === "erp_user_links") return { data: null, error: null };
          return { data: null, error: null };
        },
        then(res: any) {
          queries.push({ table, eq: { ...q._eq } });
          if (table === "social_accounts") return Promise.resolve({ data: accounts, error: null }).then(res);
          if (table === "marketing_assets") return Promise.resolve({ data: opts.assets ?? [], error: null }).then(res);
          if (table === "social_publish_jobs") return Promise.resolve({ data: [], error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return q;
    },
  };
  return supa;
}

const NEW_ASSET = {
  id: "asset-1080",
  kind: "video",
  status: "ready",
  output_url: "https://cdn/new-1080.mp4",
  input_image_urls: ["https://cdn/n1.jpg"],
  shop_id: "shop-1",
  meta: { resolution: "1080p", title: "新片", cover_url: "https://cdn/nc.jpg" },
};
const OLD_ASSET = {
  id: "asset-720",
  kind: "video",
  status: "ready",
  output_url: "https://cdn/old-720.mp4",
  input_image_urls: ["https://cdn/o1.jpg"],
  shop_id: "shop-1",
  meta: { resolution: "720p", title: "旧片" },
};

Deno.test("dry-run 不产生任何 INSERT/UPDATE，且使用指定 asset_id 不退回旧 720p", async () => {
  const supa = makeDryRunSupa({ assets: [OLD_ASSET, NEW_ASSET] });
  const r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["xhs", "wechat_video"] }, assetId: "asset-1080" });
  assert(r.ok, JSON.stringify(r));
  assertEquals(supa.writes.length, 0);
  assertEquals(r.dry_run, true);
  assertEquals(r.would_enqueue, true);
  assertEquals(r.asset_id, "asset-1080");
  assertEquals(r.asset.resolution, "1080p");
  assertEquals(r.asset.status, "ready");
  assertEquals(r.task_id, "task-1");
});

Deno.test("dry-run 返回值不含 cookie / token / 密钥", async () => {
  const acc = [
    { ...account("xhs"), cookie: "SECRETCOOKIE", cookie_json: "{}", worker_account_key: "k1" },
    { ...account("wechat_video"), cookie: "SECRETCOOKIE2" },
  ];
  const supa = makeDryRunSupa({ assets: [NEW_ASSET], accounts: acc });
  const r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["xhs", "wechat_video"] }, assetId: "asset-1080" });
  assert(r.ok);
  const dumped = JSON.stringify(r);
  assert(!dumped.includes("SECRETCOOKIE"), "泄漏 cookie");
  assert(!/"cookie"|"cookie_json"|"token"|worker_account_key/.test(dumped), "泄漏敏感字段");
  for (const a of r.accounts) {
    assertEquals(Object.keys(a).sort(), ["cookie_status", "display_name", "has_worker_account", "id", "platform", "shop_id"]);
  }
});

Deno.test("dry-run 的 xhs / wechat_video 字段完整", async () => {
  const supa = makeDryRunSupa({ assets: [NEW_ASSET] });
  const r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["xhs", "wechat_video"] }, assetId: "asset-1080" });
  assert(r.ok, JSON.stringify(r));
  const pp = r.per_platform;
  assertEquals(r.platform_copies, pp);

  const x = pp.xhs;
  assert(x.title && x.body);
  assert(x.tags.length > 0);
  assertEquals(x.original_declaration, true);
  assertEquals(x.location_name, "BOOMER·OFF 中信泰富店");
  assertEquals(x.location_verified, true);
  assertEquals(x.platform_poi_id, "poi-123");

  const w = pp.wechat_video;
  assert(w.body && w.tags.length > 0);
  const stLen = [...w.short_title].length;
  assert(stLen >= 6 && stLen <= 16, `short_title 长度 ${stLen}`);
  assertEquals(w.video_annotation, "含AI生成内容");
  assertEquals(w.location_name, "BOOMER·OFF 中信泰富店");
  assertEquals(w.location_verified, true);
  assertEquals(supa.writes.length, 0);
});

Deno.test("dry-run 素材不存在 / 未成片时不写库", async () => {
  let supa = makeDryRunSupa({ assets: [NEW_ASSET] });
  let r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["xhs"] }, assetId: "nope" });
  assertEquals(r.ok, false);
  assertEquals(r.error, "asset_not_found");
  assertEquals(r.would_enqueue, false);
  assertEquals(supa.writes.length, 0);

  supa = makeDryRunSupa({ assets: [{ ...NEW_ASSET, output_url: null }] });
  r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["xhs"] }, assetId: "asset-1080" });
  assertEquals(r.error, "asset_not_rendered");
  assertEquals(supa.writes.length, 0);
});

Deno.test("dry-run 缺 POI/annotation 时 would_enqueue=false 且不写库", async () => {
  const noAnno: any = { ...PRESET_BASE };
  delete noAnno.video_annotation;
  const supa = makeDryRunSupa({ assets: [NEW_ASSET], accounts: [account("wechat_video", noAnno)] });
  const r = await mod.dryRunTask(supa, { task: { ...TASK, platforms: ["wechat_video"] }, assetId: "asset-1080" });
  assertEquals(r.ok, false);
  assertEquals(r.error, "wechat_video_annotation_preset_missing");
  assertEquals(r.would_enqueue, false);
  assertEquals(supa.writes.length, 0);
});

Deno.test("handleRequest 的 dry-run 分支在写操作之前返回", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const h = src.slice(src.indexOf("export async function handleRequest"));
  const dryIdx = h.indexOf("if (dryRun)");
  const runIdx = h.indexOf("runTask(supa, task");
  assert(dryIdx > 0 && runIdx > dryIdx, "dry-run 必须在 runTask 之前返回");
  const branch = h.slice(dryIdx, h.indexOf("let tasks: any[]"));
  assert(!/\.insert\(|\.update\(|\.delete\(/.test(branch), "dry-run 分支不得写库");
});
