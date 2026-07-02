import {
  Camera, BookOpen, Ticket, Clapperboard, MessagesSquare,
  BookMarked, CalendarDays, CalendarCheck, FileText,
  Megaphone, Bell, User, MoreHorizontal,
} from 'lucide-react';

export interface AppIconMeta {
  id: string;
  label: string;
  to: string;
  Icon: typeof Camera;
  /** tailwind bg utility for icon tile */
  tint: string;
}

export const APP_ICON_REGISTRY: Record<string, AppIconMeta> = {
  scan:      { id: 'scan',      label: 'AI 识物',   to: '/scan',            Icon: Camera,         tint: 'bg-primary/10 text-primary' },
  library:   { id: 'library',   label: '知识库',    to: '/library',         Icon: BookOpen,       tint: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  vouchers:  { id: 'vouchers',  label: '我的券包',  to: '/me/vouchers',     Icon: Ticket,         tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  marketing: { id: 'marketing', label: '营销中心',  to: '/me/marketing',    Icon: Clapperboard,   tint: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  community: { id: 'community', label: '中古圈',    to: '/community',       Icon: MessagesSquare, tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  'my-kb':   { id: 'my-kb',     label: '我的知识',  to: '/me/kb',           Icon: BookMarked,     tint: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  schedule:  { id: 'schedule',  label: '排班表',    to: '/me/schedule',     Icon: CalendarDays,   tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  checkins:  { id: 'checkins',  label: '打卡记录',  to: '/me/check-ins',    Icon: CalendarCheck,  tint: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  sop:       { id: 'sop',       label: '员工手册',  to: '/me/sop',          Icon: FileText,       tint: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  activities:{ id: 'activities',label: '门店活动',  to: '/me/activities',   Icon: Megaphone,      tint: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  notifications:{ id: 'notifications', label: '通知', to: '/notifications', Icon: Bell,          tint: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  me:        { id: 'me',        label: '我的',      to: '/me',              Icon: User,           tint: 'bg-neutral-500/10 text-neutral-700 dark:text-neutral-200' },
  more:      { id: 'more',      label: '更多',      to: '/me',              Icon: MoreHorizontal, tint: 'bg-muted text-muted-foreground' },
};

export const ALL_APP_IDS = Object.keys(APP_ICON_REGISTRY);
