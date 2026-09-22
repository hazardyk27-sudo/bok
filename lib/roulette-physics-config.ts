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

export const ROULETTE_FIXED_TIMESTEP = 1 / 120;
export const ROULETTE_MAX_CCD_SUBSTEPS = 8;
export const ROULETTE_ROTATION_AXIS = "Y+" as const;
export const ROULETTE_ROTOR_BODY_MODE = "kinematic-position-y" as const;
export const ROULETTE_ROTOR_ANGULAR_SPEED = 0.35;
export const ROULETTE_Y_ORIGIN = 0;

export const ROULETTE_EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const ROULETTE_POCKET_COUNT = ROULETTE_EUROPEAN_SEQUENCE.length;
export const ROULETTE_SEGMENT_DEGREES = 360 / ROULETTE_POCKET_COUNT;

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
  fixedTimestep: ROULETTE_FIXED_TIMESTEP,
  maxCcdSubsteps: ROULETTE_MAX_CCD_SUBSTEPS,
  rotationAxis: ROULETTE_ROTATION_AXIS,
  rotorBodyMode: ROULETTE_ROTOR_BODY_MODE,
  rotorAngularSpeed: ROULETTE_ROTOR_ANGULAR_SPEED,
  yOrigin: ROULETTE_Y_ORIGIN,
  pocketCount: ROULETTE_POCKET_COUNT,
  europeanSequence: ROULETTE_EUROPEAN_SEQUENCE,
} as const;
