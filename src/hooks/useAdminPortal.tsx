import { useRef, useState, useCallback } from 'react';

const PORTAL_PASSWORDS = ['pzy5565283', '880723', 'boomer2016'];
const SESSION_KEY = '__admin_portal_unlocked';
const TAP_WINDOW_MS = 3000;
const TAP_THRESHOLD = 5;

export function isPortalUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockPortal() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* noop */
  }
}

export function lockPortal() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export function verifyPortalPassword(pwd: string) {
  return PORTAL_PASSWORDS.includes(pwd.trim());
}

/**
 * Hook：在 TAP_WINDOW_MS 内累计点击 TAP_THRESHOLD 次触发回调。
 */
export function useLogoTapCounter(onTrigger: () => void) {
  const [count, setCount] = useState(0);
  const lastTapRef = useRef<number>(0);

  const tap = useCallback(() => {
    const now = Date.now();
    const next = now - lastTapRef.current > TAP_WINDOW_MS ? 1 : count + 1;
    lastTapRef.current = now;
    setCount(next);
    if (next >= TAP_THRESHOLD) {
      setCount(0);
      onTrigger();
    }
  }, [count, onTrigger]);

  return { tap, count };
}
