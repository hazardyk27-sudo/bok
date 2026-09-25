import { createHash, randomBytes } from "node:crypto";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  ROULETTE_BALL_RADIUS,
  ROULETTE_DARK_RACE_CHANNEL_PROFILE,
  ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
  ROULETTE_DARK_RACE_RADIUS_BAND,
  ROULETTE_DARK_RACE_LAUNCH_RADIUS,
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_FIXED_TIMESTEP,
  ROULETTE_GRAVITY_Y,
  ROULETTE_MAX_CCD_SUBSTEPS,
  ROULETTE_POCKET_COUNT,
  ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
  ROULETTE_POCKET_FLOOR_Y,
  ROULETTE_POCKET_OUTER_LIP_RADIUS,
  ROULETTE_POCKET_OUTER_LIP_Y,
  ROULETTE_ROTOR_ANGULAR_SPEED,
  ROULETTE_WORLD_UNITS_PER_METER,
} from "../../../../lib/roulette-physics-config";

export const PHYSICS_LAB_FIXED_TIMESTEP = ROULETTE_FIXED_TIMESTEP;
export const PHYSICS_LAB_DURATION_LIMIT_SECONDS = 24;
export const PHYSICS_LAB_STABLE_WINDOW_FRAMES = Math.round(
  0.5 / PHYSICS_LAB_FIXED_TIMESTEP,
);
export const PHYSICS_LAB_SECTOR_COUNT = ROULETTE_POCKET_COUNT;
export const PHYSICS_LAB_BALL_RADIUS = ROULETTE_BALL_RADIUS;
export const PHYSICS_LAB_EUROPEAN_SEQUENCE = ROULETTE_EUROPEAN_SEQUENCE;

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
  mass: 0.0027,
  friction: 0.028,
  restitution: 0.01,
  linearDamping: 0.01,
  angularDamping: 0.01,
  initialAngularVelocity: 22,
} as const;

type Vec3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };
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

function deterministicUnit(seed: string, salt: number) {
  const numericSeed = Number(seed);
  if (
    Number.isInteger(numericSeed) &&
    numericSeed >= 0 &&
    numericSeed <= 0xffff_ffff
  ) {
    let value =
      (numericSeed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
  }

  const digest = createHash("sha256")
    .update(`${seed}:${salt}`)
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

function darkRaceSurfaceYAt(radius: number) {
  const profile = ROULETTE_DARK_RACE_CHANNEL_PROFILE;
  if (radius <= profile[0][0]) return profile[0][1];
  if (radius >= profile[profile.length - 1][0]) {
    return profile[profile.length - 1][1];
  }
  for (let index = 1; index < profile.length; index += 1) {
    const [rightRadius, rightY] = profile[index];
    const [leftRadius, leftY] = profile[index - 1];
    if (radius <= rightRadius) {
      const alpha =
        (radius - leftRadius) / Math.max(1e-9, rightRadius - leftRadius);
      return leftY + (rightY - leftY) * alpha;
    }
  }
  return profile[profile.length - 1][1];
}

function darkRaceSurfaceSlopeAt(radius: number) {
  const profile = ROULETTE_DARK_RACE_CHANNEL_PROFILE;
  for (let index = 1; index < profile.length; index += 1) {
    const [rightRadius, rightY] = profile[index];
    const [leftRadius, leftY] = profile[index - 1];
    if (radius <= rightRadius) {
      return (rightY - leftY) / Math.max(1e-9, rightRadius - leftRadius);
    }
  }
  const last = profile[profile.length - 1];
  const previous = profile[profile.length - 2];
  return (last[1] - previous[1]) / Math.max(1e-9, last[0] - previous[0]);
}

function addDarkRaceChannelCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const openInnerRadius =
    ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS + PHYSICS_LAB_BALL_RADIUS;
  const profile: Array<[number, number]> = [
    [openInnerRadius, darkRaceSurfaceYAt(openInnerRadius)],
    ...ROULETTE_DARK_RACE_CHANNEL_PROFILE
      .filter(
        ([radius]) =>
          radius > openInnerRadius &&
          radius <= ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
      )
      .map(([radius, y]) => [radius, y] as [number, number]),
  ];
  const segments = 512;
  const thickness = 0.12;
  const vertices: number[] = [];
  const indices: number[] = [];

  const appendProfile = (rows: readonly (readonly [number, number])[]) => {
    for (const [radius, y] of rows) {
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        vertices.push(
          Math.sin(angle) * radius,
          y,
          Math.cos(angle) * radius,
        );
      }
    }
  };

  appendProfile(profile);
  const bottomOffset = profile.length * segments;
  appendProfile(profile.map(([radius, y]) => [radius, y - thickness] as [number, number]));

  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const topA = row * segments + segment;
      const topB = row * segments + next;
      const topC = (row + 1) * segments + next;
      const topD = (row + 1) * segments + segment;
      indices.push(topA, topD, topB, topB, topD, topC);

      const bottomA = bottomOffset + topA;
      const bottomB = bottomOffset + topB;
      const bottomC = bottomOffset + topC;
      const bottomD = bottomOffset + topD;
      indices.push(bottomA, bottomB, bottomD, bottomB, bottomC, bottomD);
    }
  }

  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
    )
      .setFriction(BALL_PARAMETERS.friction)
      .setRestitution(BALL_PARAMETERS.restitution),
    body,
  );
}

function addDarkRaceOuterWallCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const segments = 512;
  const innerFaceRadius = ROULETTE_DARK_RACE_WOOD_INNER_RADIUS;
  const lowerY =
    darkRaceSurfaceYAt(innerFaceRadius) -
    PHYSICS_LAB_BALL_RADIUS * 2 -
    0.02;
  // Browser full-spin measures the visible GLB outer wall up to y=0.
  // Match that validated measured top so the 512-segment wall uses the
  // same triangle diagonals/contact features in server Rapier.
  const measuredWallTopY = 0;
  const upperY = Math.max(
    measuredWallTopY + PHYSICS_LAB_BALL_RADIUS + 0.1,
    lowerY + 0.24,
  );
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const y of [lowerY, upperY]) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      vertices.push(
        Math.sin(angle) * innerFaceRadius,
        y,
        Math.cos(angle) * innerFaceRadius,
      );
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    const lowerA = segment;
    const lowerB = next;
    const upperA = segments + segment;
    const upperB = segments + next;
    indices.push(
      lowerA,
      upperB,
      lowerB,
      lowerA,
      upperA,
      upperB,
    );
  }

  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
    )
      .setFriction(Math.min(BALL_PARAMETERS.friction, 0.01))
      .setRestitution(0.01)
      .setCollisionGroups(
        STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      ),
    body,
  );
}

function addBowlBridgeCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const innerRadius = ROULETTE_POCKET_OUTER_LIP_RADIUS;
  const outerRadius =
    ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS + PHYSICS_LAB_BALL_RADIUS;
  const sampleCount = 9;
  const segments = 128;
  const thickness = 0.08;
  const outerY = darkRaceSurfaceYAt(outerRadius);
  const innerY = Math.min(
    ROULETTE_POCKET_OUTER_LIP_Y,
    outerY - PHYSICS_LAB_BALL_RADIUS * 0.75,
  );
  const profile: Array<[number, number]> = Array.from(
    { length: sampleCount },
    (_, index) => {
      const alpha = index / (sampleCount - 1);
      return [
        innerRadius + (outerRadius - innerRadius) * alpha,
        innerY + (outerY - innerY) * alpha,
      ];
    },
  );
  const vertices: number[] = [];
  const indices: number[] = [];

  const appendProfile = (rows: readonly (readonly [number, number])[]) => {
    for (const [radius, y] of rows) {
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        vertices.push(
          Math.sin(angle) * radius,
          y,
          Math.cos(angle) * radius,
        );
      }
    }
  };

  appendProfile(profile);
  const bottomOffset = profile.length * segments;
  appendProfile(
    profile.map(([radius, y]) => [radius, y - thickness] as [number, number]),
  );

  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const topA = row * segments + segment;
      const topB = row * segments + next;
      const topC = (row + 1) * segments + next;
      const topD = (row + 1) * segments + segment;
      indices.push(topA, topD, topB, topB, topD, topC);

      const bottomA = bottomOffset + topA;
      const bottomB = bottomOffset + topB;
      const bottomC = bottomOffset + topC;
      const bottomD = bottomOffset + topD;
      indices.push(bottomA, bottomB, bottomD, bottomB, bottomC, bottomD);
    }
  }

  for (const row of [0, profile.length - 1]) {
    const bottomRow = bottomOffset + row * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const topA = row * segments + segment;
      const topB = row * segments + next;
      const bottomA = bottomRow + segment;
      const bottomB = bottomRow + next;
      indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
    }
  }

  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
    )
      .setFriction(BALL_PARAMETERS.friction)
      .setRestitution(BALL_PARAMETERS.restitution)
      .setCollisionGroups(
        STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      ),
    body,
  );
}

function addPocketFloorAndOuterLipColliders(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const colliders: RAPIER.Collider[] = [];
  const floorThickness = 0.06;
  const lipSegments = 74;
  const bridgeOuterRadius =
    ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS + PHYSICS_LAB_BALL_RADIUS;
  const bridgeOuterY = darkRaceSurfaceYAt(bridgeOuterRadius);
  const outerLipY = Math.min(
    ROULETTE_POCKET_OUTER_LIP_Y,
    bridgeOuterY - PHYSICS_LAB_BALL_RADIUS * 0.75,
  );

  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(
        floorThickness / 2,
        ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
      )
        .setTranslation(
          0,
          ROULETTE_POCKET_FLOOR_Y - floorThickness / 2,
          0,
        )
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(
          ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
        ),
      body,
    ),
  );

  const vertices: number[] = [];
  const indices: number[] = [];
  const profile: Array<[number, number]> = [
    [ROULETTE_POCKET_FLOOR_OUTER_RADIUS, ROULETTE_POCKET_FLOOR_Y],
    [ROULETTE_POCKET_OUTER_LIP_RADIUS, outerLipY],
  ];

  for (const [radius, y] of profile) {
    for (let segment = 0; segment < lipSegments; segment += 1) {
      const angle = (segment / lipSegments) * Math.PI * 2;
      vertices.push(
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius,
      );
    }
  }

  for (let segment = 0; segment < lipSegments; segment += 1) {
    const next = (segment + 1) % lipSegments;
    const innerA = segment;
    const outerA = lipSegments + segment;
    const outerB = lipSegments + next;
    const innerB = next;
    indices.push(innerA, outerA, outerB, innerA, outerB, innerB);
  }

  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(vertices),
        new Uint32Array(indices),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
      )
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(
          ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
        ),
      body,
    ),
  );

  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(
        0.04,
        ROULETTE_POCKET_FLOOR_OUTER_RADIUS + 0.06,
      )
        .setTranslation(
          0,
          ROULETTE_POCKET_FLOOR_Y - PHYSICS_LAB_BALL_RADIUS - 0.04,
          0,
        )
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(
          ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
        ),
      body,
    ),
  );

  return colliders;
}

function addPocketFretColliders(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const pocketFloorInnerRadius = 1.48;
  const innerEdgeRadius =
    pocketFloorInnerRadius + PHYSICS_LAB_BALL_RADIUS * 2 + 0.0206689453125;
  const outerEdgeRadius = ROULETTE_POCKET_FLOOR_OUTER_RADIUS - 0.02;
  const centerRadius = (innerEdgeRadius + outerEdgeRadius) / 2;
  const tangentialHalfExtent = 0.03;
  const radialHalfExtent = (outerEdgeRadius - innerEdgeRadius) / 2;
  const verticalHalfExtent = 0.11;
  const edgeRounding = 0.005;
  const centerY =
    ROULETTE_POCKET_FLOOR_Y + verticalHalfExtent + 0.022;
  const colliders: RAPIER.Collider[] = [];

  for (let index = 0; index < PHYSICS_LAB_SECTOR_COUNT; index += 1) {
    const angle = (index + 0.5) * SECTOR_STEP_RADIANS;
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.roundCuboid(
          tangentialHalfExtent - edgeRounding,
          verticalHalfExtent - edgeRounding,
          radialHalfExtent - edgeRounding,
          edgeRounding,
        )
          .setTranslation(...radialPosition(centerRadius, angle, centerY))
          .setRotation({
            x: 0,
            y: Math.sin(angle / 2),
            z: 0,
            w: Math.cos(angle / 2),
          })
          .setFriction(0.42)
          .setRestitution(0.02)
          .setCollisionGroups(
            ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
          ),
        body,
      ),
    );
  }

  return colliders;
}

function addPocketInnerGuardCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const pocketFloorInnerRadius = 1.48;
  const verticalHalfHeight = 0.11;
  const centerY = ROULETTE_POCKET_FLOOR_Y + verticalHalfHeight;

  const edgeRounding = 0.02;

  return world.createCollider(
    RAPIER.ColliderDesc.roundCylinder(
      verticalHalfHeight - edgeRounding,
      pocketFloorInnerRadius - edgeRounding,
      edgeRounding,
    )
      .setTranslation(0, centerY, 0)
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(
        ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      ),
    body,
  );
}

function addMeasuredDeflectorColliders(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const descriptors = [
    { angleDegrees: 22.501, innerRadius: 2.1638333333333333, outerRadius: 2.2665, bottomY: -0.3740904798673158, topY: -0.3341760459978076, angularWidth: 0.13962634015954636 },
    { angleDegrees: 67.499, innerRadius: 2.0611666666666664, outerRadius: 2.3435, bottomY: -0.38207411055479956, topY: -0.33297679580798023, angularWidth: 0.06981317007977318 },
    { angleDegrees: 112.501, innerRadius: 2.1638333333333333, outerRadius: 2.2665, bottomY: -0.3740904798673158, topY: -0.3341760459978076, angularWidth: 0.13962634015954636 },
    { angleDegrees: 157.499, innerRadius: 2.0611666666666664, outerRadius: 2.3435, bottomY: -0.38207411055479956, topY: -0.33297679580798023, angularWidth: 0.06981317007977318 },
    { angleDegrees: 202.501, innerRadius: 2.1638333333333333, outerRadius: 2.2665, bottomY: -0.3740904798673158, topY: -0.3341760459978076, angularWidth: 0.13962634015954636 },
    { angleDegrees: 247.499, innerRadius: 2.0611666666666664, outerRadius: 2.3435, bottomY: -0.38207411055479956, topY: -0.33297679580798056, angularWidth: 0.06981317007977318 },
    { angleDegrees: 292.501, innerRadius: 2.1638333333333333, outerRadius: 2.2665, bottomY: -0.3740904798673158, topY: -0.33417604599780726, angularWidth: 0.13962634015954636 },
    { angleDegrees: 337.499, innerRadius: 2.0611666666666664, outerRadius: 2.3435, bottomY: -0.38207411055479956, topY: -0.33297679580798056, angularWidth: 0.06981317007977318 },
  ] as const;
  const colliders: RAPIER.Collider[] = [];

  for (const descriptor of descriptors) {
    const effectiveOuterRadius = Math.min(
      descriptor.outerRadius,
      ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
    );
    const effectiveInnerRadius = Math.min(
      descriptor.innerRadius,
      effectiveOuterRadius - PHYSICS_LAB_BALL_RADIUS * 0.5,
    );
    const centerRadius = (effectiveInnerRadius + effectiveOuterRadius) / 2;
    const halfRadialDepth = Math.max(
      PHYSICS_LAB_BALL_RADIUS * 0.25,
      (effectiveOuterRadius - effectiveInnerRadius) / 2,
    );
    const halfHeight = Math.max(
      0.02,
      (descriptor.topY - descriptor.bottomY) / 2,
    );
    const centerY = (descriptor.bottomY + descriptor.topY) / 2;
    const halfTangentialWidth = Math.min(
      0.22,
      Math.max(
        PHYSICS_LAB_BALL_RADIUS * 0.9,
        centerRadius * descriptor.angularWidth * 0.5,
      ),
    );
    const angle = (descriptor.angleDegrees * Math.PI) / 180;
    const vertices = new Float32Array([
      -halfTangentialWidth, -halfHeight, -halfRadialDepth,
       halfTangentialWidth, -halfHeight, -halfRadialDepth,
       halfTangentialWidth,  halfHeight, -halfRadialDepth,
      -halfTangentialWidth,  halfHeight, -halfRadialDepth,
      -halfTangentialWidth, -halfHeight,  halfRadialDepth,
       halfTangentialWidth, -halfHeight,  halfRadialDepth,
       halfTangentialWidth,  halfHeight,  halfRadialDepth,
      -halfTangentialWidth,  halfHeight,  halfRadialDepth,
    ]);
    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ]);

    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          vertices,
          indices,
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setTranslation(
            Math.sin(angle) * centerRadius,
            centerY,
            Math.cos(angle) * centerRadius,
          )
          .setRotation({
            x: 0,
            y: Math.sin(angle / 2),
            z: 0,
            w: Math.cos(angle / 2),
          })
          .setFriction(0.28)
          .setRestitution(0.16)
          .setCollisionGroups(
            STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
          ),
        body,
      ),
    );
  }

  return colliders;
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
  const launchAzimuthRadians =
    deterministicUnit(seed, 2) * Math.PI * 2;
  const launchAngleDegrees = 0;
  const launchSpeedMetersPerSecond =
    5 + (deterministicUnit(seed, 1) * 2 - 1) * 0.15;
  const launchSpeed =
    launchSpeedMetersPerSecond * ROULETTE_WORLD_UNITS_PER_METER;
  const ballSpin = launchSpeed / PHYSICS_LAB_BALL_RADIUS;
  const rotorInitialAngleRadians =
    deterministicUnit(seed, 3) * Math.PI * 2;
  const rotorInitialAngularVelocity = ROULETTE_ROTOR_ANGULAR_SPEED;
  const launchClearance = PHYSICS_LAB_BALL_RADIUS + 0.01;
  const operationalLaunchCenterRadius = ROULETTE_DARK_RACE_LAUNCH_RADIUS;
  let launchContactRadius = operationalLaunchCenterRadius;
  let launchPlacementSlope = darkRaceSurfaceSlopeAt(launchContactRadius);
  let launchPlacementNormalLength = Math.hypot(launchPlacementSlope, 1);
  let launchPlacementNormal: [number, number, number] = [
    (-launchPlacementSlope * Math.sin(launchAzimuthRadians)) /
      launchPlacementNormalLength,
    1 / launchPlacementNormalLength,
    (-launchPlacementSlope * Math.cos(launchAzimuthRadians)) /
      launchPlacementNormalLength,
  ];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const radialNormal =
      launchPlacementNormal[0] * Math.sin(launchAzimuthRadians) +
      launchPlacementNormal[2] * Math.cos(launchAzimuthRadians);
    launchContactRadius =
      operationalLaunchCenterRadius - radialNormal * launchClearance;
    launchPlacementSlope = darkRaceSurfaceSlopeAt(launchContactRadius);
    launchPlacementNormalLength = Math.hypot(launchPlacementSlope, 1);
    launchPlacementNormal = [
      (-launchPlacementSlope * Math.sin(launchAzimuthRadians)) /
        launchPlacementNormalLength,
      1 / launchPlacementNormalLength,
      (-launchPlacementSlope * Math.cos(launchAzimuthRadians)) /
        launchPlacementNormalLength,
    ];
  }
  const launchSurfaceY = darkRaceSurfaceYAt(launchContactRadius);
  const position: [number, number, number] = [
    Math.sin(launchAzimuthRadians) * launchContactRadius +
      launchPlacementNormal[0] * launchClearance,
    launchSurfaceY + launchPlacementNormal[1] * launchClearance,
    Math.cos(launchAzimuthRadians) * launchContactRadius +
      launchPlacementNormal[2] * launchClearance,
  ];
  const tangent: [number, number] = [
    Math.cos(launchAzimuthRadians),
    -Math.sin(launchAzimuthRadians),
  ];
  const velocity: [number, number, number] = [
    tangent[0] * launchSpeed,
    0,
    tangent[1] * launchSpeed,
  ];
  const angularVelocity: [number, number, number] = [
    (launchPlacementNormal[1] * velocity[2] -
      launchPlacementNormal[2] * velocity[1]) /
      PHYSICS_LAB_BALL_RADIUS,
    (launchPlacementNormal[2] * velocity[0] -
      launchPlacementNormal[0] * velocity[2]) /
      PHYSICS_LAB_BALL_RADIUS,
    (launchPlacementNormal[0] * velocity[1] -
      launchPlacementNormal[1] * velocity[0]) /
      PHYSICS_LAB_BALL_RADIUS,
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
    ballSpinAxis: angularVelocity.map((value) => value / ballSpin) as [
      number,
      number,
      number,
    ],
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
  const world = new RAPIER.World({ x: 0, y: ROULETTE_GRAVITY_Y, z: 0 });
  world.timestep = PHYSICS_LAB_FIXED_TIMESTEP;
  world.maxCcdSubsteps = ROULETTE_MAX_CCD_SUBSTEPS;

  const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rotorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, 0, 0),
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
  const colliderRoles = new Map<number, string>();
  const darkRaceCollider = addDarkRaceChannelCollider(world, stationaryBody);
  colliderRoles.set(darkRaceCollider.handle, "dark-race");
  const darkRaceOuterWallCollider = addDarkRaceOuterWallCollider(
    world,
    stationaryBody,
  );
  colliderRoles.set(darkRaceOuterWallCollider.handle, "dark-race-outer-wall");
  const bowlBridgeCollider = addBowlBridgeCollider(world, stationaryBody);
  colliderRoles.set(bowlBridgeCollider.handle, "bowl-bridge");
  const deflectorColliders = addMeasuredDeflectorColliders(
    world,
    stationaryBody,
  );
  const deflectorColliderHandles = new Set(
    deflectorColliders.map((collider) => collider.handle),
  );
  for (const collider of deflectorColliders) {
    colliderRoles.set(collider.handle, "deflector");
  }
  const pocketColliders = addPocketFloorAndOuterLipColliders(
    world,
    rotorBody,
  );
  if (pocketColliders[0]) colliderRoles.set(pocketColliders[0].handle, "pocket-floor");
  if (pocketColliders[1]) colliderRoles.set(pocketColliders[1].handle, "pocket-outer-lip");
  if (pocketColliders[2]) colliderRoles.set(pocketColliders[2].handle, "pocket-catch-underlay");
  const fretColliders = addPocketFretColliders(world, rotorBody);
  const fretColliderHandles = new Set(
    fretColliders.map((collider) => collider.handle),
  );
  for (const collider of fretColliders) {
    colliderRoles.set(collider.handle, "pocket-fret");
  }
  const innerGuardCollider = addPocketInnerGuardCollider(world, rotorBody);
  colliderRoles.set(innerGuardCollider.handle, "pocket-inner-guard");
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...startConditions.ballPosition)
      .setLinvel(0, 0, 0)
      .setAngvel({ x: 0, y: 0, z: 0 })
      .setAdditionalMass(BALL_PARAMETERS.mass)
      .setLinearDamping(BALL_PARAMETERS.linearDamping)
      .setAngularDamping(BALL_PARAMETERS.angularDamping)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(0),
  );
  ballBody.enableCcd(true);
  ballBody.setSoftCcdPrediction(0);
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_PARAMETERS.radius)
      .setFriction(BALL_PARAMETERS.friction)
      .setRestitution(BALL_PARAMETERS.restitution)
      .setDensity(0.001)
      .setCollisionGroups(
        BALL_COLLISION_GROUP |
          ((STATIONARY_COLLISION_GROUP | ROTOR_COLLISION_GROUP) << 16),
      ),
    ballBody,
  );
  rotorBody.setNextKinematicRotation({
    x: 0,
    y: Math.sin(startConditions.rotorInitialAngleRadians / 2),
    z: 0,
    w: Math.cos(startConditions.rotorInitialAngleRadians / 2),
  });
  world.step();

  ballBody.setTranslation(
    {
      x: startConditions.ballPosition[0],
      y: startConditions.ballPosition[1],
      z: startConditions.ballPosition[2],
    },
    true,
  );
  ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  ballBody.setLinvel(
    {
      x: startConditions.ballVelocity[0],
      y: startConditions.ballVelocity[1],
      z: startConditions.ballVelocity[2],
    },
    true,
  );
  ballBody.setAngvel(
    {
      x: startConditions.ballSpinAxis[0] * startConditions.ballSpin,
      y: startConditions.ballSpinAxis[1] * startConditions.ballSpin,
      z: startConditions.ballSpinAxis[2] * startConditions.ballSpin,
    },
    true,
  );
  ballBody.wakeUp();

  let outerTrackEntered = false;
  let energyLossObserved = false;
  let inwardMovementObserved = false;
  let deflectorHit = false;
  let movingFretContact = false;
  let pocketInteraction = false;
  let previousPocketIndex: number | null = null;
  let previousBallSpeed = Math.hypot(...startConditions.ballVelocity);
  let previousRotorSpeed = Math.abs(startConditions.rotorInitialAngularVelocity);
  let rotorAngle = startConditions.rotorInitialAngleRadians;
  let previousRadialVelocity = 0;
  let previousVerticalVelocity = startConditions.ballVelocity[1];
  let previousVelocity: Vec3 = {
    x: startConditions.ballVelocity[0],
    y: startConditions.ballVelocity[1],
    z: startConditions.ballVelocity[2],
  };
  let minRadius = Number.POSITIVE_INFINITY;
  let maxRadius = 0;
  let stableFrames = 0;
  let completed = false;
  let finalPocketIndex: number | null = null;
  let stableSettleStep: number | null = null;
  let errorCode: string | null = null;
  let maxBallSpeed = 0;

  const preFretTraceSeed =
    seed === "61004" || seed === "61005" || seed === "61006";
  const preFretCheckpoints = new Set<string>();
  let preFretTrackContactObserved = false;
  let preInwardTrackAngle: number | null = null;
  let preInwardTrackAngleStart: number | null = null;
  let preInwardCompletedLaps = 0;
  const logPreFretCheckpoint = (
    checkpoint:
      | "INWARD_DESCENT"
      | "DEFLECTOR_CONTACT"
      | "ROTOR_ENTRY"
      | "POCKET_ENTRY"
      | "PHYSICAL_FRET_CONTACT",
    step: number,
    translation: Vec3,
    velocity: Vec3,
    ballSpeed: number,
    radius: number,
    rotorRotation: Quaternion,
    contactRoles: Set<string>,
  ) => {
    if (!preFretTraceSeed || preFretCheckpoints.has(checkpoint)) return;
    preFretCheckpoints.add(checkpoint);
    const radialVelocity =
      radius > 0
        ? (translation.x * velocity.x + translation.z * velocity.z) / radius
        : 0;
    const rotorTangentialVelocity = {
      x: startConditions.rotorInitialAngularVelocity * translation.z,
      y: 0,
      z: -startConditions.rotorInitialAngularVelocity * translation.x,
    };
    const rotorRelativeSpeed = Math.hypot(
      velocity.x - rotorTangentialVelocity.x,
      velocity.y - rotorTangentialVelocity.y,
      velocity.z - rotorTangentialVelocity.z,
    );
    const bodyRotorAngle = normalizedAngle(
      2 * Math.atan2(rotorRotation.y, rotorRotation.w),
    );
    const pocketIndex =
      radius > 1.18 && radius < 1.98
        ? pocketIndexFromState(translation, rotorRotation)
        : null;
    console.info(
      "ROULETTE_PRE_FRET_CHECKPOINT",
      JSON.stringify({
        source: "server",
        seed,
        checkpoint,
        simulationTimeSeconds: Number(
          ((step + 1) * PHYSICS_LAB_FIXED_TIMESTEP).toFixed(6),
        ),
        step,
        rotorAngle: Number(bodyRotorAngle.toFixed(9)),
        position: {
          x: Number(translation.x.toFixed(6)),
          y: Number(translation.y.toFixed(6)),
          z: Number(translation.z.toFixed(6)),
        },
        velocity: {
          x: Number(velocity.x.toFixed(6)),
          y: Number(velocity.y.toFixed(6)),
          z: Number(velocity.z.toFixed(6)),
        },
        speed: Number(ballSpeed.toFixed(6)),
        radius: Number(radius.toFixed(6)),
        radialVelocity: Number(radialVelocity.toFixed(6)),
        verticalVelocity: Number(velocity.y.toFixed(6)),
        rotorRelativeSpeed: Number(rotorRelativeSpeed.toFixed(6)),
        contactRoles: [...contactRoles].sort(),
        deflectorContact: contactRoles.has("deflector"),
        bowlBridgeContact: contactRoles.has("bowl-bridge"),
        outerLipContact: contactRoles.has("pocket-outer-lip"),
        pocketFloorContact:
          contactRoles.has("pocket-floor") ||
          contactRoles.has("pocket-catch-underlay"),
        fretContact: contactRoles.has("pocket-fret"),
        pocketIndex,
      }),
    );
  };

  const preInwardCheckpoints = new Set<string>();
  const logPreInwardCheckpoint = (
    checkpoint: string,
    step: number,
    translation: Vec3,
    velocity: Vec3,
    ballSpeed: number,
    radius: number,
    rotorRotation: Quaternion,
    contactRoles: Set<string>,
    trackContact: boolean,
  ) => {
    if (!preFretTraceSeed || preInwardCheckpoints.has(checkpoint)) return;
    preInwardCheckpoints.add(checkpoint);
    const radialVelocity =
      radius > 0
        ? (translation.x * velocity.x + translation.z * velocity.z) / radius
        : 0;
    const bodyRotorAngle = normalizedAngle(
      2 * Math.atan2(rotorRotation.y, rotorRotation.w),
    );
    const ballAngularVelocity = ballBody.angvel();
    console.info(
      "ROULETTE_PRE_INWARD_CHECKPOINT",
      JSON.stringify({
        source: "server",
        seed,
        checkpoint,
        simulationTimeSeconds: Number(
          ((step + 1) * PHYSICS_LAB_FIXED_TIMESTEP).toFixed(6),
        ),
        step,
        rotorAngle: Number(bodyRotorAngle.toFixed(9)),
        worldAzimuth: Number(
          normalizedAngle(Math.atan2(translation.x, translation.z)).toFixed(9),
        ),
        position: {
          x: Number(translation.x.toFixed(6)),
          y: Number(translation.y.toFixed(6)),
          z: Number(translation.z.toFixed(6)),
        },
        velocity: {
          x: Number(velocity.x.toFixed(6)),
          y: Number(velocity.y.toFixed(6)),
          z: Number(velocity.z.toFixed(6)),
        },
        speed: Number(ballSpeed.toFixed(6)),
        radius: Number(radius.toFixed(6)),
        radialVelocity: Number(radialVelocity.toFixed(6)),
        verticalVelocity: Number(velocity.y.toFixed(6)),
        angularVelocity: {
          x: Number(ballAngularVelocity.x.toFixed(6)),
          y: Number(ballAngularVelocity.y.toFixed(6)),
          z: Number(ballAngularVelocity.z.toFixed(6)),
        },
        angularSpeed: Number(
          Math.hypot(
            ballAngularVelocity.x,
            ballAngularVelocity.y,
            ballAngularVelocity.z,
          ).toFixed(6),
        ),
        contactRoles: [...contactRoles].sort(),
        trackContact,
      }),
    );
  };

  try {
    const durationLimitSteps = Math.round(
      PHYSICS_LAB_DURATION_LIMIT_SECONDS / PHYSICS_LAB_FIXED_TIMESTEP,
    );
    for (let step = 0; step < durationLimitSteps; step += 1) {
      rotorAngle = normalizedAngle(
        rotorAngle +
          startConditions.rotorInitialAngularVelocity *
            PHYSICS_LAB_FIXED_TIMESTEP,
      );
      rotorBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(rotorAngle / 2),
        z: 0,
        w: Math.cos(rotorAngle / 2),
      });
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const rotation = ballBody.rotation();
      const angularVelocity = ballBody.angvel();
      const rotorRotation = rotorBody.rotation();
      const rotorVelocity: Vec3 = {
        x: 0,
        y: startConditions.rotorInitialAngularVelocity,
        z: 0,
      };
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
        console.info(
          "SERVER_GEOMETRY_ESCAPE",
          JSON.stringify({
            seed,
            step,
            simulatedAtMs: Math.round(
              step * PHYSICS_LAB_FIXED_TIMESTEP * 1000,
            ),
            radius,
            y: translation.y,
            bottom: translation.y - PHYSICS_LAB_BALL_RADIUS,
            speed: ballSpeed,
            velocity: {
              x: velocity.x,
              y: velocity.y,
              z: velocity.z,
            },
          }),
        );
        errorCode = "GEOMETRY_ESCAPE";
        events.push(event("INVALID", step, { detail: errorCode }));
        break;
      }
      if (ballSpeed > Math.max(8, previousBallSpeed * 4)) {
        errorCode = "VELOCITY_EXPLOSION";
        events.push(event("INVALID", step, { detail: errorCode }));
        break;
      }
      const trackCenterBandMin =
        ROULETTE_DARK_RACE_RADIUS_BAND[0] + PHYSICS_LAB_BALL_RADIUS;
      const trackCenterBandMax =
        ROULETTE_DARK_RACE_RADIUS_BAND[1] - PHYSICS_LAB_BALL_RADIUS;
      const trackSurfaceGap =
        translation.y -
        PHYSICS_LAB_BALL_RADIUS -
        darkRaceSurfaceYAt(radius);
      if (
        !outerTrackEntered &&
        radius >= trackCenterBandMin &&
        radius <= trackCenterBandMax &&
        Math.abs(trackSurfaceGap) <= 0.08
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
      let deflectorPairContact = false;
      let physicalFretPairContact = false;
      const stepContactRoles = new Set<string>();
      world.contactPairsWith(ballCollider, (otherCollider) => {
        world.contactPair(ballCollider, otherCollider, (manifold) => {
          if (manifold.numContacts() <= 0) return;
          if (deflectorColliderHandles.has(otherCollider.handle)) {
            deflectorPairContact = true;
          }
          if (fretColliderHandles.has(otherCollider.handle)) {
            physicalFretPairContact = true;
          }
          const contactRole = colliderRoles.get(otherCollider.handle);
          if (contactRole) stepContactRoles.add(contactRole);
        });
      });

      const preInwardTrackContact = stepContactRoles.has("dark-race");
      if (step === 0) {
        logPreInwardCheckpoint(
          "LAUNCH_STEP_0",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
          preInwardTrackContact,
        );
      }
      const preInwardInTrackBand =
        radius >= trackCenterBandMin && radius <= trackCenterBandMax;
      const preInwardAngle = normalizedAngle(
        Math.atan2(translation.x, translation.z),
      );
      if (
        preInwardInTrackBand &&
        preInwardTrackContact &&
        !preInwardCheckpoints.has("INWARD_DESCENT")
      ) {
        if (preInwardTrackAngle === null) {
          preInwardTrackAngle = preInwardAngle;
          preInwardTrackAngleStart = preInwardAngle;
        } else {
          let delta =
            preInwardAngle - normalizedAngle(preInwardTrackAngle);
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          preInwardTrackAngle += delta;
          const lapCountNow = Math.floor(
            Math.abs(preInwardTrackAngle - preInwardTrackAngleStart!) /
              (Math.PI * 2),
          );
          if (lapCountNow > preInwardCompletedLaps) {
            for (
              let lap = preInwardCompletedLaps + 1;
              lap <= Math.min(lapCountNow, 4);
              lap += 1
            ) {
              logPreInwardCheckpoint(
                `LAP_${lap}`,
                step,
                vec3(translation),
                vec3(velocity),
                ballSpeed,
                radius,
                quaternion(rotorRotation),
                stepContactRoles,
                preInwardTrackContact,
              );
            }
            preInwardCompletedLaps = lapCountNow;
          }
        }
      } else if (
        preInwardTrackAngleStart !== null &&
        radius < trackCenterBandMin
      ) {
        logPreInwardCheckpoint(
          "INWARD_DESCENT",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
          preInwardTrackContact,
        );
      }

      preFretTrackContactObserved ||=
        stepContactRoles.has("dark-race") &&
        radius >= trackCenterBandMin &&
        radius <= trackCenterBandMax;
      if (
        preFretTrackContactObserved &&
        radius < trackCenterBandMin
      ) {
        logPreFretCheckpoint(
          "INWARD_DESCENT",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
        );
      }
      if (deflectorPairContact) {
        logPreFretCheckpoint(
          "DEFLECTOR_CONTACT",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
        );
      }
      if (
        preFretCheckpoints.has("INWARD_DESCENT") &&
        radius <=
          ROULETTE_POCKET_OUTER_LIP_RADIUS + PHYSICS_LAB_BALL_RADIUS + 0.08
      ) {
        logPreFretCheckpoint(
          "ROTOR_ENTRY",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
        );
      }
      const checkpointBallBottom =
        translation.y - PHYSICS_LAB_BALL_RADIUS;
      const checkpointPocketFloorContact =
        stepContactRoles.has("pocket-floor") ||
        stepContactRoles.has("pocket-catch-underlay");
      const checkpointInsidePocket =
        radius >= 1.48 + PHYSICS_LAB_BALL_RADIUS &&
        radius <=
          ROULETTE_POCKET_OUTER_LIP_RADIUS - PHYSICS_LAB_BALL_RADIUS &&
        checkpointBallBottom >= ROULETTE_POCKET_FLOOR_Y - 0.08 &&
        checkpointBallBottom <= ROULETTE_POCKET_FLOOR_Y + 0.16;
      const checkpointPocketContactInsideRotorEnvelope =
        checkpointPocketFloorContact &&
        radius <=
          ROULETTE_POCKET_OUTER_LIP_RADIUS +
            PHYSICS_LAB_BALL_RADIUS +
            0.04;
      if (
        checkpointInsidePocket ||
        checkpointPocketContactInsideRotorEnvelope
      ) {
        logPreFretCheckpoint(
          "POCKET_ENTRY",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
        );
      }
      if (physicalFretPairContact) {
        logPreFretCheckpoint(
          "PHYSICAL_FRET_CONTACT",
          step,
          vec3(translation),
          vec3(velocity),
          ballSpeed,
          radius,
          quaternion(rotorRotation),
          stepContactRoles,
        );
      }
      if (!deflectorHit && deflectorPairContact) {
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
          ? pocketIndexFromState(translation, rotorRotation)
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
      const rotorTangentialVelocity = {
        x: startConditions.rotorInitialAngularVelocity * translation.z,
        y: 0,
        z: -startConditions.rotorInitialAngularVelocity * translation.x,
      };
      const rotorRelativeSpeed = Math.hypot(
        velocity.x - rotorTangentialVelocity.x,
        velocity.y - rotorTangentialVelocity.y,
        velocity.z - rotorTangentialVelocity.z,
      );
      const ballBottom = translation.y - PHYSICS_LAB_BALL_RADIUS;
      const settlePocketInteraction = pocketInteraction;
      const settleRelativeSpeed = rotorRelativeSpeed < 0.12;
      const settleRadiusMin =
        radius >= 1.48 + PHYSICS_LAB_BALL_RADIUS;
      const settleRadiusMax =
        radius <=
        ROULETTE_POCKET_OUTER_LIP_RADIUS - PHYSICS_LAB_BALL_RADIUS;
      const settleFloor =
        Math.abs(ballBottom - ROULETTE_POCKET_FLOOR_Y) <= 0.12;
      const settlePocketIndex = previousPocketIndex !== null;
      const settleGatePassed =
        settlePocketInteraction &&
        settleRelativeSpeed &&
        settleRadiusMin &&
        settleRadiusMax &&
        settleFloor &&
        settlePocketIndex;
      if (
        (seed === "61004" || seed === "61005" || seed === "61006") &&
        step >= 1800 &&
        (step % 120 === 0 || step >= 2868 || stableFrames > 0)
      ) {
        const contactRoles: string[] = [];
        world.contactPairsWith(ballCollider, (otherCollider) => {
          world.contactPair(ballCollider, otherCollider, (manifold) => {
            if (manifold.numContacts() > 0) {
              contactRoles.push(
                colliderRoles.get(otherCollider.handle) ?? "unknown",
              );
            }
          });
        });
        const actualRotorAngularVelocity = rotorBody.angvel();
        console.info(
          "SERVER_SETTLE_DIAGNOSTIC",
          JSON.stringify({
            seed,
            step,
            simulatedAtMs: Math.round(
              step * PHYSICS_LAB_FIXED_TIMESTEP * 1000,
            ),
            ballSpeed,
            rotorRelativeSpeed,
            radius,
            y: translation.y,
            ballBottom,
            floorDelta: ballBottom - ROULETTE_POCKET_FLOOR_Y,
            previousPocketIndex,
            stableFrames,
            actualRotorAngularVelocity: {
              x: actualRotorAngularVelocity.x,
              y: actualRotorAngularVelocity.y,
              z: actualRotorAngularVelocity.z,
            },
            contactRoles,
            gate: {
              pocketInteraction: settlePocketInteraction,
              relativeSpeed: settleRelativeSpeed,
              radiusMin: settleRadiusMin,
              radiusMax: settleRadiusMax,
              floor: settleFloor,
              pocketIndex: settlePocketIndex,
            },
          }),
        );
      }
      if (settleGatePassed) {
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
      previousVelocity = {
        x: velocity.x,
        y: velocity.y,
        z: velocity.z,
      };
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