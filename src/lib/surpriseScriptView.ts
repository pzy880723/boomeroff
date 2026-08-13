export type SurpriseScriptView = 'rendering' | 'error' | 'loading' | 'script';

export function resolveSurpriseScriptView({
  hasActiveJob,
  picking,
  hasPick,
  scriptError,
}: {
  hasActiveJob: boolean;
  picking: boolean;
  hasPick: boolean;
  scriptError: string | null;
}): SurpriseScriptView {
  if (hasActiveJob) return 'rendering';
  if (scriptError && !hasPick) return 'error';
  if (picking || !hasPick) return 'loading';
  return 'script';
}
