export interface AuthUserLike {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

type ListAuthUsersPage = (
  page: number,
  perPage: number,
) => Promise<readonly AuthUserLike[]>;

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 20;

export function normalizeChinaPhone(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";

  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("86")) digits = digits.slice(2);
  return /^1[3-9]\d{9}$/.test(digits) ? digits : "";
}

export async function findAuthUserByPhone(
  listPage: ListAuthUsersPage,
  phone: string,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<AuthUserLike | null> {
  const target = normalizeChinaPhone(phone);
  if (!target) return null;

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  for (let page = 1; page <= maxPages; page += 1) {
    const users = await listPage(page, pageSize);
    const match = users.find((user) => authUserMatchesPhone(user, target));
    if (match) return match;
    if (users.length < pageSize) return null;
  }

  return null;
}

function authUserMatchesPhone(user: AuthUserLike, target: string): boolean {
  const metadataPhone = user.user_metadata?.phone;
  const emailUsername = user.email?.split("@", 1)[0] ?? "";

  return [user.phone, metadataPhone, emailUsername]
    .some((candidate) => normalizeChinaPhone(candidate) === target);
}
