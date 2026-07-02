import {
  Camera, BookOpen, Ticket, Clapperboard, Sparkles,
  BookMarked, CalendarDays, CalendarCheck, FileText,
  Megaphone, Bell, User, MoreHorizontal, Target, HelpCircle,
} from 'lucide-react';

export type AppIconTone = 'red' | 'white';

export interface AppIconMeta {
  id: string;
  label: string;
  to: string;
  Icon: typeof Camera;
  /** 'red' = 品牌红实心 tile + 白色图标 (强调); 'white' = 白色玻璃 tile + 红色图标 (常规). */
  tone: AppIconTone;
}

/**
 * 全部 tile 只用两种色调:红瓷 / 白瓷。
 * 与顶栏 BOOMER GO wordmark、底部胶囊、Boomer 主色统一。
 */
export const APP_ICON_REGISTRY: Record<string, AppIconMeta> = {
  scan:          { id: 'scan',          label: 'AI 识物',   to: '/scan',          Icon: Camera,         tone: 'red' },
  marketing:     { id: 'marketing',     label: '营销中心',   to: '/me/marketing',  Icon: Clapperboard,   tone: 'red' },
  activities:    { id: 'activities',    label: '门店活动',   to: '/me/activities', Icon: Megaphone,      tone: 'red' },
  community:     { id: 'community',     label: 'BOOMER 圈', to: '/community',     Icon: Sparkles,       tone: 'red' },

  library:       { id: 'library',       label: '知识库',    to: '/library',       Icon: BookOpen,       tone: 'red' },
  'my-kb':       { id: 'my-kb',         label: '我的知识',   to: '/my-library',    Icon: BookMarked,     tone: 'red' },
  vouchers:      { id: 'vouchers',      label: '我的券包',   to: '/me/vouchers',   Icon: Ticket,         tone: 'red' },
  schedule:      { id: 'schedule',      label: '排班表',    to: '/me',            Icon: CalendarDays,   tone: 'red' },
  checkins:      { id: 'checkins',      label: '打卡记录',   to: '/me/check-ins',  Icon: CalendarCheck,  tone: 'red' },
  sop:           { id: 'sop',           label: '员工手册',   to: '/me/sop',        Icon: FileText,       tone: 'red' },
  qa:            { id: 'qa',            label: '门店问答',   to: '/me/qa',         Icon: HelpCircle,     tone: 'red' },
  okr:           { id: 'okr',           label: '门店管理',   to: '/store/okr',     Icon: Target,         tone: 'red' },
  notifications: { id: 'notifications', label: '通知',      to: '/notifications', Icon: Bell,           tone: 'red' },
  me:            { id: 'me',            label: '我的',      to: '/me',            Icon: User,           tone: 'red' },
  more:          { id: 'more',          label: '更多',      to: '/me',            Icon: MoreHorizontal, tone: 'red' },
};

export const ALL_APP_IDS = Object.keys(APP_ICON_REGISTRY);
