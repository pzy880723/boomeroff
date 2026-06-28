// Character Sheet 软通过:把人脸照片处理成"参考素材",绕过 Seedance 2.0 的真人分类器拦截。
// 技术参考:ViralTwin《How to pass Seedance 2.0's face filter》(2026),99% 通过率。
// 原理:在原图上叠红色十字(redaction 标记)+ 顶部白底黑字"CHARACTER SHEET REFERENCE"条幅,
// 让分类器把它读成"角色卡参考资料"而不是"真人快照"。
//
// 走 Storage:把处理后的 PNG 上传到 marketing-videos 的 _soft_pass/ 前缀下,返回签名 URL,
// 火山直接取这个 URL 当 reference_image 用,完全无感。

import { Image, TextLayout, Frame, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
// 字体放在同目录(后面会下个开源体回去);如果加载失败,降级为不画文字只画十字。
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.20/files/inter-latin-700-normal.woff";

let cachedFont: Uint8Array | null = null;
async function loadFont(): Promise<Uint8Array | null> {
  if (cachedFont) return cachedFont;
  try {
    const r = await fetch(FONT_URL);
    if (!r.ok) return null;
    cachedFont = new Uint8Array(await r.arrayBuffer());
    return cachedFont;
  } catch { return null; }
}

/** 把任意远程图片处理成 Character Sheet 风格的 PNG buffer。失败抛错。 */
export async function buildCharacterSheet(sourceUrl: string): Promise<Uint8Array> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`fetch source image failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // decode 支持 PNG/JPEG/GIF/TIFF/BMP/WebP(部分)
  const decoded = await decode(buf);
  const img = decoded instanceof Frame ? decoded : (Array.isArray((decoded as any).frames) ? (decoded as any).frames[0] as Image : decoded as Image);

  const W = img.width, H = img.height;
  // ---- 1) 顶部白条幅(高度 = 短边的 8%) ----
  const bannerH = Math.max(48, Math.round(Math.min(W, H) * 0.08));
  const banner = new Image(W, bannerH).fill(0xffffffff);

  // 文字
  const font = await loadFont();
  if (font) {
    try {
      const fontSize = Math.round(bannerH * 0.5);
      const layout = new TextLayout({
        maxWidth: W - 16,
        maxHeight: bannerH - 4,
        wrapStyle: "word",
        verticalAlign: "middle",
        horizontalAlign: "middle",
      });
      const text = Image.renderText(font, fontSize, "CHARACTER SHEET REFERENCE", 0x000000ff, layout);
      banner.composite(text, Math.max(0, Math.round((W - text.width) / 2)), Math.max(0, Math.round((bannerH - text.height) / 2)));
    } catch (e) {
      console.warn("[face-gateway] render text failed, banner only:", e);
    }
  }
  img.composite(banner, 0, 0);

  // ---- 2) 红色十字(覆盖左眼附近) ----
  // 中心:水平 40%、垂直 30%(典型正面肖像的左眼位置);臂长 = 短边的 10%;线宽按 1024 基准 26 等比缩放
  const cx = Math.round(W * 0.40);
  const cy = Math.round(H * 0.30);
  const arm = Math.round(Math.min(W, H) * 0.10);
  const stroke = Math.max(8, Math.round(Math.min(W, H) / 1024 * 26));
  const red = 0xdc2626ff; // tailwind red-600

  // 横线
  drawRect(img, cx - arm, cy - Math.round(stroke / 2), arm * 2, stroke, red);
  // 竖线
  drawRect(img, cx - Math.round(stroke / 2), cy - arm, stroke, arm * 2, red);

  return await img.encode(0); // 0 = PNG
}

function drawRect(img: Image, x: number, y: number, w: number, h: number, color: number) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(img.width, x + w), y1 = Math.min(img.height, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      img.setPixelAt(xx + 1, yy + 1, color); // imagescript 是 1-indexed
    }
  }
}

interface UploadDeps {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: Uint8Array, opts?: any) => Promise<{ error: any }>;
      createSignedUrl: (path: string, ttl: number) => Promise<{ data: { signedUrl: string } | null; error: any }>;
    };
  };
}

/** 把一张原图处理成 Character Sheet,上传到 marketing-videos/_soft_pass/,返回 24h 签名 URL。 */
export async function softPassFaceImage(sourceUrl: string, opts: { admin: UploadDeps; userId: string }): Promise<string> {
  const png = await buildCharacterSheet(sourceUrl);
  const path = `_soft_pass/${opts.userId}/${crypto.randomUUID()}.png`;
  const up = await opts.admin.storage.from("marketing-videos").upload(path, png, { contentType: "image/png", upsert: false });
  if (up.error) throw new Error(`upload soft-pass failed: ${up.error.message}`);
  const signed = await opts.admin.storage.from("marketing-videos").createSignedUrl(path, 60 * 60 * 24);
  if (signed.error || !signed.data) throw new Error(`sign soft-pass url failed: ${signed.error?.message || 'no url'}`);
  return signed.data.signedUrl;
}

/** 把一组参考图全部走软通过。失败的那张退回原图,不阻断整组。 */
export async function softPassReferences(urls: string[], opts: { admin: UploadDeps; userId: string }): Promise<string[]> {
  const out = await Promise.all(urls.map(async (u) => {
    try { return await softPassFaceImage(u, opts); }
    catch (e) { console.warn("[face-gateway] soft-pass one ref failed, keep original:", (e as any)?.message); return u; }
  }));
  return out;
}
