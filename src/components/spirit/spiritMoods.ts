// 中古小精灵的情绪话术池 —— 纯本地随机，不调用 AI
export const MOODS = [
  '今天也辛苦啦～',
  '你最棒了 ✨',
  '要不要喝口水？',
  '来摸摸我？',
  '今天发现了什么好东西呀？',
  '深呼吸，我陪着你～',
  '记得抬头看一眼天哦',
  '慢慢来，不着急',
  '我相信你今天能识破所有疑难杂物 🔎',
  '别忘了笑一下嘛 😊',
];

export function randomMood(): string {
  return MOODS[Math.floor(Math.random() * MOODS.length)];
}

// idle 时随机彩蛋动作
export const IDLE_ACTIONS = [
  'spirit-action-wave',
  'spirit-action-peek',
  'spirit-action-nod',
  'spirit-action-shake',
  'spirit-action-jump',
  'spirit-action-wave',
  'spirit-action-peek',
  'spirit-action-jump',
  'spirit-action-spin', // 罕见，靠权重
] as const;

export function randomIdleAction(): string {
  return IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
}
