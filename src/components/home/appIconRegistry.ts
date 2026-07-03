import type * as React from 'react';
import {
  ScanIcon, MarketingIcon, ActivitiesIcon, CommunityIcon,
  LibraryIcon, MyKbIcon, VouchersIcon, ScheduleIcon, CheckinsIcon,
  SopIcon, QaIcon, OkrIcon, NotificationsIcon, MeIcon, MoreIcon,
} from './BoomerAppIcons';

export type AppIconTone = 'red' | 'white';
export type AppIconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export interface AppIconMeta {
  id: string;
  label: string;
  to: string;
  Icon: AppIconComponent;
  /** 'red' = 品牌红实心 tile + 白色图标 (强调); 'white' = 白色玻璃 tile + 红色图标 (常规). */
  tone: AppIconTone;
}

/**
 * 全部 tile 只用两种色调:红瓷 / 白瓷。
 * 与顶栏 BOOMER GO wordmark、底部胶囊、Boomer 主色统一。
 */
export const APP_ICON_REGISTRY: Record<string, AppIconMeta> = {
  scan:          { id: 'scan',          label: 'AI 识物',   to: '/scan',          Icon: ScanIcon,          tone: 'red' },
  marketing:     { id: 'marketing',     label: '营销中心',   to: '/me/marketing',  Icon: MarketingIcon,     tone: 'red' },
  activities:    { id: 'activities',    label: '门店活动',   to: '/me/activities', Icon: ActivitiesIcon,    tone: 'red' },
  community:     { id: 'community',     label: 'BOOMER 圈', to: '/community',     Icon: CommunityIcon,     tone: 'red' },

  library:       { id: 'library',       label: '知识库',    to: '/library',       Icon: LibraryIcon,       tone: 'red' },
  'my-kb':       { id: 'my-kb',         label: '我的知识',   to: '/my-library',    Icon: MyKbIcon,          tone: 'red' },
  vouchers:      { id: 'vouchers',      label: '我的券包',   to: '/me/vouchers',   Icon: VouchersIcon,      tone: 'red' },
  schedule:      { id: 'schedule',      label: '排班表',    to: '/me',            Icon: ScheduleIcon,      tone: 'red' },
  checkins:      { id: 'checkins',      label: '打卡记录',   to: '/me/check-ins',  Icon: CheckinsIcon,      tone: 'red' },
  sop:           { id: 'sop',           label: '员工手册',   to: '/me/sop',        Icon: SopIcon,           tone: 'red' },
  qa:            { id: 'qa',            label: '门店问答',   to: '/me/qa',         Icon: QaIcon,            tone: 'red' },
  okr:           { id: 'okr',           label: '门店管理',   to: '/store/okr',     Icon: OkrIcon,           tone: 'red' },
  notifications: { id: 'notifications', label: '通知',      to: '/notifications', Icon: NotificationsIcon, tone: 'red' },
  me:            { id: 'me',            label: '我的',      to: '/me',            Icon: MeIcon,            tone: 'red' },
  more:          { id: 'more',          label: '更多',      to: '/me',            Icon: MoreIcon,          tone: 'red' },
};

export const ALL_APP_IDS = Object.keys(APP_ICON_REGISTRY);
