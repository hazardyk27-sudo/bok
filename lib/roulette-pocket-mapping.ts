import {
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_POCKET_COUNT,
} from "./roulette-physics-config";

const TWO_PI = Math.PI * 2;

export const ROULETTE_GLB_VISIBLE_ZERO_ANGLE_DEGREES = 75.560811;
export const ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS =
  (ROULETTE_GLB_VISIBLE_ZERO_ANGLE_DEGREES * Math.PI) / 180;

/**
 * Raw GLB texture sequence advances in the negative angular direction:
 * 0, 32, 15, 19, ... as theta decreases.
 */
export const ROULETTE_GLB_SEQUENCE_DIRECTION = -1 as const;

/**
 * Authoritative physics pocket indices advance in the positive angular
 * direction. The GLB rotor basis converts raw GLB angles into this basis.
 */
export const ROULETTE_PHYSICS_SEQUENCE_DIRECTION = 1 as const;

export const ROULETTE_POCKET_STEP_RADIANS =
  TWO_PI / ROULETTE_POCKET_COUNT;
export const ROULETTE_POCKET_STEP_DEGREES =
  360 / ROULETTE_POCKET_COUNT;

export function normalizeRouletteAngle(angle: number) {
  const normalized = angle % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

export function normalizeRoulettePocketIndex(index: number) {
  return (
    (Math.round(index) % ROULETTE_POCKET_COUNT) +
    ROULETTE_POCKET_COUNT
  ) % ROULETTE_POCKET_COUNT;
}

export function rouletteRawGlbAngleForSequenceIndex(index: number) {
  const normalizedIndex = normalizeRoulettePocketIndex(index);
  return normalizeRouletteAngle(
    ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS +
      ROULETTE_GLB_SEQUENCE_DIRECTION *
        normalizedIndex *
        ROULETTE_POCKET_STEP_RADIANS,
  );
}

export function roulettePhysicsAngleForPocketIndex(index: number) {
  const normalizedIndex = normalizeRoulettePocketIndex(index);
  return normalizeRouletteAngle(
    ROULETTE_PHYSICS_SEQUENCE_DIRECTION *
      normalizedIndex *
      ROULETTE_POCKET_STEP_RADIANS,
  );
}

/**
 * Converts a raw GLB rotor-local angle into the authoritative physics-local
 * angular basis. This is the exact basis change measured from the GLB:
 *
 *   thetaPhysics = thetaVisible0 - thetaRawGlb
 *
 * The subtraction handles the GLB's opposite handedness and the measured
 * zero-angle origin in one transform.
 */
export function roulettePhysicsAngleFromRawGlbAngle(rawGlbAngle: number) {
  return normalizeRouletteAngle(
    ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS - rawGlbAngle,
  );
}

export function rouletteRawGlbSequenceIndexFromAngle(rawGlbAngle: number) {
  const relative =
    ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS - rawGlbAngle;
  return normalizeRoulettePocketIndex(
    relative / ROULETTE_POCKET_STEP_RADIANS,
  );
}

export function roulettePhysicsPocketIndexFromAngle(physicsAngle: number) {
  return normalizeRoulettePocketIndex(
    physicsAngle / ROULETTE_POCKET_STEP_RADIANS,
  );
}

/**
 * Once the rotor basis transform is applied, sequence index i in the GLB is
 * authoritative physics pocket index i. Keep this explicit so production,
 * server contracts and audits all use the same mapping.
 */
export function rouletteVisibleGlbIndexForPhysicsPocketIndex(index: number) {
  return normalizeRoulettePocketIndex(index);
}

export function roulettePhysicsPocketIndexForVisibleGlbIndex(index: number) {
  return normalizeRoulettePocketIndex(index);
}

export function rouletteNumberForPhysicsPocketIndex(index: number) {
  return ROULETTE_EUROPEAN_SEQUENCE[
    normalizeRoulettePocketIndex(index)
  ];
}
