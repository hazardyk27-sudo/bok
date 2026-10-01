export function getAnimationDuration(
  value: number,
  turbo: boolean,
  freeSpin = false,
) {
  const slowed = Math.round(value * 1.15);
  return turbo && !freeSpin ? Math.round(slowed * 0.36) : slowed;
}

export function shouldResumeAutoSpin(autoResumeRequested: boolean, autoRemaining: number) {
  return autoResumeRequested && autoRemaining > 0;
}

export function getTumblePacingFactor(
  tumbleCount: number,
  freeSpin = false,
) {
  const count = Math.max(0, Math.trunc(tumbleCount));
  if (count <= 1) return 1;

  const base = count === 2
    ? 0.84
    : count === 3
      ? 0.72
      : count === 4
        ? 0.64
        : count === 5
          ? 0.58
          : 0.54;

  // Bonus rounds intentionally retain a little more ceremony, while still
  // avoiding multi-second serialized waits on long retrigger/tumble chains.
  return freeSpin ? Math.max(0.72, base) : base;
}

export function scaleTumbleAnimationDuration(
  value: number,
  tumbleCount: number,
  turbo: boolean,
  freeSpin = false,
) {
  const duration = getAnimationDuration(value, turbo, freeSpin);
  return Math.max(1, Math.round(duration * getTumblePacingFactor(tumbleCount, freeSpin)));
}
