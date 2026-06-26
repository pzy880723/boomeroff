// Shared helper for talking to the social-auto-upload worker.
export const SAU_BASE = (Deno.env.get("SAU_WORKER_URL") || "").replace(/\/+$/, "");
export const SAU_TOKEN = Deno.env.get("SAU_WORKER_TOKEN") || "";

export const PLATFORM_CODE: Record<string, number> = {
  xhs: 1,
  wechat_video: 2,
  douyin: 3,
  kuaishou: 4,
};
export const CODE_PLATFORM: Record<number, string> = {
  1: "xhs",
  2: "wechat_video",
  3: "douyin",
  4: "kuaishou",
};
export const PLATFORM_LABEL: Record<string, string> = {
  xhs: "小红书",
  wechat_video: "视频号",
  douyin: "抖音",
  kuaishou: "快手",
};

export function sauHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { ...extra };
  if (SAU_TOKEN) h["X-Sau-Token"] = SAU_TOKEN;
  return h;
}

export async function sauFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!SAU_BASE) throw new Error("SAU_WORKER_URL is not configured");
  const url = `${SAU_BASE}${path}`;
  const headers = { ...sauHeaders(), ...((init.headers as Record<string, string>) || {}) };
  return await fetch(url, { ...init, headers });
}

export async function sauGetAccounts(): Promise<Array<[number, number, string, string, number]>> {
  const r = await sauFetch("/getAccounts");
  if (!r.ok) throw new Error(`sau /getAccounts ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}

export async function sauGetValidAccounts(): Promise<Array<[number, number, string, string, number]>> {
  const r = await sauFetch("/getValidAccounts");
  if (!r.ok) throw new Error(`sau /getValidAccounts ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}
