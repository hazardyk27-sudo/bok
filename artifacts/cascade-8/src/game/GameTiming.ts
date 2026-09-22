export function getAnimationDuration(
  value: number,
  turbo: boolean,
  freeSpin = false,
) {
  const normalDuration = Math.round(value * 1.00);
  return turbo && !freeSpin ? Math.round(normalDuration * 0.60) : normalDuration;
}

export function shouldResumeAutoSpin(autoResumeRequested: boolean, autoRemaining: number) {
  return autoResumeRequested && autoRemaining > 0;
}