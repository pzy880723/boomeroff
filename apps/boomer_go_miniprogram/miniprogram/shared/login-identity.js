function loginIdentity(account) {
  if (typeof account !== 'string') throw new Error('请输入有效的手机号、用户名或邮箱');
  const value = account.trim().toLowerCase();
  if (value.length > 255 || !/^([a-z0-9_]{3,32}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(value)) throw new Error('请输入有效的手机号、用户名或邮箱');
  if (/^1[3-9]\d{9}$/.test(value)) return { phone: value };
  return { email: value.includes('@') ? value : value + '@boomeroff.local' };
}
module.exports = { loginIdentity };
