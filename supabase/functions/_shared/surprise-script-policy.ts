import {
  normalizeSurpriseScript,
  SURPRISE_MAX_CN,
  SURPRISE_MIN_CN,
  type SurpriseScript,
} from './surprise-one-shot.ts';

export type SurpriseAgeBucket = 'young' | 'middle' | 'senior';

export interface SurpriseValidationOptions {
  ageBucket?: SurpriseAgeBucket | null;
  factContext?: string;
}

export interface SurpriseValidationResult {
  errors: string[];
  dialogueLength: number;
}

const SENIOR_BANNED_TOPICS = /暑假|寒假|开学|追星|入坑|摸鱼|加班|上班族/;
const YOUNG_BANNED_TOPICS = /退休|退休金|老伴|孙子|孙女|接孙辈|我们那年代/;
const UNSUPPORTED_FACTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /全(?:部|是).*日本进口|全(?:部|是).*漂洋过海/, label: '全部日本进口' },
  { pattern: /东京大阪.*一模一样|和东京大阪.*一样/, label: '东京大阪同款体验' },
  { pattern: /保证正品|保证升值|全网最低/, label: '保证性承诺' },
];

export function chineseDialogueLength(value: unknown): number {
  return String(value || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
}

function normalizeComparable(value: unknown): string {
  return String(value || '')
    .replace(/[。.!！?？…;；:：]+/g, '，')
    .replace(/[,，、]+/g, '，')
    .replace(/^[，\s]+|[，\s]+$/g, '')
    .replace(/\s+/g, '');
}

export function validateSurpriseScript(
  input: Partial<SurpriseScript> | null | undefined,
  options: SurpriseValidationOptions = {},
): SurpriseValidationResult {
  const script = input || {};
  const clips = [script.hook, ...(Array.isArray(script.scenes) ? script.scenes : []), script.outro];
  const errors: string[] = [];
  if (clips.length !== 5) errors.push(`必须恰好 5 段，当前 ${clips.length} 段`);

  clips.slice(0, 5).forEach((clip, index) => {
    if (!String(clip?.scene || '').trim()) errors.push(`第 ${index + 1} 段 scene 为空`);
    if (!String(clip?.action || '').trim()) errors.push(`第 ${index + 1} 段 action 为空`);
    if (!String(clip?.dialogue || '').trim()) errors.push(`第 ${index + 1} 段 dialogue 为空`);
    if (!String(clip?.subtitle || '').trim()) errors.push(`第 ${index + 1} 段 subtitle 为空`);
  });

  const continuous = normalizeComparable(script.continuous_dialogue);
  const joined = normalizeComparable(clips.slice(0, 5).map((clip) => clip?.dialogue || '').join('，'));
  const dialogueLength = chineseDialogueLength(continuous || joined);
  if (dialogueLength < SURPRISE_MIN_CN || dialogueLength > SURPRISE_MAX_CN) {
    errors.push(`continuous_dialogue 必须 ${SURPRISE_MIN_CN}-${SURPRISE_MAX_CN} 个汉字，当前 ${dialogueLength}`);
  }
  if (!continuous) errors.push('continuous_dialogue 为空');
  if (continuous && joined && continuous !== joined) errors.push('五段 dialogue 连接后必须与 continuous_dialogue 完全一致');
  if (/(大家好|各位姐妹|嗯|呃|那个|然后就是)/.test(continuous)) errors.push('连续口播包含客套词或语气词');

  if (options.ageBucket === 'senior' && SENIOR_BANNED_TOPICS.test(continuous)) {
    errors.push('老年人物对白不能使用暑假、开学、追星或上班摸鱼话题');
  }
  if (options.ageBucket === 'young' && YOUNG_BANNED_TOPICS.test(continuous)) {
    errors.push('青年人物对白不能使用退休、老伴或孙辈话题');
  }

  const factContext = String(options.factContext || '');
  for (const fact of UNSUPPORTED_FACTS) {
    if (fact.pattern.test(continuous) && !fact.pattern.test(factContext)) {
      errors.push(`脚本包含未被门店资料支持的事实：${fact.label}`);
    }
  }
  return { errors, dialogueLength };
}

export function normalizeDeepSeekSurpriseScript(input: Partial<SurpriseScript>): SurpriseScript {
  return normalizeSurpriseScript(input as SurpriseScript);
}

export function buildSurpriseRepairInstruction(errors: string[]): string {
  return `上一次 JSON 不合格，请只修复下面问题并完整重写 JSON：\n- ${errors.join('\n- ')}\n` +
    `五段对白必须各自完整、非空、与画面和字幕一一对应；五段用中文逗号连接后必须逐字等于 continuous_dialogue；` +
    `全文必须 ${SURPRISE_MIN_CN}-${SURPRISE_MAX_CN} 个汉字。`;
}
