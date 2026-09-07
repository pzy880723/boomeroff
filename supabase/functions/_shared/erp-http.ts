// ERP HTTP 调用的严格读取：超时必须覆盖「握手 + 完整 body 读取」，
// 200 空 body / HTML / 非法 JSON / 非对象 一律视为 bad_response（绝不当成成功）。

export type ErpFetchResult =
  | { kind: "ok"; status: number; body: Record<string, unknown> }
  | { kind: "bad_response"; status: number }
  | { kind: "http"; status: number }
  | { kind: "origin_mismatch" }
  | { kind: "timeout" }
  | { kind: "unreachable"; error: string };

export interface ErpFetchOptions {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  expectedOrigin: string;
  fetchFn?: typeof fetch;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export async function erpFetchJson(opts: ErpFetchOptions): Promise<ErpFetchResult> {
  const {
    url,
    init,
    timeoutMs,
    expectedOrigin,
    fetchFn = fetch,
    setTimeoutFn = (cb, ms) => setTimeout(cb, ms),
    clearTimeoutFn = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  } = opts;

  const controller = new AbortController();
  const timer = setTimeoutFn(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchFn(url, { ...init, signal: controller.signal });

    if (new URL(resp.url || url).origin !== expectedOrigin) {
      await resp.body?.cancel().catch(() => {});
      return { kind: "origin_mismatch" };
    }

    // 关键：body 读取仍在同一个 timer 覆盖之下，慢 body 会抛 AbortError
    const raw = await resp.text();

    if (!resp.ok) return { kind: "http", status: resp.status };

    if (raw.trim() === "") return { kind: "bad_response", status: resp.status };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: "bad_response", status: resp.status };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "bad_response", status: resp.status };
    }
    return { kind: "ok", status: resp.status, body: parsed as Record<string, unknown> };
  } catch (e) {
    const err = e as Error;
    if (err?.name === "AbortError" || err?.name === "TimeoutError") return { kind: "timeout" };
    return { kind: "unreachable", error: err?.name || "error" };
  } finally {
    clearTimeoutFn(timer);
  }
}

/** ACK 结果判定：只有对象且 ok === true 才算成功。 */
export function decideAckOutcome(r: ErpFetchResult): { ok: boolean; code: string } {
  switch (r.kind) {
    case "ok": {
      if (r.body.ok === true) return { ok: true, code: "acked" };
      const c = r.body.code;
      return { ok: false, code: typeof c === "string" ? c : "ack_rejected" };
    }
    case "bad_response":
      return { ok: false, code: "ack_bad_response" };
    case "http":
      return { ok: false, code: `ack_http_${r.status}` };
    case "origin_mismatch":
      return { ok: false, code: "ack_origin_mismatch" };
    case "timeout":
      return { ok: false, code: "ack_timeout" };
    default:
      return { ok: false, code: "ack_unreachable" };
  }
}

/** 拉取结果判定：返回 data 或失败码。 */
export function decidePullOutcome(
  r: ErpFetchResult,
): { ok: true; data: unknown } | { ok: false; code: string } {
  switch (r.kind) {
    case "ok": {
      if (r.body.ok !== true) {
        const c = r.body.code;
        return { ok: false, code: typeof c === "string" ? c : "erp_bad_response" };
      }
      return { ok: true, data: r.body.data };
    }
    case "bad_response":
      return { ok: false, code: "erp_bad_response" };
    case "http":
      return { ok: false, code: `erp_http_${r.status}` };
    case "origin_mismatch":
      return { ok: false, code: "erp_origin_mismatch" };
    case "timeout":
      return { ok: false, code: "erp_timeout" };
    default:
      return { ok: false, code: "erp_unreachable" };
  }
}
