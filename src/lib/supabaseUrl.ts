export function resolveSupabaseUrl(
  configuredUrl: string,
  hostname = window.location.hostname,
  origin = window.location.origin,
): string {
  if (hostname === 'ai.boomeroff.com' || hostname === 'www.ai.boomeroff.com') {
    return `${origin.replace(/\/$/, '')}/supabase`;
  }
  return configuredUrl.replace(/\/$/, '');
}
