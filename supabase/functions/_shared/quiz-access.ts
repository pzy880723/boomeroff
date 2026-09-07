/**
 * 知识测试题源授权：纯函数，便于回归测试。
 * - official / knowledge：任意已登录且未停用用户可读（RLS: SELECT true）
 * - favorite：仅本人可读（RLS: auth.uid() = user_id）
 */
export type QuizKind = "official" | "favorite" | "knowledge";

export class QuizAccessError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "QuizAccessError";
    this.status = status;
  }
}

export function isValidKind(kind: unknown): kind is QuizKind {
  return kind === "official" || kind === "favorite" || kind === "knowledge";
}

/**
 * 停用状态判定（fail-closed）。
 * user_roles 只有 (user_id, role) 唯一约束，同一用户可能有多行 → 任一行 suspended 即拒绝。
 * 查询报错 → 503（可重试），不得默认放行。
 * 无角色行 → 与 _shared/store-access.ts 相同的现有账号规则：视为未停用。
 */
export function assertNotSuspended(
  rows: Array<{ suspended?: boolean | null }> | null | undefined,
  error?: { message?: string } | null,
): void {
  if (error || rows == null) {
    throw new QuizAccessError("账号状态校验暂时不可用，请稍后重试", 503);
  }
  if (rows.some((r) => r?.suspended === true)) {
    throw new QuizAccessError("账号已停用", 403);
  }
}


/** 校验题源可读性。row 为用带 JWT 的客户端（受 RLS 约束）读取到的行。 */
export function assertQuizSourceReadable(
  kind: QuizKind,
  row: (Record<string, unknown> & { user_id?: string | null }) | null | undefined,
  userId: string,
): void {
  if (!row) {
    // RLS 下他人 favorite 读不到 → 一律 403，避免探测存在性
    throw new QuizAccessError(kind === "favorite" ? "无权访问该收藏" : "无权访问该题源", 403);
  }
  if (kind === "favorite" && row.user_id !== userId) {
    throw new QuizAccessError("无权访问该收藏", 403);
  }
}
