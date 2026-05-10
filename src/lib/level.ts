export const LEVELS = [
  { lv: 1, title: '中古萌新', threshold: 0 },
  { lv: 2, title: '入坑学徒', threshold: 15 },
  { lv: 3, title: '寻宝玩家', threshold: 40 },
  { lv: 4, title: '古物侦探', threshold: 80 },
  { lv: 5, title: '鉴货掌柜', threshold: 140 },
  { lv: 6, title: '行家里手', threshold: 220 },
  { lv: 7, title: '时代收藏家', threshold: 320 },
  { lv: 8, title: '中古名士', threshold: 450 },
  { lv: 9, title: '古董宗师', threshold: 600 },
  { lv: 10, title: '一代藏圣', threshold: 780 },
  { lv: 11, title: '鉴宝行家', threshold: 1000 },
  { lv: 12, title: '古玩通', threshold: 1260 },
  { lv: 13, title: '时光匠人', threshold: 1560 },
  { lv: 14, title: '藏界翘楚', threshold: 1900 },
  { lv: 15, title: '古今见证者', threshold: 2280 },
  { lv: 16, title: '万物鉴长', threshold: 2700 },
  { lv: 17, title: '古韵宗师', threshold: 3160 },
  { lv: 18, title: '典藏大家', threshold: 3660 },
  { lv: 19, title: '传世名匠', threshold: 4200 },
  { lv: 20, title: '古道掌门', threshold: 4800 },
  { lv: 21, title: '鉴古真人', threshold: 5440 },
  { lv: 22, title: '千秋藏圣', threshold: 6120 },
  { lv: 23, title: '古界帝王', threshold: 6840 },
  { lv: 24, title: '万古传奇', threshold: 7600 },
  { lv: 25, title: '中古之神', threshold: 8400 },
] as const;

export interface LevelInfo {
  level: number;
  title: string;
  totalExp: number;
  currentLevelExp: number;
  nextLevelExp: number;
  expIntoLevel: number;
  expForNext: number;
  progress: number; // 0-1
  isMax: boolean;
}

export function getLevelInfo(totalExp: number): LevelInfo {
  const exp = Math.max(0, totalExp || 0);
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (exp >= LEVELS[i].threshold) { idx = i; break; }
  }
  const cur = LEVELS[idx];
  const isMax = idx === LEVELS.length - 1;
  const next = isMax ? cur : LEVELS[idx + 1];
  const expIntoLevel = exp - cur.threshold;
  const expForNext = isMax ? 0 : next.threshold - cur.threshold;
  const progress = isMax ? 1 : expIntoLevel / expForNext;
  return {
    level: cur.lv,
    title: cur.title,
    totalExp: exp,
    currentLevelExp: cur.threshold,
    nextLevelExp: next.threshold,
    expIntoLevel,
    expForNext,
    progress,
    isMax,
  };
}

export const EXP_RULES = [
  { name: '每日签到', value: '+3' },
  { name: '连续签到 3 天', value: '额外 +3' },
  { name: '连续签到 7 天', value: '额外 +10' },
  { name: '连续签到 30 天', value: '额外 +30' },
  { name: 'AI 识别商品入库', value: '+5' },
  { name: '完善商品资料（描述/卖点/小贴士齐全）', value: '+8' },
  { name: '收藏官方/他人知识（每日上限 5 次）', value: '+1' },
  { name: '在中古圈发帖', value: '+5' },
  { name: '帖子被点赞', value: '+2' },
  { name: '帖子被评论', value: '+3' },
  { name: '通过个人知识测试', value: '+15' },
  { name: '提交识别纠错被采纳', value: '+30' },
];
