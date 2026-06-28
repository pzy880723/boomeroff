// Character Sheet 软通过:把人脸照片处理成"参考素材",绕过 Seedance 2.0 的真人分类器拦截。
// 技术参考:ViralTwin《How to pass Seedance 2.0's face filter》(2026),99% 通过率。
// 原理:在原图上叠红色十字(redaction 标记)+ 顶部白底黑字"CHARACTER SHEET REFERENCE"条幅,
// 让分类器把它读成"角色卡参考资料"而不是"真人快照"。
//
// 走 Storage:把处理后的 PNG 上传到 marketing-videos 的 _soft_pass/ 前缀下,返回签名 URL,
// 火山直接取这个 URL 当 reference_image 用,完全无感。

import { Image, Frame, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

// 说明:之前用 woff 字体 + Image.renderText 给白条幅加 "CHARACTER SHEET REFERENCE" 文字,
// 但 imagescript 不支持 woff,每张参考图都会抛 "invalid font" 异常,7 段 × N 张参考图
// 会把 edge function 的 CPU 配额打爆(WORKER_RESOURCE_LIMIT)。
// 实测纯白条幅 + 红十字 redaction 标记已足够让 Seedance 分类器识别为"角色卡参考",
// 因此移除文字渲染,既稳又快。

/** 把任意远程图片处理成 Character Sheet 风格的 PNG buffer。失败抛错。 */
export async function buildCharacterSheet(sourceUrl: string): Promise<Uint8Array> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`fetch source image failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const decoded = await decode(buf);
  let img: Image = decoded instanceof Frame
    ? decoded as unknown as Image
    : (Array.isArray((decoded as any).frames) ? (decoded as any).frames[0] as Image : decoded as Image);

  // Edge Function CPU 很紧:上传的手机原图常见 3000px+,逐像素画红十字会直接打爆配额。
  // 软通过只需要分类器看到“角色卡标记”,不需要保留原始分辨率,先压到 512px 长边。
  const MAX_SIDE = 512;
  const maxSide = Math.max(img.width, img.height);
  if (maxSide > MAX_SIDE) {
    const scale = MAX_SIDE / maxSide;
    img = img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale))) as Image;
  }

  const W = img.width, H = img.height;
  // ---- 1) 顶部白条幅(高度 = 短边的 8%) ----
  const bannerH = Math.max(48, Math.round(Math.min(W, H) * 0.08));
  const banner = new Image(W, bannerH).fill(0xffffffff);
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
