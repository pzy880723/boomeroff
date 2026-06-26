// 把"上传到 worker + 调 postVideoBatch 分发到平台 + 更新 targets 状态"抽出来共用
// social-publish-create / social-publish-dispatch (cron) / social-publish-retry 三个函数共享。
import { sauFetch, PLATFORM_CODE, PLATFORM_LABEL } from "./sau.ts";

export interface DispatchOptions {
  jobId: string;
  workerFilePath: string;
  title: string;
  tags: string[];
  category?: string;
  // 仅在 worker 内部分布式定时模式下用，节点定时（schedule_at）不传
  enableTimer?: boolean;
  videosPerDay?: number;
  dailyTimes?: number[];
  startDays?: number;
}

export interface DispatchAccount {
  id: string;
  platform: string;
  worker_account_id: number | null;
}

/**
 * 把 jobId 下所选的 targets / accounts 真正发到 worker
 * @returns errors[]
 */
export async function dispatchToWorker(
  supa: any,
  opts: DispatchOptions,
  accounts: DispatchAccount[],
): Promise<string[]> {
  const { jobId, workerFilePath, title, tags, category } = opts;
  const errors: string[] = [];
  const byPlatform = new Map<string, DispatchAccount[]>();
  for (const a of accounts) {
    const arr = byPlatform.get(a.platform) || [];
    arr.push(a);
    byPlatform.set(a.platform, arr);
  }
  for (const [platform, accs] of byPlatform.entries()) {
    const accIds = accs.map((a) => a.id);
    const ptype = PLATFORM_CODE[platform];
    if (!ptype) {
      const msg = "平台暂不支持";
      errors.push(`${PLATFORM_LABEL[platform] || platform}: ${msg}`);
      await supa.from("social_publish_targets").update({
        status: "failed", error_message: msg, finished_at: new Date().toISOString(),
      }).eq("job_id", jobId).in("account_id", accIds);
      continue;
    }
    const accountList = accs.map((a) => a.worker_account_id).filter(Boolean);
    if (accountList.length === 0) {
      const msg = "账号未在 worker 注册,请重新扫码";
      errors.push(`${PLATFORM_LABEL[platform]}: ${msg}`);
      await supa.from("social_publish_targets").update({
        status: "failed", error_message: msg, finished_at: new Date().toISOString(),
      }).eq("job_id", jobId).in("account_id", accIds);
      continue;
    }
    // 标记 running
    await supa.from("social_publish_targets").update({
      status: "running", started_at: new Date().toISOString(),
    }).eq("job_id", jobId).in("account_id", accIds);

    const payload: any = {
      fileList: [workerFilePath],
      accountList,
      type: ptype,
      title: title.slice(0, 50),
      tags,
      category: category || undefined,
      enableTimer: !!opts.enableTimer,
      videosPerDay: opts.videosPerDay || 1,
      dailyTimes: opts.dailyTimes || [9, 14, 20],
      startDays: opts.startDays || 0,
    };
    try {
      const r = await sauFetch("/postVideoBatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      if (!r.ok) {
        errors.push(`${PLATFORM_LABEL[platform]}: worker ${r.status} ${text.slice(0, 120)}`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: `worker ${r.status}: ${text.slice(0, 200)}`,
          finished_at: new Date().toISOString(),
        }).eq("job_id", jobId).in("account_id", accIds);
      } else {
        await supa.from("social_publish_targets").update({
          status: "success", progress: 100, finished_at: new Date().toISOString(),
        }).eq("job_id", jobId).in("account_id", accIds);
      }
    } catch (e) {
      const msg = String(e);
      errors.push(`${PLATFORM_LABEL[platform]}: ${msg}`);
      await supa.from("social_publish_targets").update({
        status: "failed", error_message: msg, finished_at: new Date().toISOString(),
      }).eq("job_id", jobId).in("account_id", accIds);
    }
  }
  return errors;
}

/** 根据所有 targets 状态决定父任务终态 */
export async function finalizeJobStatus(supa: any, jobId: string) {
  const { data } = await supa.from("social_publish_targets").select("status").eq("job_id", jobId);
  const arr = data || [];
  if (arr.length === 0) return;
  const pending = arr.some((t: any) => ["queued", "running", "scheduled"].includes(t.status));
  if (pending) return; // 还在跑,不结终
  const ok = arr.filter((t: any) => t.status === "success").length;
  const fail = arr.filter((t: any) => t.status === "failed").length;
  const next = ok === arr.length ? "done" : ok > 0 ? "partial" : fail > 0 ? "failed" : "done";
  await supa.from("social_publish_jobs").update({
    status: next, updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}
