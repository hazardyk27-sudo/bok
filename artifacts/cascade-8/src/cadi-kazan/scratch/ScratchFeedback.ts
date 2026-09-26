export type ScratchHapticEvent = "GOLD" | "BOMB" | "CASH_OUT";

const HAPTIC_PATTERNS: Record<ScratchHapticEvent, number | number[]> = {
  GOLD: 18,
  BOMB: [36, 24, 72],
  CASH_OUT: [18, 28, 46],
};

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function getScratchHapticPattern(event: ScratchHapticEvent) {
  return HAPTIC_PATTERNS[event];
}

export function triggerScratchHaptic(event: ScratchHapticEvent) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  return navigator.vibrate(HAPTIC_PATTERNS[event]);
}