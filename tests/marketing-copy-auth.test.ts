import { describe, it, expect } from 'vitest';

// 线上鉴权契约回归：generate-marketing-copy 网关放行（verify_jwt=false），
// 由函数体自行严格校验两条分支。
const BASE = `${process.env.VITE_SUPABASE_URL ?? 'https://narqwgwpqglathwtyevz.supabase.co'}/functions/v1/generate-marketing-copy`;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const post = (headers: Record<string, string>, body: unknown) =>
  fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('generate-marketing-copy auth contract', () => {
  it('无 Authorization → 函数体 401（不是网关 JWT 错误）', async () => {
    const res = await post({}, { platform: 'xhs', image_urls: ['https://x/y.jpg'] });
    expect(res.status).toBe(401);
    const j = await res.json();
    expect(j.error).toBe('未授权');
  });

  it('普通（非 service-role）token + mode=automation → 401', async () => {
    if (!ANON) return;
    const res = await post({ Authorization: `Bearer ${ANON}` }, {
      mode: 'automation',
      platform: 'xhs',
      image_urls: ['https://x/y.jpg'],
    });
    expect(res.status).toBe(401);
    const j = await res.json();
    expect(j.error).toBe('未授权');
  });
});
