// 把火山 TOS 的一次性签名 URL 转存到 Supabase Storage,拿到长期签名 URL。
// 只处理 volces / volccdn 域名;其它域名(已经是 Supabase Storage)原样返回。

const TEN_YEARS_SEC = 60 * 60 * 24 * 365 * 10;

export function isVolcesTosUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return /\.volces\.com$/i.test(h) || /\.volccdn\.com$/i.test(h);
  } catch {
    return false;
  }
}

export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h.endsWith(".supabase.co") || h.endsWith(".supabase.in");
  } catch {
    return false;
  }
}

/**
 * 把 TOS 视频转存到 marketing-videos bucket,返回新的长期签名 URL。
 * @param admin service-role Supabase client
 * @param userId 归属用户
 * @param assetId 素材 id (用于文件名)
 * @param remoteUrl 火山 TOS 一次性签名 URL
 */
export async function mirrorTosVideoToStorage(
  admin: any,
  userId: string,
  assetId: string,
  remoteUrl: string,
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  try {
    const upstream = await fetch(remoteUrl);
    if (!upstream.ok) {
      return { ok: false, error: `源视频拉取失败 (${upstream.status})` };
    }
    const buf = new Uint8Array(await upstream.arrayBuffer());
    if (buf.byteLength < 1024) {
      return { ok: false, error: `源视频异常 (${buf.byteLength} B)` };
    }
    const path = `${userId}/${assetId}.mp4`;
    const { error: upErr } = await admin.storage
      .from("marketing-videos")
      .upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) return { ok: false, error: `上传失败: ${upErr.message}` };
    const { data: signed, error: sErr } = await admin.storage
      .from("marketing-videos")
      .createSignedUrl(path, TEN_YEARS_SEC);
    if (sErr || !signed?.signedUrl) return { ok: false, error: `签名失败: ${sErr?.message || "unknown"}` };
    return { ok: true, url: signed.signedUrl, path };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "转存失败" };
  }
}
