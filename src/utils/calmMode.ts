import { useSyncExternalStore } from 'react';

/**
 * Calm mode: switches off decorative motion (falling petals, twinkling star canvas,
 * marquee, pinging dots, glow pulses). Defaults to ON when the OS asks for reduced motion.
 */
const STORAGE_KEY = 'tsukuyomi_calm_mode';
const listeners = new Set<() => void>();

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === 'true';
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

let calm = readInitial();

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.calm = String(calm);
  }
}
apply();

export function isCalmMode(): boolean {
  return calm;
}

export function setCalmMode(next: boolean) {
  calm = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCalmMode(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => calm, () => false);
  return [value, setCalmMode];
}
