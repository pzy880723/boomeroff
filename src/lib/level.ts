export const LEVELS = [
  { lv: 1, title: '中古萌新', threshold: 0 },
  { lv: 2, title: '入坑学徒', threshold: 50 },
  { lv: 3, title: '寻宝玩家', threshold: 150 },
  { lv: 4, title: '古物侦探', threshold: 350 },
  { lv: 5, title: '鉴货掌柜', threshold: 700 },
  { lv: 6, title: '行家里手', threshold: 1200 },
  { lv: 7, title: '时代收藏家', threshold: 2000 },
  { lv: 8, title: '中古名士', threshold: 3200 },
  { lv: 9, title: '古董宗师', threshold: 5000 },
  { lv: 10, title: '一代藏圣', threshold: 8000 },
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
  { name: '每日签到', value: '+10' },
  { name: '连续签到 3 天', value: '额外 +5' },
  { name: '连续签到 7 天', value: '额外 +15' },
  { name: '连续签到 30 天', value: '额外 +50' },
  { name: '识别商品入库', value: '+15' },
  { name: '被收录到官方知识', value: '+30' },
  { name: '在中古圈发帖', value: '+5' },
  { name: '帖子被点赞', value: '+2' },
  { name: '帖子被评论', value: '+3' },
  { name: '通过个人知识测试', value: '+10' },
];
