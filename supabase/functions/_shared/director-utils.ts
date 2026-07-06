// 「让 BOOMER 替你拍一条」导演流水线的共享工具。
// 只在 director-* 这几个 edge function 里用,和老的 surprise / render 通道解耦。

export interface DirectorScriptScene {
  scene?: string;
  action?: string;
  subject?: string;
  camera?: string;
  motion?: string;
  dialogue?: string;
  subtitle?: string;
  duration_s?: number;
  image_index?: number | null;
}

export interface DirectorScript {
  hook?: DirectorScriptScene | null;
  outro?: DirectorScriptScene | null;
  scenes?: DirectorScriptScene[];
  total_duration_s?: number;
  bgm?: string;
  one_shot_prompt?: string;
  [k: string]: unknown;
}

export interface FlatShot {
  label: string;                 // 钩子 / 镜头1 / 收尾
  duration: number;              // 秒
  scene?: string;
  subject?: string;
  action?: string;
  camera?: string;
  subtitle?: string;
  dialogue?: string;
  prompt: string;
}

/** 把 script(hook+scenes+outro)拍平成一串 3-5 秒的镜头,直接落 video_generation_shots 表。 */
export function flattenScriptToShots(script: DirectorScript): FlatShot[] {
  const raw: Array<{ label: string; scene: DirectorScriptScene }> = [];
  if (script.hook) raw.push({ label: '钩子', scene: script.hook });
  (script.scenes || []).forEach((s, i) => raw.push({ label: `镜头${i + 1}`, scene: s }));
  if (script.outro) raw.push({ label: '收尾', scene: script.outro });

  return raw.map(({ label, scene }) => {
    const dur = Math.max(3, Math.min(5, Math.round(Number(scene.duration_s) || 3)));
    const parts: string[] = [];
    if (scene.scene) parts.push(`场景:${scene.scene}`);
    if (scene.subject) parts.push(`主体:${scene.subject}`);
    if (scene.action) parts.push(`动作:${scene.action}`);
    if (scene.camera || scene.motion) parts.push(`运镜:${scene.camera || scene.motion}`);
    if (scene.dialogue) parts.push(`台词:${scene.dialogue}`);
    if (scene.subtitle) parts.push(`字幕:${scene.subtitle}`);
    return {
      label,
      duration: dur,
      scene: scene.scene,
      subject: scene.subject,
      action: scene.action,
      camera: scene.camera || scene.motion,
      subtitle: scene.subtitle,
      dialogue: scene.dialogue,
      prompt: parts.join(' · '),
    };
  });
}

/** 用 Lovable AI Gateway(Nano Banana 2)生成一张 9:16 的原创虚构角色参考图。
 *  不传参考图,纯文本 prompt 出角色,严格避开明星/网红/影视角色。
 */
export async function generateCharacterReferenceImage(opts: {
  apiKey: string;
  persona: {
    label?: string;
    gender?: string;
    age?: number | string;
    visual?: string;
    vibe?: string;
  };
}): Promise<{ dataUrl: string; card: Record<string, unknown> }> {
  const persona = opts.persona || {};
  const card = {
    label: persona.label || '中古探店博主',
    gender: persona.gender || '女',
    age: persona.age ?? '25',
    visual: persona.visual || '',
    vibe: persona.vibe || '',
    forbidden: '禁止像任何明星/网红/影视角色/真实公众人物,必须是原创虚构人物',
  };

  const prompt =
    `一张 9:16 竖版角色参考照,单人半身像,中性纯色背景(米白色),干净打光,无文字无水印。\n` +
    `主体:${card.label},${card.gender},约 ${card.age} 岁。\n` +
    (card.visual ? `外观:${card.visual}\n` : '') +
    (card.vibe ? `气质:${card.vibe}\n` : '') +
    `硬约束:纯原创虚构人物;不得像任何明星/网红/影视角色/公众人物;不得出现文字水印/logo/字幕;\n` +
    `不要过度美颜,五官清晰、发型清晰、服装清晰,便于后续视频生成保持一致。`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`角色参考图生成失败(${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const imgs: unknown[] = msg?.images || [];
  let url: string | undefined;
  const first = imgs[0] as { image_url?: { url?: string } } | string | undefined;
  if (first && typeof first === "object" && first.image_url?.url) url = first.image_url.url;
  else if (typeof first === "string") url = first;
  else if (data?.data?.[0]?.b64_json) url = `data:image/png;base64,${data.data[0].b64_json}`;
  if (!url) throw new Error("模型未返回图片");
  return { dataUrl: url, card };
}

export async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  if (dataUrl.startsWith("data:")) {
    const base64 = dataUrl.split(",", 2)[1] || "";
    const bin = atob(base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }
  const r = await fetch(dataUrl);
  return new Uint8Array(await r.arrayBuffer());
}
