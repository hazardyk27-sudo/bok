export const ROULETTE_PHYSICS_SCHEMA_VERSION = "roulette-physics-v1-rou-lp-test-04" as const;

export const ROULETTE_MODEL_PATH = "/physics-lab/rou-lp-test-04.glb" as const;
export const ROULETTE_RAW_SOURCE_CENTER = { x: 0, y: 0.167928, z: 0 } as const;

export const ROULETTE_WHEEL_DIAMETER = 6;
export const ROULETTE_AUTHORITATIVE_SCALE = 7.147963;
export const ROULETTE_WORLD_UNITS_PER_METER = 6;
export const ROULETTE_METERS_PER_WORLD_UNIT = 1 / ROULETTE_WORLD_UNITS_PER_METER;

export const ROULETTE_BALL_RADIUS = 0.056;
export const ROULETTE_GRAVITY_Y =
  -9.81 * ROULETTE_WORLD_UNITS_PER_METER;

export const ROULETTE_DARK_RACE_RADIUS_BAND = [2.27, 2.54] as const;
export const ROULETTE_DARK_RACE_LAUNCH_RADIUS = 2.39;
export const ROULETTE_DARK_RACE_WOOD_INNER_RADIUS = 2.47;
export const ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS = 2.26;
export const ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS = 2.225;
export const ROULETTE_POCKET_FLOOR_OUTER_RADIUS = 1.9;
export const ROULETTE_POCKET_FLOOR_Y = -0.45;
export const ROULETTE_POCKET_OUTER_LIP_RADIUS = 2.04;
export const ROULETTE_POCKET_OUTER_LIP_Y = -0.29;

export const ROULETTE_DARK_RACE_CHANNEL_PROFILE = [
  [2.18, -0.205],
  [2.195, -0.270],
  [ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS, -0.330],
  [2.245, -0.355],
  [2.27, -0.3610],
  [2.34, -0.3392],
  [2.42, -0.3143],
  [2.47, -0.2988],
  [2.50, -0.2895],
  [2.525, -0.2818],
  [2.545, -0.2756],
  [2.555, -0.2725],
  [2.558, -0.120],
  [2.559, -0.040],
] as const;

export const ROULETTE_FIXED_TIMESTEP = 1 / 120;
export const ROULETTE_MAX_CCD_SUBSTEPS = 8;
export const ROULETTE_ROTATION_AXIS = "Y+" as const;
export const ROULETTE_ROTOR_BODY_MODE = "kinematic-position-y" as const;
export const ROULETTE_ROTOR_ANGULAR_SPEED = 0.35;
export const ROULETTE_ROTOR_FRICTION = 0.30;
export const ROULETTE_Y_ORIGIN = 0;

export const ROULETTE_EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const ROULETTE_POCKET_COUNT = ROULETTE_EUROPEAN_SEQUENCE.length;
export const ROULETTE_SEGMENT_DEGREES = 360 / ROULETTE_POCKET_COUNT;

export type RouletteLaunchVector = {
  x: number;
  y: number;
  z: number;
};

export type RouletteCanonicalLaunchState = {
  surfacePoint: RouletteLaunchVector;
  surfaceNormal: RouletteLaunchVector;
  position: RouletteLaunchVector;
  velocity: RouletteLaunchVector;
  angularVelocity: RouletteLaunchVector;
};

export function buildRouletteCanonicalLaunchState({
  surfacePoint,
  surfaceNormal,
  launchSpeed,
  launchAzimuthRadians,
  ballRadius = ROULETTE_BALL_RADIUS,
  launchClearance = 0.01,
  spinFactor = 1,
}: {
  surfacePoint: RouletteLaunchVector;
  surfaceNormal: RouletteLaunchVector;
  launchSpeed: number;
  launchAzimuthRadians: number;
  ballRadius?: number;
  launchClearance?: number;
  spinFactor?: number;
}): RouletteCanonicalLaunchState {
  const point = {
    x: surfacePoint.x,
    y: surfacePoint.y,
    z: surfacePoint.z,
  };
  const normalLength = Math.hypot(
    surfaceNormal.x,
    surfaceNormal.y,
    surfaceNormal.z,
  );
  if (normalLength <= 1e-12) {
    throw new Error("ROULETTE_CANONICAL_LAUNCH_NORMAL_MISSING");
  }
  const normal = {
    x: surfaceNormal.x / normalLength,
    y: surfaceNormal.y / normalLength,
    z: surfaceNormal.z / normalLength,
  };

  const radial = {
    x: Math.sin(launchAzimuthRadians),
    y: 0,
    z: Math.cos(launchAzimuthRadians),
  };
  const tangentRaw = {
    x: normal.y * radial.z - normal.z * radial.y,
    y: normal.z * radial.x - normal.x * radial.z,
    z: normal.x * radial.y - normal.y * radial.x,
  };
  const tangentLength = Math.hypot(
    tangentRaw.x,
    tangentRaw.y,
    tangentRaw.z,
  );
  if (tangentLength <= 1e-12) {
    throw new Error("ROULETTE_CANONICAL_LAUNCH_TANGENT_MISSING");
  }
  const tangent = {
    x: tangentRaw.x / tangentLength,
    y: tangentRaw.y / tangentLength,
    z: tangentRaw.z / tangentLength,
  };

  const clearance = ballRadius + launchClearance;
  const position = {
    x: point.x + normal.x * clearance,
    y: point.y + normal.y * clearance,
    z: point.z + normal.z * clearance,
  };
  const velocity = {
    x: tangent.x * launchSpeed,
    y: tangent.y * launchSpeed,
    z: tangent.z * launchSpeed,
  };
  const angularVelocity = {
    x:
      (normal.y * velocity.z - normal.z * velocity.y) *
      (spinFactor / ballRadius),
    y:
      (normal.z * velocity.x - normal.x * velocity.z) *
      (spinFactor / ballRadius),
    z:
      (normal.x * velocity.y - normal.y * velocity.x) *
      (spinFactor / ballRadius),
  };

  return {
    surfacePoint: point,
    surfaceNormal: normal,
    position,
    velocity,
    angularVelocity,
  };
}

export const ROULETTE_PHYSICS_CONFIG = {
  schemaVersion: ROULETTE_PHYSICS_SCHEMA_VERSION,
  modelPath: ROULETTE_MODEL_PATH,
  rawSourceCenter: ROULETTE_RAW_SOURCE_CENTER,
  wheelDiameter: ROULETTE_WHEEL_DIAMETER,
  authoritativeScale: ROULETTE_AUTHORITATIVE_SCALE,
  worldUnitsPerMeter: ROULETTE_WORLD_UNITS_PER_METER,
  metersPerWorldUnit: ROULETTE_METERS_PER_WORLD_UNIT,
  ballRadius: ROULETTE_BALL_RADIUS,
  gravityY: ROULETTE_GRAVITY_Y,
  darkRaceRadiusBand: ROULETTE_DARK_RACE_RADIUS_BAND,
  darkRaceLaunchRadius: ROULETTE_DARK_RACE_LAUNCH_RADIUS,
  darkRaceWoodInnerRadius: ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
  darkRaceInwardEdgeRadius: ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
  darkRaceInnerContainmentRadius: ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS,
  darkRaceChannelProfile: ROULETTE_DARK_RACE_CHANNEL_PROFILE,
  pocketFloorOuterRadius: ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
  pocketFloorY: ROULETTE_POCKET_FLOOR_Y,
  pocketOuterLipRadius: ROULETTE_POCKET_OUTER_LIP_RADIUS,
  pocketOuterLipY: ROULETTE_POCKET_OUTER_LIP_Y,
  fixedTimestep: ROULETTE_FIXED_TIMESTEP,
  maxCcdSubsteps: ROULETTE_MAX_CCD_SUBSTEPS,
  rotationAxis: ROULETTE_ROTATION_AXIS,
  rotorBodyMode: ROULETTE_ROTOR_BODY_MODE,
  rotorAngularSpeed: ROULETTE_ROTOR_ANGULAR_SPEED,
  rotorFriction: ROULETTE_ROTOR_FRICTION,
  yOrigin: ROULETTE_Y_ORIGIN,
  pocketCount: ROULETTE_POCKET_COUNT,
  europeanSequence: ROULETTE_EUROPEAN_SEQUENCE,
} as const;
