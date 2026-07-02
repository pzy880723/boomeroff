import * as React from 'react';

/**
 * BOOMER GO 品牌图标集 v3 —— 活泼版
 * 描边 = currentColor (品牌红),黄色小重点 = 柠檬金 (--accent-warm),
 * 打破单色的呆板,与首页 wordmark 一致。
 */
type IconProps = React.SVGProps<SVGSVGElement>;

const base: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  xmlns: 'http://www.w3.org/2000/svg',
};

const YELLOW = 'hsl(var(--accent-warm))';

const Svg = ({ children, ...p }: IconProps & { children: React.ReactNode }) => (
  <svg {...base} {...p}>{children}</svg>
);

/* ---------- 16 icons ---------- */

// 相机 —— 镜头黄圆点
export const ScanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="3" />
    <path d="M9 7l1.4-2.2a1.4 1.4 0 0 1 1.2-.7h.8a1.4 1.4 0 0 1 1.2.7L15 7" />
    <circle cx="12" cy="13.5" r="3.6" />
    <circle cx="12" cy="13.5" r="1.4" fill={YELLOW} stroke="none" />
  </Svg>
);

// 场记板 —— 铰链黄圆点
export const MarketingIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="12" rx="2.5" />
    <path d="M3 8l3-4 3 4M9 8l3-4 3 4M15 8l3-4 3 4" />
    <circle cx="6" cy="4" r="1.1" fill={YELLOW} stroke="none" />
  </Svg>
);

// 喇叭 —— 音符黄点
export const ActivitiesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8L15 20V4L8 8.5H5.5A1.5 1.5 0 0 0 4 10Z" />
    <path d="M18.5 8.5c1 1 1 6 0 7" />
    <circle cx="11" cy="12" r="1.1" fill={YELLOW} stroke="none" />
  </Svg>
);

// 四芒星 —— 中心黄圆
export const CommunityIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    <circle cx="12" cy="12" r="2.4" fill={YELLOW} stroke="none" />
  </Svg>
);

// 打开的书 —— 中缝黄书签点
export const LibraryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2Z" />
    <path d="M12 6.5v13" />
    <circle cx="12" cy="10" r="1.2" fill={YELLOW} stroke="none" />
  </Svg>
);

// 书+书签 —— 书签末端黄圆
export const MyKbIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5h11a2.5 2.5 0 0 1 2.5 2.5v13.5L14 17l-4.5 3.5V4.5" />
    <path d="M5 4.5v14A2.5 2.5 0 0 0 7.5 21H14" />
    <circle cx="11.7" cy="8" r="1.1" fill={YELLOW} stroke="none" />
  </Svg>
);

// 圆齿票 —— 中心黄星
export const VouchersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
    <path d="M12 10.4l0.7 1.5 1.6 0.2-1.2 1.1 0.3 1.6-1.4-0.8-1.4 0.8 0.3-1.6-1.2-1.1 1.6-0.2Z" fill={YELLOW} stroke="none" />
  </Svg>
);

// 日历 —— 今日格黄方块
export const ScheduleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10.5h17" />
    <path d="M8 3.5v4M16 3.5v4" />
    <rect x="14.5" y="12.5" width="3.2" height="3.2" rx="0.8" fill={YELLOW} stroke="none" />
  </Svg>
);

// 日历+勾 —— 勾旁黄点
export const CheckinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10.5h17" />
    <path d="M8 3.5v4M16 3.5v4" />
    <path d="M8.5 15l2.5 2.5L15.5 13" />
    <circle cx="17" cy="12.5" r="1.1" fill={YELLOW} stroke="none" />
  </Svg>
);

// 文档 —— 卷角黄三角
export const SopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5h8L19 8.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z" />
    <path d="M13.5 3.5V9h5" fill={YELLOW} stroke={YELLOW} />
    <path d="M13.5 3.5V9h5" />
    <path d="M8 13h7M8 16.5h5" />
  </Svg>
);

// 问号 —— 下方黄圆点
export const QaIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
    <circle cx="12" cy="17" r="1.3" fill={YELLOW} stroke="none" />
  </Svg>
);

// 靶心 —— 中心黄
export const OkrIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1.8" fill={YELLOW} stroke="none" />
  </Svg>
);

// 铃铛 —— 底部黄珠
export const NotificationsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5H4.5L6 16.5Z" />
    <path d="M10.5 20.5a1.8 1.8 0 0 0 3 0" />
    <circle cx="12" cy="19" r="0.9" fill={YELLOW} stroke="none" />
  </Svg>
);

// 人像 —— 头顶高光黄点
export const MeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20c1.5-3.8 4.5-5.5 7.5-5.5s6 1.7 7.5 5.5" />
    <circle cx="14" cy="6.5" r="0.9" fill={YELLOW} stroke="none" />
  </Svg>
);

// 三点 —— 中间点黄
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="2.1" fill={YELLOW} stroke="none" />
    <circle cx="18.5" cy="12" r="1.9" fill="currentColor" stroke="none" />
  </Svg>
);
