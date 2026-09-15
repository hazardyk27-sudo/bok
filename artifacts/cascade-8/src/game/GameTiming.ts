export function getAnimationDuration(
  value: number,
  turbo: boolean,
  reducedMotion: boolean,
  freeSpin = false,
) {
  if (reducedMotion) return 40;
  const slowed = Math.round(value * 1.15);
  return turbo && !freeSpin ? Math.round(slowed * 0.45) : slowed;
}

export function shouldResumeAutoSpin(autoResumeRequested: boolean, autoRemaining: number) {
  return autoResumeRequested && autoRemaining > 0;
}