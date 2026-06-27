// 探店脚本节日借势:按当前日期挑最近一个即将到来的节日,把氛围灌进 brief。
// 农历节日用静态阳历表(2026–2028),够用就行,不引第三方库。

export interface Holiday {
  name: string;
  /** 阳历月(1-12) */
  month: number;
  /** 阳历日(1-31) */
  day: number;
  /** 距离当前日期 ≤ windowDays 才开始借势 */
  windowDays: number;
  /** 渲染 prompt 用的英文 style cue */
  vibe: string;
  /** 脚本钩子的语气提示 */
  hookHints: string[];
  /** 给店员看的中文标签里的额外描述 */
  flavor?: string;
}

// 阳历固定节日
const FIXED: Omit<Holiday, "month" | "day">[] & { month: number; day: number }[] = [] as any;

function H(
  name: string, month: number, day: number, windowDays: number,
  vibe: string, hookHints: string[], flavor?: string,
): Holiday {
  return { name, month, day, windowDays, vibe, hookHints, flavor };
}

// 阳历节日表
const FIXED_HOLIDAYS: Holiday[] = [
  H("元旦", 1, 1, 7, "fresh new-year mood, soft white morning light, hopeful tone",
    ["新年第一探!", "2026 第一站打卡!"]),
  H("情人节", 2, 14, 7, "warm pinkish glow, romantic close-up, soft bokeh",
    ["情人节就该来这", "约会前先来探!"]),
  H("女神节", 3, 8, 5, "soft pastel light, feminine, indulgent vibe",
    ["女神节犒劳自己", "姐妹们冲女神节!"]),
  H("清明", 4, 5, 5, "calm overcast sky, gentle pace, springtime green",
    ["清明小长假探店", "春天的店逛起来"]),
  H("五一", 5, 1, 10, "bright sunny vacation mood, energetic crowd",
    ["五一别窝家里", "五一就来这家!"]),
  H("520", 5, 20, 5, "rose-tinted dreamy light, intimate close-up",
    ["520 礼物在这", "520 送她这个!"]),
  H("儿童节", 6, 1, 5, "playful pastel colors, whimsical motion",
    ["六一童心大爆发", "大人也过儿童节!"]),
  H("暑假", 7, 1, 14, "bright summer afternoon, cicada vibe, vacation rush",
    ["暑假冲鸭", "暑假必去清单 +1!", "放假就来这"], "(7-8 月整段)"),
  H("教师节", 9, 10, 5, "warm classroom-like nostalgia, soft afternoon light",
    ["教师节送礼来这", "老师们也爱逛!"]),
  H("国庆", 10, 1, 14, "festive red-gold accents, crowded street, holiday energy",
    ["国庆别远游", "国庆 7 天就来这家!"]),
  H("双十一", 11, 11, 10, "neon shopping rush, dynamic cuts",
    ["双十一线下捡漏", "比直播间还便宜!"]),
  H("双十二", 12, 12, 7, "year-end clearance vibe, warm shop light",
    ["双十二压轴扫货", "年底最后一波!"]),
  H("圣诞", 12, 25, 14, "christmas warm fairy lights, cozy snow mood",
    ["圣诞约会去哪", "圣诞气氛拉满!"]),
  H("跨年", 12, 31, 7, "midnight celebration, sparkles, party energy",
    ["跨年别窝家", "2027 倒计时这家见!"]),
];

// 农历节日的阳历日期(2026–2028)
const LUNAR: { name: string; dates: string[]; vibe: string; hookHints: string[]; windowDays: number }[] = [
  {
    name: "春节", windowDays: 21,
    dates: ["2026-02-17", "2027-02-06", "2028-01-26"],
    vibe: "chinese new year red lanterns, warm festive crowd, gold accents",
    hookHints: ["春节回家先探店", "新年第一逛!", "过年来这家!"],
  },
  {
    name: "端午", windowDays: 10,
    dates: ["2026-06-19", "2027-06-09", "2028-05-28"],
    vibe: "warm summer afternoon, leafy green, soft humid haze",
    hookHints: ["端午粽香探店", "端午小长假冲!"],
  },
  {
    name: "七夕", windowDays: 7,
    dates: ["2026-08-19", "2027-08-08", "2028-08-26"],
    vibe: "rose-tinted dreamy night, intimate two-shot",
    hookHints: ["七夕约会就来这", "七夕礼物在这家!"],
  },
  {
    name: "中秋", windowDays: 14,
    dates: ["2026-09-25", "2027-09-15", "2028-10-03"],
    vibe: "mid-autumn warm lantern glow, family gathering vibe",
    hookHints: ["中秋探店,姐妹冲!", "中秋送礼来这家!"],
  },
];

function diffDays(a: Date, b: Date) {
  const MS = 86400 * 1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / MS);
}

/**
 * 返回距离今天 ≤ windowDays 且最近的一个节日。没有命中返回 null。
 * 对暑假这类长周期,如果今天在 7.1–8.31 之间也算"正在进行中" → daysAway=0。
 */
export function pickUpcomingHoliday(now: Date = new Date()): (Holiday & { daysAway: number }) | null {
  const candidates: (Holiday & { daysAway: number })[] = [];

  for (const h of FIXED_HOLIDAYS) {
    // 暑假特例:整段都算"现在"
    if (h.name === "暑假") {
      const inSeason = (now.getMonth() + 1 === 7) || (now.getMonth() + 1 === 8);
      if (inSeason) { candidates.push({ ...h, daysAway: 0 }); continue; }
    }
    // 找今年和明年里最近的一次
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      const d = new Date(y, h.month - 1, h.day);
      const da = diffDays(now, d);
      if (da >= 0 && da <= h.windowDays) {
        candidates.push({ ...h, daysAway: da });
        break;
      }
    }
  }

  for (const l of LUNAR) {
    for (const ds of l.dates) {
      const d = new Date(ds + "T00:00:00");
      const da = diffDays(now, d);
      if (da >= 0 && da <= l.windowDays) {
        candidates.push({
          name: l.name, month: d.getMonth() + 1, day: d.getDate(),
          windowDays: l.windowDays, vibe: l.vibe, hookHints: l.hookHints,
          daysAway: da,
        });
        break;
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.daysAway - b.daysAway);
  return candidates[0];
}

export function formatHolidayBrief(h: (Holiday & { daysAway: number }) | null): string {
  if (!h) return "";
  const when = h.daysAway === 0 ? "正在" : `还有 ${h.daysAway} 天就到`;
  const hints = h.hookHints.slice(0, 2).map((s) => `"${s}"`).join(" / ");
  return `【借势提示】现在${when}【${h.name}】,脚本的氛围、对白和钩子句请蹭这个节日。建议钩子句:${hints}。整体调性:${h.vibe}。`;
}
