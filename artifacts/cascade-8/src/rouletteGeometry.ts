import {
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_POCKET_COUNT as SHARED_ROULETTE_POCKET_COUNT,
  ROULETTE_SEGMENT_DEGREES as SHARED_ROULETTE_SEGMENT_DEGREES,
} from "../../../lib/roulette-physics-config";

export const EUROPEAN_WHEEL_ORDER = ROULETTE_EUROPEAN_SEQUENCE;
export const ROULETTE_POCKET_COUNT = SHARED_ROULETTE_POCKET_COUNT;
export const ROULETTE_SEGMENT_DEGREES = SHARED_ROULETTE_SEGMENT_DEGREES;
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
