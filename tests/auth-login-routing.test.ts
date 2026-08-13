import { describe, expect, it } from 'vitest';

import { normalizeLoginIdentity } from '../src/lib/loginIdentity';
import { resolveSupabaseUrl } from '../src/lib/supabaseUrl';

describe('登录账号路由', () => {
  it('手机号按项目 Auth 现有的 11 位格式登录', () => {
    expect(normalizeLoginIdentity('18657433310')).toEqual({ phone: '18657433310' });
  });

  it('保留邮箱登录并统一小写', () => {
    expect(normalizeLoginIdentity('User@Example.COM')).toEqual({ email: 'user@example.com' });
  });

  it('普通用户名继续使用历史本地域名', () => {
    expect(normalizeLoginIdentity('Boomer_User')).toEqual({ email: 'boomer_user@boomeroff.local' });
  });
});

describe('Supabase 网络路由', () => {
  const configured = 'https://narqwgwpqglathwtyevz.supabase.co/';

  it('生产站通过腾讯云同源代理访问 Supabase', () => {
    expect(resolveSupabaseUrl(configured, 'ai.boomeroff.com', 'https://ai.boomeroff.com'))
      .toBe('https://ai.boomeroff.com/supabase');
  });

  it('Lovable 预览和本地开发仍使用项目原地址', () => {
    expect(resolveSupabaseUrl(configured, 'id-preview--project.lovable.app', 'https://id-preview--project.lovable.app'))
      .toBe('https://narqwgwpqglathwtyevz.supabase.co');
    expect(resolveSupabaseUrl(configured, 'localhost', 'http://localhost:5173'))
      .toBe('https://narqwgwpqglathwtyevz.supabase.co');
  });
});
