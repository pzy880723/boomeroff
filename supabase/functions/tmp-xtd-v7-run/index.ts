import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const BUSINESS_ID = "national-day-20261001-xintiandi-v7-fast-25s";
const KEY = `campaign:${BUSINESS_ID}`;
const MODEL = "doubao-seedance-2-5-260628";
const ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const PROMPT = "上海新天地东台里BOOMER·OFF Vintage国庆综合探店广告。25秒，9:16，1080p，原生中文有声，一次完整生成。高内容密度、快节奏、激动清晰的连续口播，玩具、瓷器、黑胶音响、翻筐各有独立卖点与辨认镜头，不是Hello Kitty专卖店视频。\n\n13张参考图顺序严格绑定：图片1=33.jpg正面门头；图片2=35.jpg侧面门头；图片3=hello-kitty-shelf-03.jpg最新Kitty整架陈列；图片4=hello-kitty-detail-01.jpg红蝴蝶结大头Kitty摆件；图片5=hello-kitty-detail-02.jpg不同造型Kitty及粉蝴蝶结摆件；图片6=30.jpg上方真实Kitty毛绒；图片7=26.jpg面包超人及挂件陈列；图片8=36.jpg瓷器墙；图片9=32.jpg杯碟岛台；图片10=37.jpg仅参考黑胶唱片、唱机与音响部分；图片11=06.jpg通道与底层藤筐；图片12=28.jpg店内空间关系；图片13=29.jpg真实木质收银台。用户明确没有老电脑，不生成电脑商品或电脑镜头。仅使用本店参考，不改变商品造型，不把摆件变成毛绒。\n\n人物完全由模型原创，不使用人物图片：约25岁中国成年女生，黑色齐下巴短发，淡粉色开衫、白色内搭、米白色休闲裤、帆布鞋、小号斜挎包。微甜亲切，真实肤质和发丝，自然淡妆，不幼态、不娃娃音、不磨皮塑料脸。全片同一张脸、服装和声音。发现喜欢的物品时眼睛发亮、扬眉露齿笑、自然前倾分享；兴奋且快，不慢悠悠撒娇摆拍。\n\n声音最高优先级：第一帧立即开口，一条连续的同一女声口播贯穿至24.9秒左右。约每秒6.5–7个音节，快而清楚；情绪明亮兴奋，开场有拉朋友进店的热情，“啊，好可爱”有自然惊喜，“还不止这些”带兴奋的发现感，瓷器、黑胶和起价各有明确重音，“免费领冰箱贴”轻快上扬。音高和力度随发现变化，绝不平铺直叙，也不持续尖叫。自然极短换气外，不留展示商品、行走、换镜头或转场的无对白段。画面切换时人声连续；商品、手部、背影镜头用同一女声画外音，正脸口播口型同步。不要先做完动作才说话，不要让声音等待画面。不能机械倍速、吞字、复读、额外加词或省略品类；提前分配全文节奏，最后一句完整结束。\n原生BGM使用完全原创的日系City Pop氛围：轻快鼓点、律动贝斯、清亮电钢琴、干净节奏吉他与少量复古合成器，约116–124 BPM，明亮好逛，不能慵懒拖拍。纯器乐，不含人声歌词，不引用任何现成歌曲、旋律或艺人声音。音乐音量持续低于清晰主口播，随人声轻微闪避，无音乐前奏、纯音乐过门或音乐尾巴。\n\n精确口播，全文按顺序只说一次：\n“国庆到新天地，直接冲这家店！走，找回童年的快乐！啊，好可爱！Hello Kitty、面包超人，摆件、毛绒、小挂件，一整排都是童年回忆！还不止这些！日本、欧洲的中古瓷器，花花杯碟、茶具、装饰盘，挑一套回家，餐桌都变好看了！往里还有黑胶唱片、复古音响！翻翻唱片封面，喜欢复古的根本走不动！下面一筐筐小杂货也别漏了，全场六块九起！翻完这筐翻那筐，挑几件小可爱带回家！国庆就来新天地东台里！结账别忘了，免费领冰箱贴！”\n\n画面节奏以口播为轴，下列时间是画面参考，不是配音停顿点。16–20个有效镜头，多数0.8–1.5秒，动作匹配快切，能看清商品，不晃、不眩晕。\n0–3秒：第一帧女生半身与完整可辨认的真实BOOMER·OFF Vintage门头同框，指门头，直视镜头兴奋说开场；说到“走”就招手转身，摄影机快跟入开放入口，边说边走。保留原招牌字体、颜色与字形关系，不凭空生成街面/门框，不以无人空镜开始。\n3–7.2秒：图片3满架→图片4/5Kitty摆件→图片6毛绒→图片7面包超人/挂件，跟随口播对应呈现，并穿插女生的惊喜笑脸。不要给每件玩具慢慢端详；不让玩具活起来、不融合变形。毛绒只用照片支持的真实外观，不虚构抱取位置过高的大毛绒动作。\n7.2–12.5秒：随“还不止这些”切图片8瓷器墙与图片9岛台；花纹杯碟、茶具、装饰盘各有清晰快近景，女生轻托杯碟朝镜头一亮，强调摆上餐桌的美感，不缓慢转杯。日本/欧洲只修饰瓷器范围，不给单件添加未验证的产地、年份和品牌。\n12.5–16.8秒：图片10的唱片箱、封面、唱机和音响明确呈现；女生快速翻看唱片封面，指音响，轻快切表情。只展示，不假称设备功能或音质已验证；绝不增加老电脑。黑胶音响不能只作为一闪而过的背景。\n16.8–21.8秒：直接切到已蹲在图片11藤筐前的女生，省去完整蹲下过程；边说边翻，从筐内拿起照片支持的小物，展示挑中的结果；“全场六块九起”对应多个筐的中景，不把6.9元绑定到某件特写商品。无慢动作和反复翻同一物的拖时镜头。\n21.8–25秒：拿着选中的小物动作接切到图片13真实木质收银台，转向镜头轻快说到店指令与免费冰箱贴收尾。无需完整付款过程，无虚构支付金额、可辨认新收银员或虚构冰箱贴款式。最后一个字说完直接结束，无微笑等待或静止落版。\n\n保留白色裸顶、轨道灯、黑色洞洞板木层架、木岛台、藤筐的真实店铺结构与密度。无陌生门店，无伪造Logo和假价签，无虚构库存、限量稀有或上海第一排名。本次只生成无后加字幕的干净音画母版：用户要的中文字幕和结尾品牌地点条由后期精确叠加，不让视频模型生成字幕乱码或重画Logo；这不表示交付成片不需要字幕。原有真实招牌文字必须保留。手作不占口播，不插慢动作、缓慢环绕、长推镜、完整慢走、安静赏物、微笑不说话等拖慢节奏的片段。声音持续，商品丰富而分层，人物真实兴奋，结尾不截断。\n";
const REFS = ["https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F01_33.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F02_35_s.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F03_hello-kitty-shelf-03.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F04_hello-kitty-detail-01.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F05_hello-kitty-detail-02.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F06_30_s.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F07_26.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F05_36_s.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F06_32.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F07_37_s.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F08_06.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F03_28_s.jpg", "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20261001-xintiandi-v7-fast-25s%2F13_29_s.jpg"];
const RUNNER_VERSION = "v7-admin-fixed-20260930-1645";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Runner-Version": RUNNER_VERSION } });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function expectedSignature(secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(BUSINESS_ID)));
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "仅支持提交或查询固定任务" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ark = Deno.env.get("ARK_API_KEY");
  if (!url || !service || !ark) return json({ error: "服务端配置缺失" }, 500);
  const runSignature = req.headers.get("x-run-signature");
  if (!runSignature || runSignature !== await expectedSignature(ark)) return json({ error: "未授权" }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: row } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const existing = row?.value as any;
  if (existing?.task_id) {
    const p = await fetch(`${ENDPOINT}/${encodeURIComponent(existing.task_id)}`, { headers: { Authorization: `Bearer ${ark}` } });
    const raw = await p.json().catch(() => ({}));
    const status = raw?.status || existing.status || "unknown";
    const value = { ...existing, status, provider_result: raw, checked_at: new Date().toISOString() };
    await admin.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", KEY);
    return json({ reused: true, task_id: existing.task_id, status, provider: raw }, p.ok ? 200 : p.status);
  }
  if (existing?.submission_state === "submitting") return json({ error: "该固定任务正在提交，已阻止重复创建", record: existing }, 409);
  const started = new Date().toISOString();
  const base = { business_id: BUSINESS_ID, model: MODEL, duration: 25, ratio: "9:16", resolution: "1080p", generate_audio: true, reference_count: REFS.length, reference_urls: REFS, prompt: PROMPT, submission_state: "submitting", started_at: started };
  const { error: lockError } = await admin.from("app_settings").upsert({ key: KEY, value: base, updated_at: started }, { onConflict: "key" });
  if (lockError) return json({ error: lockError.message }, 500);
  const body = { model: MODEL, content: [{ type: "text", text: PROMPT }, ...REFS.map((u) => ({ type: "image_url", image_url: { url: u }, role: "reference_image" }))], resolution: "1080p", ratio: "9:16", duration: 25, watermark: false, generate_audio: true };
  let response: Response;
  try { response = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${ark}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (e) {
    const value = { ...base, submission_state: "uncertain", error: String(e), finished_at: new Date().toISOString() };
    await admin.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", KEY);
    return json({ created: false, uncertain: true, error: String(e) }, 502);
  }
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || !raw?.id) {
    const value = { ...base, submission_state: "rejected", status: "failed", http_status: response.status, error: raw, finished_at: new Date().toISOString() };
    await admin.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", KEY);
    return json({ created: false, http_status: response.status, provider: raw }, response.status || 502);
  }
  const value = { ...base, submission_state: "created", task_id: raw.id, status: raw.status || "queued", provider_create_result: raw, created_at: new Date().toISOString() };
  await admin.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", KEY);
  return json({ created: true, task_id: raw.id, status: value.status, model: MODEL, duration: 25, ratio: "9:16", resolution: "1080p", generate_audio: true, reference_count: REFS.length });
});
