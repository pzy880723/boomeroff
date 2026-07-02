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
  /** iOS-style linear gradient for the tile face (from → to). */
  gradient: string;
}

/**
 * 每个 App 的图标 tile 走"液态玻璃 + 品牌渐变"的观感 —
 * 图标一律白色描边，tile 用一段 160° 的暖/冷色渐变。
 */
export const APP_ICON_REGISTRY: Record<string, AppIconMeta> = {
  scan:          { id: 'scan',          label: 'AI 识物',  to: '/scan',           Icon: Camera,         gradient: 'linear-gradient(160deg,#FF3B30 0%,#FF6A5A 100%)' },
  library:       { id: 'library',       label: '知识库',   to: '/library',        Icon: BookOpen,       gradient: 'linear-gradient(160deg,#2F80ED 0%,#56CCF2 100%)' },
  vouchers:      { id: 'vouchers',      label: '我的券包', to: '/me/vouchers',    Icon: Ticket,         gradient: 'linear-gradient(160deg,#FF9500 0%,#FFCC5C 100%)' },
  marketing:     { id: 'marketing',     label: '营销中心', to: '/me/marketing',   Icon: Clapperboard,   gradient: 'linear-gradient(160deg,#8E44FF 0%,#C088FF 100%)' },
  community:     { id: 'community',     label: 'BOOMER 圈',to: '/community',      Icon: MessagesSquare, gradient: 'linear-gradient(160deg,#E11D74 0%,#FF6EB5 100%)' },
  'my-kb':       { id: 'my-kb',         label: '我的知识', to: '/my-library',     Icon: BookMarked,     gradient: 'linear-gradient(160deg,#0EA5A4 0%,#5EEAD4 100%)' },
  schedule:      { id: 'schedule',      label: '排班表',   to: '/me',             Icon: CalendarDays,   gradient: 'linear-gradient(160deg,#4A5CFF 0%,#8FA0FF 100%)' },
  checkins:      { id: 'checkins',      label: '打卡记录', to: '/me/check-ins',   Icon: CalendarCheck,  gradient: 'linear-gradient(160deg,#22C55E 0%,#86EFAC 100%)' },
  sop:           { id: 'sop',           label: '员工手册', to: '/me/sop',         Icon: FileText,       gradient: 'linear-gradient(160deg,#475569 0%,#94A3B8 100%)' },
  qa:            { id: 'qa',            label: '门店问答', to: '/me/qa',          Icon: FileText,       gradient: 'linear-gradient(160deg,#0D9488 0%,#5EEAD4 100%)' },
  activities:    { id: 'activities',    label: '门店活动', to: '/me/activities',  Icon: Megaphone,      gradient: 'linear-gradient(160deg,#DC2626 0%,#FB7185 100%)' },
  okr:           { id: 'okr',           label: '门店管理', to: '/store/okr',      Icon: Target,         gradient: 'linear-gradient(160deg,#B91C1C 0%,#F97316 100%)' },
  notifications: { id: 'notifications', label: '通知',     to: '/notifications',  Icon: Bell,           gradient: 'linear-gradient(160deg,#F59E0B 0%,#FCD34D 100%)' },
  me:            { id: 'me',            label: '我的',     to: '/me',             Icon: User,           gradient: 'linear-gradient(160deg,#334155 0%,#64748B 100%)' },
  more:          { id: 'more',          label: '更多',     to: '/me',             Icon: MoreHorizontal, gradient: 'linear-gradient(160deg,#64748B 0%,#CBD5E1 100%)' },
};

export const ALL_APP_IDS = Object.keys(APP_ICON_REGISTRY);
