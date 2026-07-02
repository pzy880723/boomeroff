import {
  Camera, BookOpen, Ticket, Clapperboard, MessagesSquare,
  BookMarked, CalendarDays, CalendarCheck, FileText,
  Megaphone, Bell, User, MoreHorizontal, Target,
} from 'lucide-react';

export interface AppIconMeta {
  id: string;
  label: string;
  to: string;
  Icon: typeof Camera;
  /** 统一走品牌 token，图标 tile 底色 */
  tint: string;
}

// 统一视觉：主要入口用朱红 tint，其它用中性 foreground tint。
const T_PRIMARY = 'bg-primary/10 text-primary';
const T_NEUTRAL = 'bg-foreground/[0.06] text-foreground';

export const APP_ICON_REGISTRY: Record<string, AppIconMeta> = {
  scan:      { id: 'scan',      label: 'AI 识物',    to: '/scan',            Icon: Camera,         tint: T_PRIMARY },
  library:   { id: 'library',   label: '知识库',     to: '/library',         Icon: BookOpen,       tint: T_NEUTRAL },
  vouchers:  { id: 'vouchers',  label: '我的券包',   to: '/me/vouchers',     Icon: Ticket,         tint: T_PRIMARY },
  marketing: { id: 'marketing', label: '营销中心',   to: '/me/marketing',    Icon: Clapperboard,   tint: T_NEUTRAL },
  community: { id: 'community', label: '中古圈',     to: '/community',       Icon: MessagesSquare, tint: T_NEUTRAL },
  'my-kb':   { id: 'my-kb',     label: '我的知识',   to: '/my-library',      Icon: BookMarked,     tint: T_NEUTRAL },
  schedule:  { id: 'schedule',  label: '排班表',     to: '/me',              Icon: CalendarDays,   tint: T_NEUTRAL },
  checkins:  { id: 'checkins',  label: '打卡记录',   to: '/me/check-ins',    Icon: CalendarCheck,  tint: T_NEUTRAL },
  sop:       { id: 'sop',       label: '员工手册',   to: '/me/sop',          Icon: FileText,       tint: T_NEUTRAL },
  qa:        { id: 'qa',        label: '门店问答',   to: '/me/qa',           Icon: FileText,       tint: T_NEUTRAL },
  activities:{ id: 'activities',label: '门店活动',   to: '/me/activities',   Icon: Megaphone,      tint: T_PRIMARY },
  okr:       { id: 'okr',       label: '门店管理',   to: '/store/okr',       Icon: Target,         tint: T_PRIMARY },
  notifications:{ id: 'notifications', label: '通知', to: '/notifications', Icon: Bell,           tint: T_NEUTRAL },
  me:        { id: 'me',        label: '我的',       to: '/me',              Icon: User,           tint: T_NEUTRAL },
  more:      { id: 'more',      label: '更多',       to: '/me',              Icon: MoreHorizontal, tint: T_NEUTRAL },
};

export const ALL_APP_IDS = Object.keys(APP_ICON_REGISTRY);
