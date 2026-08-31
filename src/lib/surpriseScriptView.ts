export type SurpriseScriptView = 'rendering' | 'error' | 'loading' | 'category' | 'script';

export function resolveSurpriseScriptView({
  hasActiveJob,
  restoring,
  picking,
  hasPick,
  scriptError,
}: {
  hasActiveJob: boolean;
  restoring?: boolean;
  picking: boolean;
  hasPick: boolean;
  scriptError: string | null;
}): SurpriseScriptView {
  if (hasActiveJob) return 'rendering';
  if (scriptError && !hasPick) return 'error';
  if (restoring || picking) return 'loading';
  if (!hasPick) return 'category';
  return 'script';
}
