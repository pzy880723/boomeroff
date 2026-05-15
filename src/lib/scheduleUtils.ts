// 排班相关日期工具，全部基于 Asia/Shanghai 时区。

const TZ = 'Asia/Shanghai';

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 周一为本周第一天，返回该周一 ISO */
export function weekStartISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEK_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function shortDateLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function formatShiftTime(start?: string | null, end?: string | null): string {
  if (!start || !end) return '';
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export function nextNDays(startISO: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysISO(startISO, i));
}


// 为每个用户生成稳定的色块（HSL 浅底深字），便于排班识别
const USER_COLOR_HUES = [200, 25, 280, 140, 340, 50, 175, 305, 95, 15, 250, 120];
export function colorForUser(userId: string): { bg: string; fg: string; border: string } {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const hue = USER_COLOR_HUES[h % USER_COLOR_HUES.length];
  return {
    bg: `hsl(${hue} 70% 88%)`,
    fg: `hsl(${hue} 55% 25%)`,
    border: `hsl(${hue} 60% 70%)`,
  };
}
