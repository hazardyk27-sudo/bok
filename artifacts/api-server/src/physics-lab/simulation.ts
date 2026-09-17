import { createHash, randomBytes } from "node:crypto";
import RAPIER from "@dimforge/rapier3d-compat";

export const PHYSICS_LAB_FIXED_TIMESTEP = 1 / 120;
export const PHYSICS_LAB_DURATION_LIMIT_SECONDS = 24;
export const PHYSICS_LAB_STABLE_WINDOW_FRAMES = 180;
export const PHYSICS_LAB_SECTOR_COUNT = 37;
export const PHYSICS_LAB_BALL_RADIUS = 0.095;
export const PHYSICS_LAB_EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const SECTOR_STEP_RADIANS = (Math.PI * 2) / PHYSICS_LAB_SECTOR_COUNT;
const BALL_COLLISION_GROUP = 0x0001;
const STATIONARY_COLLISION_GROUP = 0x0002;
const ROTOR_COLLISION_GROUP = 0x0004;
const TRAJECTORY_SAMPLE_EVERY_STEPS = 4;
const MAX_TRAJECTORY_SAMPLES = Math.ceil(
  (PHYSICS_LAB_DURATION_LIMIT_SECONDS / PHYSICS_LAB_FIXED_TIMESTEP) /
    TRAJECTORY_SAMPLE_EVERY_STEPS,
) + 1;

const BALL_PARAMETERS = {
  radius: PHYSICS_LAB_BALL_RADIUS,
  mass: 0.032,
  friction: 0.4,
  restitution: 0.34,
  linearDamping: 0.12,
  angularDamping: 0.07,
  initialAngularVelocity: 22,
} as const;

const ROTOR_PARAMETERS = {
  initialAngularVelocity: 2.8,
  angularDamping: 0.25,
  mass: 2.8,
} as const;

type Vec3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };
type ColliderBody = "stationary" | "rotor";

type ColliderSpec = {
  id: string;
  label: string;
  body: ColliderBody;
  position: [number, number, number];
  halfExtents: [number, number, number];
  rotation: [number, number, number, number];
};

export type PhysicsLabRoundStatus = "SETTLED" | "INVALID";

export type PhysicsLabStartConditions = {
  seed: string;
  launchAzimuthRadians: number;
  launchAngleDegrees: number;
  launchSpeed: number;
  ballSpin: number;
  rotorInitialAngleRadians: number;
  rotorInitialAngularVelocity: number;
  ballPosition: [number, number, number];
  ballVelocity: [number, number, number];
  ballSpinAxis: [number, number, number];
};

export type PhysicsLabTrajectorySample = {
  step: number;
  simulatedAtMs: number;
  ball: {
    position: Vec3;
    orientation: Quaternion;
    linearVelocity: Vec3;
    angularVelocity: Vec3;
  };
  rotor: {
    orientation: Quaternion;
    angularVelocity: Vec3;
  };
};

export type PhysicsLabEvent = {
  type:
    | "TRACK_ENTRY"
    | "ENERGY_LOSS"
    | "NATURAL_INWARD_EXIT"
    | "DEFLECTOR_IMPACT"
    | "MOVING_FRET_CONTACT"
    | "POCKET_ENTRY"
    | "POCKET_CHANGE"
    | "POCKET_BOUNCE"
    | "STABLE_SETTLE"
    | "INVALID";
  step: number;
  simulatedAtMs: number;
  pocketIndex?: number;
  pocketNumber?: number;
  detail?: string;
};

export type PhysicsLabSimulationResult = {
  status: PhysicsLabRoundStatus;
  errorCode: string | null;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  stableSettleStep: number | null;
  simulationDurationMs: number;
  computedAt: string;
  startConditions: PhysicsLabStartConditions;
  trajectory: PhysicsLabTrajectorySample[];
  events: PhysicsLabEvent[];
  trajectoryHash: string;
};

let rapierReady: Promise<void> | null = null;

function initRapier() {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

function hashToUnit(seed: string, counter: number) {
  const digest = createHash("sha256")
    .update(`${seed}:${counter}`)
    .digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

function normalizedAngle(angle: number) {
  return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
}

function radialPosition(
  radius: number,
  angle: number,
  y: number,
): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function yQuaternion(angle: number): [number, number, number, number] {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

function tiltedYQuaternion(
  angle: number,
  tilt: number,
): [number, number, number, number] {
  const [x, y, z, w] = yQuaternion(angle);
  const localX = Math.sin(tilt / 2);
  const localW = Math.cos(tilt / 2);
  return [
    w * localX + x * localW,
    y * localW + z * localX,
    z * localW - y * localX,
    w * localW - x * localX,
  ];
}

function addRingSpecs(
  specs: ColliderSpec[],
  options: {
    id: string;
    label: string;
    body: ColliderBody;
    count: number;
    radius: number;
    y: number;
    halfExtents: [number, number, number];
    radialOffset?: number;
    tilt?: number;
  },
) {
  for (let index = 0; index < options.count; index += 1) {
    const angle = (index / options.count) * Math.PI * 2;
    specs.push({
      id: `${options.id}-${index}`,
      label: options.label,
      body: options.body,
      position: radialPosition(options.radius, angle, options.y),
      halfExtents: options.halfExtents,
      rotation: tiltedYQuaternion(
        angle + (options.radialOffset ?? 0),
        options.tilt ?? 0,
      ),
    });
  }
}

function buildColliderSpecs(): ColliderSpec[] {
  const specs: ColliderSpec[] = [];
  addRingSpecs(specs, {
    id: "bowl-transition-outer",
    label: "Bowl transition",
    body: "stationary",
    count: 48,
    radius: 2.3,
    y: 0.48,
    halfExtents: [0.15, 0.045, 0.1],
  });
  addRingSpecs(specs, {
    id: "bowl-transition-inner",
    label: "Bowl transition",
    body: "stationary",
    count: 48,
    radius: 2.05,
    y: 0.28,
    halfExtents: [0.14, 0.045, 0.1],
    tilt: -0.45,
  });
  addRingSpecs(specs, {
    id: "bowl-floor",
    label: "Bowl floor",
    body: "stationary",
    count: 48,
    radius: 1.86,
    y: 0.1,
    halfExtents: [0.13, 0.045, 0.12],
  });
  addRingSpecs(specs, {
    id: "track-floor",
    label: "Ball track",
    body: "stationary",
    count: 96,
    radius: 2.48,
    y: 0.61,
    halfExtents: [0.11, 0.045, 0.17],
  });
  addRingSpecs(specs, {
    id: "outer-rim",
    label: "Outer rim",
    body: "stationary",
    count: 96,
    radius: 2.7,
    y: 0.85,
    halfExtents: [0.12, 0.17, 0.1],
  });
  addRingSpecs(specs, {
    id: "track-inner-rail",
    label: "Track inner rail",
    body: "stationary",
    count: 64,
    radius: 2.2,
    y: 0.58,
    halfExtents: [0.13, 0.025, 0.055],
  });
  addRingSpecs(specs, {
    id: "deflector",
    label: "Deflector",
    body: "stationary",
    count: 8,
    radius: 2.33,
    y: 0.78,
    halfExtents: [0.16, 0.08, 0.1],
    radialOffset: Math.PI / 2 + 0.35,
  });
  addRingSpecs(specs, {
    id: "rotor-pocket-floor",
    label: "Pocket floor",
    body: "rotor",
    count: PHYSICS_LAB_SECTOR_COUNT,
    radius: 1.72,
    y: 0.15,
    halfExtents: [0.13, 0.055, 0.16],
  });
  addRingSpecs(specs, {
    id: "rotor-inner-wall",
    label: "Pocket inner wall",
    body: "rotor",
    count: PHYSICS_LAB_SECTOR_COUNT,
    radius: 1.42,
    y: 0.15,
    halfExtents: [0.13, 0.15, 0.045],
  });
  addRingSpecs(specs, {
    id: "rotor-outer-wall",
    label: "Pocket outer wall",
    body: "rotor",
    count: PHYSICS_LAB_SECTOR_COUNT,
    radius: 1.92,
    y: 0.16,
    halfExtents: [0.13, 0.025, 0.045],
  });
  addRingSpecs(specs, {
    id: "rotor-fret",
    label: "Pocket fret / separator",
    body: "rotor",
    count: PHYSICS_LAB_SECTOR_COUNT,
    radius: 1.73,
    y: 0.15,
    halfExtents: [0.35, 0.13, 0.022],
    radialOffset: -Math.PI / 2,
  });
  specs.push({
    id: "bowl-spindle-guard",
    label: "Bowl center spindle",
    body: "stationary",
    position: [0, 0.34, 0],
    halfExtents: [1.05, 0.34, 1.05],
    rotation: [0, 0, 0, 1],
  });
  specs.push({
    id: "bowl-center-floor",
    label: "Bowl center safety floor",
    body: "stationary",
    position: [0, -0.04, 0],
    halfExtents: [1.52, 0.05, 1.52],
    rotation: [0, 0, 0, 1],
  });
  return specs;
}

function addRapierCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  spec: ColliderSpec,
  friction: number,
  restitution: number,
) {
  const isDeflector = spec.label === "Deflector";
  const membership =
    spec.body === "rotor"
      ? ROTOR_COLLISION_GROUP
      : STATIONARY_COLLISION_GROUP;
  const filter =
    spec.body === "rotor"
      ? BALL_COLLISION_GROUP | ROTOR_COLLISION_GROUP
      : BALL_COLLISION_GROUP | STATIONARY_COLLISION_GROUP;
  const descriptor = RAPIER.ColliderDesc.cuboid(...spec.halfExtents)
    .setTranslation(...spec.position)
    .setRotation({
      x: spec.rotation[0],
      y: spec.rotation[1],
      z: spec.rotation[2],
      w: spec.rotation[3],
    })
    .setFriction(isDeflector ? 0.28 : friction)
    .setRestitution(isDeflector ? 0.42 : restitution)
    .setCollisionGroups(membership | (filter << 16));
  world.createCollider(descriptor, body);
}

function pocketIndexFromState(
  translation: { x: number; z: number },
  rotation: { y: number; w: number },
) {
  const worldAngle = Math.atan2(translation.x, translation.z);
  const rotorAngle = 2 * Math.atan2(rotation.y, rotation.w);
  const relativeAngle = normalizedAngle(worldAngle - rotorAngle);
  const index = Math.round(relativeAngle / SECTOR_STEP_RADIANS);
  return (
    (index % PHYSICS_LAB_SECTOR_COUNT) + PHYSICS_LAB_SECTOR_COUNT
  ) % PHYSICS_LAB_SECTOR_COUNT;
}

function vec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function quaternion(value: Quaternion): Quaternion {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function buildStartConditions(seed: string): PhysicsLabStartConditions {
  // Part 5's accepted release band is intentionally preserved. The secure
  // variation is applied inside that safe sector; the remaining initial
  // conditions are independently randomized from the same cryptographic seed.
  const safeSector = 13;
  const launchAzimuthRadians =
    (safeSector + 0.5) * SECTOR_STEP_RADIANS +
    0.0015 +
    hashToUnit(seed, 0) * 0.0018;
  const launchAngleDegrees = 4 + (hashToUnit(seed, 1) - 0.5) * 0.32;
  const launchSpeed = 4 + (hashToUnit(seed, 2) - 0.5) * 0.24;
  const ballSpin = 22.5 + (hashToUnit(seed, 3) - 0.5) * 4.2;
  const rotorInitialAngleRadians = hashToUnit(seed, 4) * Math.PI * 2;
  const rotorInitialAngularVelocity =
    2.8 + (hashToUnit(seed, 5) - 0.5) * 0.28;
  const position = radialPosition(
    2.455 + (hashToUnit(seed, 6) - 0.5) * 0.003,
    launchAzimuthRadians,
    0.962 + (hashToUnit(seed, 7) - 0.5) * 0.004,
  );
  const tangent: [number, number] = [
    Math.cos(launchAzimuthRadians),
    -Math.sin(launchAzimuthRadians),
  ];
  const radial: [number, number] = [
    Math.sin(launchAzimuthRadians),
    Math.cos(launchAzimuthRadians),
  ];
  const launchAngleRadians = (launchAngleDegrees * Math.PI) / 180;
  const inwardSpeed = launchSpeed * Math.sin(launchAngleRadians);
  const tangentSpeed = launchSpeed * Math.cos(launchAngleRadians);
  const velocity: [number, number, number] = [
    tangent[0] * -tangentSpeed - radial[0] * inwardSpeed,
    -0.12 - hashToUnit(seed, 8) * 0.05,
    tangent[1] * -tangentSpeed - radial[1] * inwardSpeed,
  ];
  return {
    seed,
    launchAzimuthRadians,
    launchAngleDegrees,
    launchSpeed,
    ballSpin,
    rotorInitialAngleRadians,
    rotorInitialAngularVelocity,
    ballPosition: position,
    ballVelocity: velocity,
    ballSpinAxis: [radial[1], 0, -radial[0]],
  };
}

function event(
  type: PhysicsLabEvent["type"],
  step: number,
  data: Partial<PhysicsLabEvent> = {},
): PhysicsLabEvent {
  return {
    type,
    step,
    simulatedAtMs: Math.round(step * PHYSICS_LAB_FIXED_TIMESTEP * 1000),
    ...data,
  };
}

export async function simulatePhysicsLabRound(
  roundId: string,
  seed = randomBytes(32).toString("hex"),
): Promise<PhysicsLabSimulationResult> {
  await initRapier();
  const startedAt = performance.now();
  const startConditions = buildStartConditions(seed);
  const events: PhysicsLabEvent[] = [];
  const trajectory: PhysicsLabTrajectorySample[] = [];
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_LAB_FIXED_TIMESTEP;
  world.maxCcdSubsteps = 8;

  const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rotorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setGravityScale(0)
      .setAngvel({ x: 0, y: startConditions.rotorInitialAngularVelocity, z: 0 })
      .setAdditionalMass(ROTOR_PARAMETERS.mass)
      .setAngularDamping(ROTOR_PARAMETERS.angularDamping)
      .setCanSleep(false)
      .enabledTranslations(false, false, false)
      .enabledRotations(false, true, false),
  );
  rotorBody.setRotation(
    {
      x: 0,
      y: Math.sin(startConditions.rotorInitialAngleRadians / 2),
      z: 0,
      w: Math.cos(startConditions.rotorInitialAngleRadians / 2),
    },
    true,
  );
  const specs = buildColliderSpecs();
  for (const spec of specs) {
    addRapierCollider(
      world,
      spec.body === "rotor" ? rotorBody : stationaryBody,
      spec,
      spec.body === "rotor" ? 0.4 : 0.72,
      spec.body === "rotor" ? 0.18 : 0.22,
    );
  }
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...startConditions.ballPosition)
      .setLinvel(...startConditions.ballVelocity)
      .setAdditionalMass(BALL_PARAMETERS.mass)
      .setLinearDamping(BALL_PARAMETERS.linearDamping)
      .setAngularDamping(BALL_PARAMETERS.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(Math.max(BALL_PARAMETERS.radius * 2.2, 0.08)),
  );
  ballBody.enableCcd(true);
  ballBody.setSoftCcdPrediction(Math.max(BALL_PARAMETERS.radius * 2.2, 0.08));
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_PARAMETERS.radius)
      .setFriction(BALL_PARAMETERS.friction)
      .setRestitution(BALL_PARAMETERS.restitution)
      .setDensity(0.001),
    ballBody,
  );
  ballBody.setAngvel(
    {
      x: startConditions.ballSpinAxis[0] * startConditions.ballSpin,
      y: 0,
      z: startConditions.ballSpinAxis[2] * startConditions.ballSpin,
    },
    true,
  );

  let outerTrackEntered = false;
  let energyLossObserved = false;
  let inwardMovementObserved = false;
  let deflectorHit = false;
  let movingFretContact = false;
  let pocketInteraction = false;
  let previousPocketIndex: number | null = null;
  let previousBallSpeed = Math.hypot(...startConditions.ballVelocity);
  let previousRotorSpeed = Math.abs(rotorBody.angvel().y);
  let previousRadialVelocity = 0;
  let previousVerticalVelocity = startConditions.ballVelocity[1];
  let minRadius = Number.POSITIVE_INFINITY;
  let maxRadius = 0;
  let stableFrames = 0;
  let completed = false;
  let finalPocketIndex: number | null = null;
  let stableSettleStep: number | null = null;
  let errorCode: string | null = null;
  let maxBallSpeed = 0;

  try {
    const durationLimitSteps = Math.round(
      PHYSICS_LAB_DURATION_LIMIT_SECONDS / PHYSICS_LAB_FIXED_TIMESTEP,
    );
    for (let step = 0; step < durationLimitSteps; step += 1) {
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const rotation = ballBody.rotation();
      const angularVelocity = ballBody.angvel();
      const rotorRotation = rotorBody.rotation();
      const rotorVelocity = rotorBody.angvel();
      const ballSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const ballAngularSpeed = Math.hypot(
        angularVelocity.x,
        angularVelocity.y,
        angularVelocity.z,
      );
      const rotorSpeed = Math.abs(rotorVelocity.y);
      const radius = Math.hypot(translation.x, translation.z);
      const radialVelocity =
        radius > 0
          ? (translation.x * velocity.x + translation.z * velocity.z) / radius
          : 0;
      const finiteState = [
        translation.x,
        translation.y,
        translation.z,
        velocity.x,
        velocity.y,
        velocity.z,
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
        ballSpeed,
        ballAngularSpeed,
        rotorSpeed,
      ].every(Number.isFinite);
      if (!finiteState) {
        errorCode = "NAN_STATE";
        events.push(event("INVALID", step, { detail: errorCode }));
        break;
      }
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      maxBallSpeed = Math.max(maxBallSpeed, ballSpeed);
      if (
        radius > 3.18 ||
        translation.y < -0.82 ||
        translation.y > 2.8
      ) {
        errorCode = "GEOMETRY_ESCAPE";
        events.push(event("INVALID", step, { detail: errorCode }));
        break;
      }
      if (ballSpeed > Math.max(16, 4 * 4 + 4)) {
        errorCode = "VELOCITY_EXPLOSION";
        events.push(event("INVALID", step, { detail: errorCode }));
        break;
      }
      if (
        !outerTrackEntered &&
        radius > 2.32 &&
        radius < 2.66 &&
        translation.y > 0.52
      ) {
        outerTrackEntered = true;
        events.push(event("TRACK_ENTRY", step));
      }
      if (
        outerTrackEntered &&
        !energyLossObserved &&
        ballSpeed < Math.hypot(...startConditions.ballVelocity) * 0.72
      ) {
        energyLossObserved = true;
        events.push(event("ENERGY_LOSS", step));
      }
      if (
        !inwardMovementObserved &&
        minRadius < 2.24 &&
        maxRadius - minRadius > 0.12
      ) {
        inwardMovementObserved = true;
        events.push(event("NATURAL_INWARD_EXIT", step));
      }
      if (
        !deflectorHit &&
        radius > 2.18 &&
        radius < 2.48 &&
        translation.y > 0.62 &&
        translation.y < 1.1 &&
        Math.abs(radialVelocity - previousRadialVelocity) > 0.035 &&
        ballSpeed > 0.22
      ) {
        deflectorHit = true;
        events.push(event("DEFLECTOR_IMPACT", step));
      }
      if (
        !movingFretContact &&
        radius > 1.35 &&
        radius < 2.2 &&
        rotorSpeed > 0.08 &&
        (Math.abs(ballSpeed - previousBallSpeed) > 0.01 ||
          Math.abs(rotorSpeed - previousRotorSpeed) > 0.0002)
      ) {
        movingFretContact = true;
        events.push(event("MOVING_FRET_CONTACT", step));
      }

      const captureTrajectorySample = () => {
        trajectory.push({
          step,
          simulatedAtMs: Math.round(
            step * PHYSICS_LAB_FIXED_TIMESTEP * 1000,
          ),
          ball: {
            position: vec3(translation),
            orientation: quaternion(rotation),
            linearVelocity: vec3(velocity),
            angularVelocity: vec3(angularVelocity),
          },
          rotor: {
            orientation: quaternion(rotorRotation),
            angularVelocity: vec3(rotorVelocity),
          },
        });
      };
      const sampledThisStep = step % TRAJECTORY_SAMPLE_EVERY_STEPS === 0;
      if (sampledThisStep) captureTrajectorySample();

      const pocketIndex =
        radius > 1.18 && radius < 1.98
          ? pocketIndexFromState(translation, rotation)
          : null;
      if (pocketIndex !== null && ballSpeed > 0.08) {
        pocketInteraction = true;
        if (previousPocketIndex === null) {
          events.push(event("POCKET_ENTRY", step, { pocketIndex }));
        } else if (previousPocketIndex !== pocketIndex) {
          events.push(event("POCKET_CHANGE", step, { pocketIndex }));
        }
        previousPocketIndex = pocketIndex;
      }
      if (
        radius < 1.98 &&
        previousVerticalVelocity < -0.12 &&
        velocity.y > 0.08
      ) {
        events.push(event("POCKET_BOUNCE", step, { pocketIndex: previousPocketIndex ?? undefined }));
      }
      if (
        ballSpeed < 0.18 &&
        ballAngularSpeed < 5 &&
        radius > 1.18 &&
        radius < 1.98 &&
        translation.y > -0.42 &&
        translation.y < 1.3 &&
        previousPocketIndex !== null
      ) {
        stableFrames += 1;
        if (stableFrames >= PHYSICS_LAB_STABLE_WINDOW_FRAMES && !completed) {
          completed = true;
          stableSettleStep = step;
          finalPocketIndex = previousPocketIndex;
          events.push(
            event("STABLE_SETTLE", step, {
              pocketIndex: finalPocketIndex,
              pocketNumber:
                finalPocketIndex === null
                  ? undefined
                  : PHYSICS_LAB_EUROPEAN_SEQUENCE[finalPocketIndex],
            }),
          );
          if (!sampledThisStep) captureTrajectorySample();
          break;
        }
      } else {
        stableFrames = 0;
      }
      previousBallSpeed = ballSpeed;
      previousRotorSpeed = rotorSpeed;
      previousRadialVelocity = radialVelocity;
      previousVerticalVelocity = velocity.y;
    }
  } catch (error) {
    errorCode = error instanceof Error ? "SIMULATION_EXCEPTION" : "SIMULATION_FAILED";
    events.push(event("INVALID", 0, { detail: errorCode }));
  } finally {
    world.removeRigidBody(ballBody);
    world.removeRigidBody(rotorBody);
    world.free();
  }

  if (!completed && !errorCode) {
    errorCode =
      !outerTrackEntered
        ? "TRACK_ENTRY_TIMEOUT"
        : !inwardMovementObserved
          ? "INWARD_DROP_TIMEOUT"
          : !deflectorHit
            ? "DEFLECTOR_TIMEOUT"
            : !movingFretContact
              ? "MOVING_FRET_TIMEOUT"
              : !pocketInteraction
                ? "POCKET_TIMEOUT"
                : "STABLE_SETTLE_TIMEOUT";
    events.push(event("INVALID", trajectory.at(-1)?.step ?? 0, { detail: errorCode }));
  }
  const simulationDurationMs = Math.round(performance.now() - startedAt);
  const trajectoryHash = createHash("sha256")
    .update(JSON.stringify({ roundId, startConditions, trajectory, events }))
    .digest("hex");
  return {
    status: completed ? "SETTLED" : "INVALID",
    errorCode: completed ? null : errorCode,
    finalPocketIndex: completed ? finalPocketIndex : null,
    finalPocketNumber:
      completed && finalPocketIndex !== null
        ? PHYSICS_LAB_EUROPEAN_SEQUENCE[finalPocketIndex]
        : null,
    stableSettleStep,
    simulationDurationMs,
    computedAt: new Date().toISOString(),
    startConditions,
    trajectory: trajectory.slice(0, MAX_TRAJECTORY_SAMPLES),
    events,
    trajectoryHash,
  };
}