export function getAnimationDuration(
  value: number,
  turbo: boolean,
  freeSpin = false,
) {
  const slowed = Math.round(value * 1.10);
  return turbo && !freeSpin ? Math.round(slowed * 0.50) : slowed;
}

export function shouldResumeAutoSpin(autoResumeRequested: boolean, autoRemaining: number) {
  return autoResumeRequested && autoRemaining > 0;
}