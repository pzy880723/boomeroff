// SAU (social-auto-upload) worker adapter v2.
// 把 worker 当成纯发布执行器,Lovable 这边只负责编排、鉴权和状态聚合。
//
// 已对接的 worker 端点(基于 dreammis/social-auto-upload + 我们部署的 aigc.boomeroff.top):
//   GET  /getValidAccounts          → [[id, type, name, avatar, status], ...]
//   GET  /getAccounts               → 同上,兼容老 worker
//   POST /upload (multipart file)   → { code, data: "<server file path>" }
//   POST /postVideoBatch            → { code, data?, msg? }
//   POST /postImageBatch            → (规划中,见 docs/social-auto-upload.md)
//   GET  /login_qrcode?type=N       → SSE,事件 data 为 { step, qr?, msg? }
//   POST /deleteAccount             → { code }
//   GET  /getTaskStatus?task_id=    → (规划中) { code, data: { status, progress, url, error } }
//
// 平台代号约定(和 SAU 上游一致):
//   1=xhs 2=wechat_video 3=douyin 4=kuaishou 5=tiktok 6=bilibili

export const SAU_BASE = (Deno.env.get("SAU_WORKER_URL") || "").replace(/\/+$/, "");
export const SAU_TOKEN = Deno.env.get("SAU_WORKER_TOKEN") || "";

export const PLATFORM_CODE: Record<string, number> = {
  xhs: 1,
  wechat_video: 2,
  douyin: 3,
  kuaishou: 4,
  tiktok: 5,
  bilibili: 6,
};

export const CODE_PLATFORM: Record<number, string> = {
  1: "xhs",
  2: "wechat_video",
  3: "douyin",
  4: "kuaishou",
  5: "tiktok",
  6: "bilibili",
};

export const PLATFORM_LABEL: Record<string, string> = {
  xhs: "小红书",
  wechat_video: "视频号",
  douyin: "抖音",
  kuaishou: "快手",
  tiktok: "TikTok",
  bilibili: "B站",
};

export function sauHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { ...extra };
  if (SAU_TOKEN) h["X-Sau-Token"] = SAU_TOKEN;
  return h;
}

export async function sauFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!SAU_BASE) throw new Error("SAU_WORKER_URL 未配置");
  const url = `${SAU_BASE}${path}`;
  const headers = { ...sauHeaders(), ...((init.headers as Record<string, string>) || {}) };
  return await fetch(url, { ...init, headers });
}

// ========== 账号 ==========

export interface SauAccount {
  worker_id: number;
  platform_code: number;
  platform: string;
  name: string;
  avatar: string;
  status: number; // 1=有效 0=失效
}

export async function sauListAccounts(): Promise<SauAccount[]> {
  // 优先 /getValidAccounts;不行就退回 /getAccounts
  let r: Response;
  try {
    r = await sauFetch("/getValidAccounts");
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    r = await sauFetch("/getAccounts");
  }
  if (!r.ok) throw new Error(`sau accounts ${r.status}`);
  const j = await r.json().catch(() => ({}));
  const arr = Array.isArray(j?.data) ? j.data : [];
  return arr.map((row: any[]) => ({
    worker_id: Number(row[0]),
    platform_code: Number(row[1]),
    platform: CODE_PLATFORM[Number(row[1])] || "unknown",
    name: String(row[2] || ""),
    avatar: String(row[3] || ""),
    status: Number(row[4] ?? 1),
  }));
}

export async function sauDeleteAccount(workerId: number): Promise<void> {
  try {
    await sauFetch(`/deleteAccount?id=${workerId}`, { method: "POST" });
  } catch {
    // worker 删失败不阻塞 DB 软删
  }
}

// ========== 上传 ==========

export interface SauUploadResult { path: string; size: number; }

export async function sauUpload(blob: Blob, filename: string): Promise<SauUploadResult> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const r = await sauFetch("/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`/upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json().catch(() => ({}));
  const path = j?.data || j?.path || j?.file;
  if (!path) throw new Error("/upload 返回缺少文件路径");
  return { path: String(path), size: blob.size };
}

// ========== 发布 ==========

export interface PostVideoArgs {
  filePath: string;
  accountIds: number[];
  platformCode: number;
  title: string;
  tags: string[];
  category?: string;
}

export async function sauPostVideoBatch(args: PostVideoArgs): Promise<{ ok: boolean; raw: any; error?: string }> {
  const payload = {
    fileList: [args.filePath],
    accountList: args.accountIds,
    type: args.platformCode,
    title: (args.title || "").slice(0, 100),
    tags: args.tags || [],
    category: args.category || undefined,
    enableTimer: false,
    videosPerDay: 1,
    dailyTimes: [9, 14, 20],
    startDays: 0,
  };
  try {
    const r = await sauFetch("/postVideoBatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let raw: any = {};
    try { raw = JSON.parse(text); } catch { raw = { _raw: text }; }
    if (!r.ok) return { ok: false, raw, error: `worker ${r.status}: ${text.slice(0, 200)}` };
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, raw: null, error: String(e) };
  }
}

export interface PostImageArgs extends Omit<PostVideoArgs, "filePath"> {
  filePaths: string[]; // 1..N 张图
  body: string;
}

// worker 当前未实现 /postImageBatch — 留空实现,真上线时按 docs/social-auto-upload.md 填字段
export async function sauPostImageBatch(_args: PostImageArgs): Promise<{ ok: boolean; raw: any; error?: string }> {
  return { ok: false, raw: null, error: "worker 暂未支持图文发布,请联系管理员升级 worker" };
}
