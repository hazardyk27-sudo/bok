const TAU = Math.PI * 2;

export const ROTOR_SPIN_PROFILE = {
  initialAngularVelocity: 7,
  dragPerSecond: 0.5,
  stopAngularVelocity: 0.12,
} as const;

export type RotorSpin = {
  startAngle: number;
  direction: 1 | -1;
  initialAngularVelocity: number;
  dragPerSecond: number;
  stopAngularVelocity: number;
  durationMs: number;
};

export type RotorSpinSample = {
  angle: number;
  angularVelocity: number;
  progress: number;
  done: boolean;
};

export function getRotorSpinDurationMs(
  initialAngularVelocity: number,
  dragPerSecond: number,
  stopAngularVelocity: number,
) {
  if (
    initialAngularVelocity <= 0 ||
    dragPerSecond <= 0 ||
    stopAngularVelocity <= 0 ||
    stopAngularVelocity >= initialAngularVelocity
  ) {
    return 0;
  }

  return (
    Math.log(initialAngularVelocity / stopAngularVelocity) /
    dragPerSecond *
    1000
  );
}

export function createRotorSpin(
  startAngle: number,
  direction: 1 | -1 = 1,
): RotorSpin {
  const {
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
  } = ROTOR_SPIN_PROFILE;

  return {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
    durationMs: getRotorSpinDurationMs(
      initialAngularVelocity,
      dragPerSecond,
      stopAngularVelocity,
    ),
  };
}

export function sampleRotorSpin(
  spin: RotorSpin,
  elapsedMs: number,
): RotorSpinSample {
  const clampedElapsedMs = Math.min(
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0),
    spin.durationMs,
  );
  const elapsedSeconds = clampedElapsedMs / 1000;
  const decay = Math.exp(-spin.dragPerSecond * elapsedSeconds);
  const angularVelocity = spin.initialAngularVelocity * decay;

  const angularTravel =
    spin.dragPerSecond > 0
      ? spin.initialAngularVelocity / spin.dragPerSecond * (1 - decay)
      : 0;

  const angle =
    spin.startAngle +
    spin.direction * angularTravel;

  const done = clampedElapsedMs >= spin.durationMs;
  const progress =
    spin.durationMs > 0
      ? Math.min(1, clampedElapsedMs / spin.durationMs)
      : 1;

  return {
    angle,
    angularVelocity: done ? 0 : angularVelocity,
    progress,
    done,
  };
}

export function getRotorSpinRevolutions(spin: RotorSpin) {
  const finalSample = sampleRotorSpin(spin, spin.durationMs);
  return Math.abs(finalSample.angle - spin.startAngle) / TAU;
}
