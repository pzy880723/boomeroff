const LEVELS = Object.freeze([
  { level: 1, title: '中古萌新', threshold: 0 },
  { level: 2, title: '入坑学徒', threshold: 15 },
  { level: 3, title: '寻宝玩家', threshold: 40 },
  { level: 4, title: '古物侦探', threshold: 80 },
  { level: 5, title: '鉴货掌柜', threshold: 140 },
  { level: 6, title: '行家里手', threshold: 220 },
  { level: 7, title: '时代收藏家', threshold: 320 },
  { level: 8, title: '中古名士', threshold: 450 },
  { level: 9, title: '古董宗师', threshold: 600 },
  { level: 10, title: '一代藏圣', threshold: 780 },
  { level: 11, title: '鉴宝行家', threshold: 1000 },
  { level: 12, title: '古玩通', threshold: 1260 },
  { level: 13, title: '时光匠人', threshold: 1560 },
  { level: 14, title: '藏界翘楚', threshold: 1900 },
  { level: 15, title: '古今见证者', threshold: 2280 },
  { level: 16, title: '万物鉴长', threshold: 2700 },
  { level: 17, title: '古韵宗师', threshold: 3160 },
  { level: 18, title: '典藏大家', threshold: 3660 },
  { level: 19, title: '传世名匠', threshold: 4200 },
  { level: 20, title: '古道掌门', threshold: 4800 },
  { level: 21, title: '鉴古真人', threshold: 5440 },
  { level: 22, title: '千秋藏圣', threshold: 6120 },
  { level: 23, title: '古界帝王', threshold: 6840 },
  { level: 24, title: '万古传奇', threshold: 7600 },
  { level: 25, title: '中古之神', threshold: 8400 }
].map(row => Object.freeze(row)));

function levelInfo(totalExp) {
  if (typeof totalExp !== 'number' || !Number.isFinite(totalExp)) return { available: false, notice: '成长经验尚未同步，暂不可计算等级。' };
  if (totalExp < 0) return { available: false, notice: '云端经验为负，暂不计算等级；请核对云端记录。' };
  let index = LEVELS.length - 1;
  while (index > 0 && totalExp < LEVELS[index].threshold) index--;
  const current = LEVELS[index], isMax = index === LEVELS.length - 1;
  const next = isMax ? current : LEVELS[index + 1];
  const expIntoLevel = totalExp - current.threshold;
  const expForNext = isMax ? 0 : next.threshold - current.threshold;
  const progress = isMax ? 1 : expIntoLevel / expForNext;
  return {
    available: true, level: current.level, title: current.title, totalExp, isMax,
    currentLevelExp: current.threshold, nextLevelExp: next.threshold, expIntoLevel, expForNext,
    progress, progressPercent: Math.round(progress * 1000) / 10,
    nextGap: isMax ? 0 : next.threshold - totalExp
  };
}

module.exports = { LEVELS, levelInfo };
