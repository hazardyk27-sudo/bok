import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_DARK_RACE_CHANNEL_PROFILE,
  ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
  ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS,
  ROULETTE_DARK_RACE_LAUNCH_RADIUS,
  ROULETTE_DARK_RACE_RADIUS_BAND,
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_FIXED_TIMESTEP,
  ROULETTE_GRAVITY_Y,
  ROULETTE_MAX_CCD_SUBSTEPS,
  ROULETTE_MODEL_PATH,
  ROULETTE_PHYSICS_SCHEMA_VERSION,
  ROULETTE_POCKET_COUNT,
  ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
  ROULETTE_POCKET_FLOOR_Y,
  ROULETTE_POCKET_OUTER_LIP_RADIUS,
  ROULETTE_POCKET_OUTER_LIP_Y,
  ROULETTE_ROTOR_ANGULAR_SPEED,
  ROULETTE_ROTOR_BODY_MODE,
  ROULETTE_WHEEL_DIAMETER,
} from "../../../lib/roulette-physics-config";
import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_POCKET_COUNT as CLIENT_POCKET_COUNT,
  ROULETTE_SEGMENT_DEGREES,
} from "./rouletteGeometry";

const part3ViewportSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../roulette-physics-lab/src/Part2SceneViewport.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

const physicsLabAppSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../roulette-physics-lab/src/App.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

const rouletteRuntimeWorkflowSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../.github/workflows/roulette-part6-runtime.yml",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("authoritative roulette physics config", () => {
  it("locks the rou-lp-test-04 physical scale and ball standard", () => {
    expect(ROULETTE_PHYSICS_SCHEMA_VERSION).toBe(
      "roulette-physics-v1-rou-lp-test-04",
    );
    expect(ROULETTE_MODEL_PATH).toBe("/physics-lab/rou-lp-test-04.glb");
    expect(ROULETTE_WHEEL_DIAMETER).toBe(6);
    expect(ROULETTE_AUTHORITATIVE_SCALE).toBeCloseTo(7.147963);
    expect(ROULETTE_BALL_RADIUS).toBeCloseTo(0.056);
    expect(ROULETTE_GRAVITY_Y).toBeCloseTo(-58.86);
    expect(ROULETTE_FIXED_TIMESTEP).toBeCloseTo(1 / 120);
    expect(ROULETTE_MAX_CCD_SUBSTEPS).toBe(8);
  });

  it("locks the measured recessed dark-race geometry", () => {
    expect(ROULETTE_DARK_RACE_RADIUS_BAND).toEqual([2.27, 2.54]);
    expect(ROULETTE_DARK_RACE_LAUNCH_RADIUS).toBeCloseTo(2.39);
    expect(ROULETTE_DARK_RACE_WOOD_INNER_RADIUS).toBeCloseTo(2.47);
    expect(ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS).toBeCloseTo(2.26);
    expect(ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS).toBeCloseTo(2.225);
    expect(
      ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS + ROULETTE_BALL_RADIUS,
    ).toBeCloseTo(2.281);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[0]).toEqual([2.18, -0.205]);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[2]).toEqual([2.225, -0.33]);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE.at(-1)).toEqual([
      2.559,
      -0.04,
    ]);
  });

  it("locks the continuous bowl-to-pocket seam", () => {
    expect(ROULETTE_POCKET_FLOOR_OUTER_RADIUS).toBeCloseTo(1.9);
    expect(ROULETTE_POCKET_FLOOR_Y).toBeCloseTo(-0.45);
    expect(ROULETTE_POCKET_OUTER_LIP_RADIUS).toBeCloseTo(2.04);
    expect(ROULETTE_POCKET_OUTER_LIP_Y).toBeCloseTo(-0.29);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[0][0]).toBeCloseTo(2.18);
    expect(
      ROULETTE_DARK_RACE_CHANNEL_PROFILE[0][0] -
        ROULETTE_POCKET_OUTER_LIP_RADIUS,
    ).toBeCloseTo(0.14);
  });

  it("locks the European 37-pocket Y-axis kinematic rotor contract", () => {
    expect(ROULETTE_POCKET_COUNT).toBe(37);
    expect(CLIENT_POCKET_COUNT).toBe(37);
    expect(EUROPEAN_WHEEL_ORDER).toEqual(ROULETTE_EUROPEAN_SEQUENCE);
    expect(ROULETTE_SEGMENT_DEGREES).toBeCloseTo(360 / 37);
    expect(ROULETTE_ROTOR_BODY_MODE).toBe("kinematic-position-y");
    expect(ROULETTE_ROTOR_ANGULAR_SPEED).toBeCloseTo(0.35);
  });

  it("keeps legacy outer-track constants out of the runtime physics path", () => {
    expect(part3ViewportSource).not.toContain(
      "const PART3_LAUNCH_RADIUS = 2.82",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_TRACK_INNER_RADIUS = 2.72",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_TRACK_OUTER_RADIUS = 2.90",
    );
    expect(part3ViewportSource).not.toContain(
      "PART3_LEGACY_TRACK_VERTICAL_OFFSET",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_OPERATIONAL_LAUNCH_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "const PART3_LAUNCH_RADIUS = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "return makePart2RaceChannelTrimesh(verticalOffset)",
    );
  });

  it("keeps a single continuous stationary bowl bridge between race and rotor lip", () => {
    expect(part3ViewportSource).toContain("function buildBowlBridgeTrimesh");
    expect(part3ViewportSource).toContain("measureBowlBridgeProfile");
    expect(part3ViewportSource).toContain(
      "const BOWL_BRIDGE_INNER_RADIUS = POCKET_OUTER_LIP_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "const BOWL_BRIDGE_OUTER_RADIUS = PART2_CHANNEL_PROFILE[0][0]",
    );
    expect(part3ViewportSource).toContain(
      "'stationary-bowl-apron-bridge'",
    );
    expect(part3ViewportSource).toContain(
      "[POCKET_OUTER_LIP_RADIUS, POCKET_OUTER_LIP_Y]",
    );
    expect(part3ViewportSource).toContain(
      "targetOuterY = part2ChannelSurfaceAt",
    );
    expect(part3ViewportSource).toContain(
      "setCollisionGroups(\n                   STATIONARY_COLLISION_GROUP",
    );
  });

  it("derives visible deflectors from the authoritative GLB instead of the 37-pocket ring", () => {
    expect(part3ViewportSource).not.toContain(
      "const PART3_DEFLECTOR_COUNT = 37",
    );
    expect(part3ViewportSource).not.toContain(
      "addPart3DeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "const PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT = 360",
    );
    expect(part3ViewportSource).toContain(
      "ROULETTE_POCKET_FLOOR_OUTER_RADIUS + 0.02",
    );
    expect(part3ViewportSource).toContain(
      "ROULETTE_DARK_RACE_WOOD_INNER_RADIUS + 0.22",
    );
    expect(part3ViewportSource).toContain(
      "const measureVisibleDeflectors = (): Part4DeflectorAudit",
    );
    expect(part3ViewportSource).toContain(
      "addMeasuredDeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "'asset-measured-visible-deflector-cuboid'",
    );
    expect(part3ViewportSource).toContain(
      "deflectorColliderType: 'asset-measured-cuboid'",
    );
    expect(part3ViewportSource).toContain(
      "PART4_DEFLECTOR_AUDIT",
    );
    expect(part3ViewportSource).toContain(
      "part4DeflectorAudit?.passed",
    );
    expect(part3ViewportSource).toContain(
      "part3DeflectorColliders = addMeasuredDeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "outerLaneOnly || outerLaneSpinOnly",
    );
    expect(part3ViewportSource).toContain(
      "part4MeasuredDeflectorOuterRadius ??",
    );
    expect(part3ViewportSource).not.toContain(
      "radius - BALL_RADIUS - PART2_ACTUAL_INWARD_EDGE_RADIUS",
    );
  });

  it("keeps the authoritative roulette chain in one Rapier world", () => {
    expect(
      part3ViewportSource.match(/new RAPIER\.World/g)?.length ?? 0,
    ).toBe(1);
    expect(part3ViewportSource).toContain(
      "part3TrackCollider = world.createCollider",
    );
    expect(part3ViewportSource).toContain(
      "part3BowlBridgeCollider = world.createCollider",
    );
    expect(part3ViewportSource).toContain(
      "part3DeflectorColliders = addMeasuredDeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "RAPIER.RigidBodyDesc.kinematicPositionBased()",
    );
    expect(part3ViewportSource).toContain(
      "part3PocketColliders = addKinematicPocketSystem(world, rotorBody)",
    );
    expect(part3ViewportSource).toContain(
      "for (let index = 0; index < EUROPEAN_POCKET_COUNT; index += 1)",
    );
    expect(part3ViewportSource).toContain(
      "physicsBallCollider = world.createCollider(ballColliderDescriptor, ballBody)",
    );
  });

  it("locks PART 6A.1 deterministic full-spin hardening without tuning physics", () => {
    expect(part3ViewportSource).toContain(
      "const PART6_TELEMETRY_SCHEMA_VERSION = 'roulette-part6-full-spin-telemetry-v1'",
    );
    const seedBlock = part3ViewportSource.match(
      /const PART6_DETERMINISTIC_SEEDS = \[([\s\S]*?)\] as const;/,
    );
    expect(seedBlock).not.toBeNull();
    expect(seedBlock?.[1].match(/\b610\d+\b/g) ?? []).toHaveLength(20);
    expect(part3ViewportSource).toContain(
      "return (value >>> 0) / 0x100000000;",
    );
    expect(part3ViewportSource).toContain(
      "const runPart6FullSpinTelemetryBatch = async () =>",
    );
    expect(part3ViewportSource).toContain(
      "void runPart6FullSpinTelemetryBatch();",
    );
    expect(part3ViewportSource).toContain(
      "let part6TelemetryBatchRunning = false;",
    );
    expect(part3ViewportSource).toContain(
      "rotorPivot && !part6TelemetryBatchRunning",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_UI_YIELD_STEPS = 240;",
    );
    expect(part3ViewportSource).toContain(
      "window.setTimeout(resolve, 0);",
    );
    expect(part3ViewportSource).toContain(
      "stateResetVerified",
    );
    expect(part3ViewportSource).toContain(
      "'OUTER_RACE'",
    );
    expect(part3ViewportSource).toContain(
      "'INWARD_DESCENT'",
    );
    expect(part3ViewportSource).toContain(
      "'DEFLECTOR_ZONE'",
    );
    expect(part3ViewportSource).toContain(
      "'ROTOR_ENTRY'",
    );
    expect(part3ViewportSource).toContain(
      "'FRETS'",
    );
    expect(part3ViewportSource).toContain(
      "'POCKET'",
    );
    expect(part3ViewportSource).toContain(
      "'SETTLED'",
    );
    expect(part3ViewportSource).toContain(
      "phaseSequenceValid",
    );
    expect(part3ViewportSource).toContain(
      "noSkippedRequiredPhases",
    );
    expect(part3ViewportSource).toContain(
      "const optionalFretPlacementValid =",
    );
    expect(part3ViewportSource).toContain(
      "fretEventIndex < 0 ||",
    );
    expect(part3ViewportSource).toContain(
      "const orderedCoreEvents = phases.filter",
    );
    expect(part3ViewportSource).toContain(
      "event.phase !== 'FRETS'",
    );
    expect(part3ViewportSource).toContain(
      "!timedOut &&",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_STATE_RESET_VECTOR_EPSILON = 0.0005",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_STATE_RESET_ANGLE_EPSILON = 0.00001",
    );
    expect(part3ViewportSource).toContain(
      "resetRotorAngleError <= PART6_STATE_RESET_ANGLE_EPSILON",
    );
    expect(part3ViewportSource).toContain(
      "resetAngularVelocityError",
    );

    expect(part3ViewportSource).toContain(
      "transitionMaxSurfacePenetration",
    );
    expect(part3ViewportSource).toContain(
      "transitionContactRoles",
    );
    expect(part3ViewportSource).toContain(
      "maxUnsupportedTransitionDuration",
    );
    expect(part3ViewportSource).toContain(
      "role === 'asset-measured-visible-deflector-cuboid'",
    );
    expect(part3ViewportSource).toContain(
      "role === 'pocket-fret-cuboid'",
    );
    expect(part3ViewportSource).toContain(
      "role === 'pocket-floor-trimesh'",
    );
    expect(part3ViewportSource).toContain(
      "settledFrames >= settleFramesRequired",
    );
    expect(part3ViewportSource).toContain(
      "safetyStatus:",
    );
    expect(part3ViewportSource).toContain(
      "calibrationStatus: 'not-evaluated'",
    );
    expect(part3ViewportSource).toContain(
      "medianLapCount",
    );
    expect(part3ViewportSource).toContain(
      "medianTrackContactRatio",
    );
    expect(part3ViewportSource).toContain(
      "safetyFailureRate",
    );
    expect(part3ViewportSource).toContain(
      "PART6_FULL_SPIN_TELEMETRY",
    );
    expect(part3ViewportSource).toContain(
      "data-testid=\"part6-full-spin-telemetry-report\"",
    );
    expect(part3ViewportSource).toContain(
      "const PART3_OUTER_SPIN_TRACK_FRICTION = 0.08",
    );
    expect(part3ViewportSource).toContain(
      "const PART3_OUTER_SPIN_LINEAR_DAMPING = 0.01",
    );
    expect(part3ViewportSource).toContain(
      "const PART3_OUTER_SPIN_ANGULAR_DAMPING = 0.01",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_LAUNCH_SPEED_METERS_PER_SECOND_BASE = 5.0",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_LAUNCH_SPEED_METERS_PER_SECOND_VARIATION = 0.15",
    );
    expect(part3ViewportSource).toContain(
      "PART6_LAUNCH_SPEED_METERS_PER_SECOND_BASE *\n  ROULETTE_WORLD_UNITS_PER_METER",
    );
    expect(part3ViewportSource).toContain(
      "PART6_LAUNCH_SPEED_METERS_PER_SECOND_VARIATION *\n  ROULETTE_WORLD_UNITS_PER_METER",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_BALL_SPIN_FACTOR = 1.0",
    );
    expect(part3ViewportSource).toContain(
      ".multiplyScalar(PART6_BALL_SPIN_FACTOR / BALL_RADIUS)",
    );
    expect(part3ViewportSource).toContain(
      "const PART6_INTERACTIVE_YIELD_STEPS = 30",
    );
    expect(part3ViewportSource).toContain(
      "ballMeshVisible: activeBallMesh.visible",
    );
    expect(part3ViewportSource).toContain(
      "activeBallMesh.visible = false",
    );
    expect(part3ViewportSource).toContain(
      "activeBallMesh.visible = previewSnapshot.ballMeshVisible",
    );
    expect(part3ViewportSource).toContain(
      "launchSpeedMetersPerSecond",
    );
    expect(part3ViewportSource).toContain(
      "const activePart3TrackFriction = outerLaneSpinOnly",
    );
    expect(part3ViewportSource).toContain(
      "? PART3_OUTER_SPIN_TRACK_FRICTION",
    );
    expect(part3ViewportSource).toContain(
      "? PART3_OUTER_SPIN_LINEAR_DAMPING",
    );
    expect(part3ViewportSource).toContain(
      "? PART3_OUTER_SPIN_ANGULAR_DAMPING",
    );
    expect(part3ViewportSource).toContain(
      ".setFriction(activePart3TrackFriction)",
    );
    expect(part3ViewportSource).toContain(
      "validationMode === 'part3' ? activePart3LinearDamping : 0.04",
    );
    expect(part3ViewportSource).toContain(
      "validationMode === 'part3' ? activePart3AngularDamping : 0.08",
    );
    expect(part3ViewportSource).not.toContain(".addForce(");
    expect(part3ViewportSource).not.toContain(".applyImpulse(");
    expect(part3ViewportSource).not.toContain(".addTorque(");
  });

  it("keeps validation failures visible without blocking the loaded roulette preview", () => {
    expect(physicsLabAppSource).toContain(
      "VALIDATION_ERROR_TITLES",
    );
    expect(physicsLabAppSource).toContain(
      "'physics-validation': 'Physics validation failed'",
    );
    expect(physicsLabAppSource).toContain(
      "telemetry: 'PART 6 telemetry failed'",
    );
    expect(physicsLabAppSource).toContain(
      "'geometry-audit': 'Geometry audit failed'",
    );
    expect(physicsLabAppSource).toContain(
      "const blockingFailure =",
    );
    expect(physicsLabAppSource).toContain(
      "resolvedKind === 'asset' || resolvedKind === 'initialization'",
    );
    expect(physicsLabAppSource).toContain(
      "setValidationIssue({",
    );
    expect(physicsLabAppSource).toContain(
      "data-testid=\"status-validation-issue\"",
    );
    expect(physicsLabAppSource).toContain(
      "Preview remains interactive for diagnosis.",
    );
    expect(physicsLabAppSource).toContain(
      "label: 'Scene unavailable'",
    );
    expect(physicsLabAppSource).not.toContain(
      "label: 'WebGL blocked'",
    );
    expect(physicsLabAppSource).not.toContain(
      "<strong>WebGL unavailable</strong>",
    );
    expect(physicsLabAppSource).toContain(
      'data-testid="build-part6b"',
    );
    expect(physicsLabAppSource).toContain(
      'PART 6B · FULL-SPIN',
    );
  });

  it("locks the active PART 6B route away from legacy PART B and PART C loops", () => {
    expect(part3ViewportSource).toContain(
      "const part6FullSpinRouteActive =",
    );
    expect(part3ViewportSource).toContain(
      "validationMode === 'part3' && outerLaneSpinOnly",
    );
    expect(part3ViewportSource).toContain(
      "} else if (part6FullSpinRouteActive) {",
    );
    expect(part3ViewportSource).toContain(
      "'PART 6B full-spin route active · recessed dark-race static gate running'",
    );
    expect(part3ViewportSource).toContain(
      "'PART 6B · FULL-SPIN CALIBRATION'",
    );
    expect(part3ViewportSource).toContain(
      "PART 6B ROUTE · 6A.1 TELEMETRY",
    );
    expect(part3ViewportSource).toContain(
      "outerLaneOnly &&\n            !part6FullSpinRouteActive",
    );
    expect(part3ViewportSource).toContain(
      "outerLaneSpinOnly &&\n            !part6FullSpinRouteActive",
    );
  });

  it("locks roulette runtime validation to the canonical feature branch", () => {
    expect(rouletteRuntimeWorkflowSource).toContain(
      "- feature/roulette",
    );
    expect(rouletteRuntimeWorkflowSource).toContain(
      "- main",
    );
    expect(rouletteRuntimeWorkflowSource).not.toContain(
      "roulette-physics-part6b",
    );
    expect(rouletteRuntimeWorkflowSource).not.toContain(
      "roulette-physics-part6\n",
    );
    expect(rouletteRuntimeWorkflowSource).toContain(
      "ROULETTE_PART6_TIMEOUT_MS: '900000'",
    );
  });

  it("keeps the PART 2 containment correction geometric only", () => {
    expect(part3ViewportSource).toContain("speed: 5,");
    expect(part3ViewportSource).toContain(
      "const initialLinearSpeed = PART3_PROBES[0].speed",
    );
    expect(part3ViewportSource).not.toContain(".addForce(");
    expect(part3ViewportSource).not.toContain(".applyImpulse(");
    expect(part3ViewportSource).not.toContain(".addTorque(");
    expect(part3ViewportSource).toContain(
      "PART2_INNER_CONTAINMENT_CENTER_LIMIT",
    );
    expect(part3ViewportSource).toContain(
      "minimumInnerContainmentClearance",
    );
  });
});
