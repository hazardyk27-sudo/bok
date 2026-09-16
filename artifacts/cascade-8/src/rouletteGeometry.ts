export const EUROPEAN_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const ROULETTE_POCKET_COUNT = EUROPEAN_WHEEL_ORDER.length;
export const ROULETTE_SEGMENT_DEGREES = 360 / ROULETTE_POCKET_COUNT;
export const FALLBACK_OUTER_RADIUS_RATIO = 0.45;
export const FALLBACK_POCKET_RADIUS_RATIO = 0.34;

export type WheelRadii = {
  outerRadius: number;
  pocketRadius: number;
};

export type WheelLandingPlan = WheelRadii & {
  pocketIndex: number;
  targetAngle: number;
  targetOrientation: number;
  wheelDelta: number;
  finalRotation: number;
  finalLabelAngle: string;
};

export function getWheelIndex(number: number) {
  return EUROPEAN_WHEEL_ORDER.findIndex((value) => value === number);
}

export function getWheelAngle(number: number) {
  const pocketIndex = getWheelIndex(number);
  if (pocketIndex < 0) throw new RangeError(`Invalid European roulette number: ${number}`);
  return pocketIndex * ROULETTE_SEGMENT_DEGREES;
}

export function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

export function getWheelLandingPlan(
  winningNumber: number,
  currentRotation: number,
  radii: WheelRadii,
): WheelLandingPlan {
  const pocketIndex = getWheelIndex(winningNumber);
  const targetAngle = getWheelAngle(winningNumber);
  const targetOrientation = normalizeDegrees(360 - targetAngle);
  const wheelDelta = normalizeDegrees(targetOrientation - currentRotation) + 720;
  const finalRotation = currentRotation + wheelDelta;

  return {
    ...radii,
    pocketIndex,
    targetAngle,
    targetOrientation,
    wheelDelta,
    finalRotation,
    finalLabelAngle: `${normalizeDegrees(finalRotation)}deg`,
  };
}