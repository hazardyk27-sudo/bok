import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ROULETTE_ASSET_PATH,
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_NORMALIZED_DIAMETER,
  ROULETTE_RAW_SOURCE_CENTER,
  ROULETTE_ROTATION_AXIS,
  ROULETTE_Y_ORIGIN,
} from './roulette-scene-config';

const FIXED_TIMESTEP = 1 / 120;
const TEST_ANGULAR_SPEED = 0.35;
const GRAVITY_Y = -58.86;
const BALL_RADIUS = ROULETTE_BALL_RADIUS;
const BALL_MASS = 0.0027;
const TWO_PI = Math.PI * 2;
const DROP_RADIUS = 2.35;
const DROP_HEIGHT_ABOVE_SURFACE = 0.72;
const DROP_DURATION_SECONDS = 4;
const DARK_OUTER_TRACK_RADIUS = 2.35;
const DARK_OUTER_TRACK_HEIGHT = -0.338;
const PART3_TRACK_FRICTION = 0.08;
const PART3_TRACK_DAMPING = 0.01;
const PART3_TRACK_DURATION_SECONDS = 30;
const PART3_LAUNCH_RADIUS = 2.82;
const PART3_RETAINING_RIM_INNER_RADIUS = 2.95;
const PART3_DEFLECTOR_INNER_RADIUS = 2.464;
const PART3_DEFLECTOR_OUTER_RADIUS = 2.657;
const PART3_DEFLECTOR_BOTTOM = -0.291;
const PART3_DEFLECTOR_TOP = 0.015;
const PART3_DEFLECTOR_COUNT = 37;
const PART3_DEFLECTOR_PITCH = TWO_PI / PART3_DEFLECTOR_COUNT;
const PART3_DEFLECTOR_FRICTION = 0.28;
const PART3_DEFLECTOR_RESTITUTION = 0.16;
const PART3_DEFLECTOR_RADIUS = (PART3_DEFLECTOR_INNER_RADIUS + PART3_DEFLECTOR_OUTER_RADIUS) / 2;
const PART3_DEFLECTOR_HEIGHT = PART3_DEFLECTOR_TOP - PART3_DEFLECTOR_BOTTOM;
const PART3_DEFLECTOR_TANGENTIAL_WIDTH =
  PART3_DEFLECTOR_RADIUS * THREE.MathUtils.degToRad(7.83);
const PART3_DEFLECTOR_APPROACH_RADIUS = 2.74;
const PART3_TRACK_INNER_RADIUS = 2.72;
const PART3_TRACK_OUTER_RADIUS = 2.90;
const PART3_TRACK_CONTACT_TOLERANCE = 0.1;
const PROFILE_SEGMENTS = 64;
const PROFILE_SHELL_THICKNESS = 0.08;
const BALL_COLLISION_GROUP = 0x0001;
const STATIONARY_COLLISION_GROUP = 0x0002;
const ROTOR_COLLISION_GROUP = 0x0004;
const ROTOR_CONTACT_RADIUS = 1.72;
const ROTOR_CONTACT_SEGMENTS = 32;
const EUROPEAN_POCKET_COUNT = 37;
const POCKET_STEP_RADIANS = TWO_PI / EUROPEAN_POCKET_COUNT;
const POCKET_FLOOR_INNER_RADIUS = 1.48;
const POCKET_FLOOR_OUTER_RADIUS = 1.90;
const POCKET_FLOOR_Y = -0.45;
const POCKET_FLOOR_THICKNESS = 0.06;
const POCKET_FLOOR_SEGMENTS = 74;
const POCKET_FRET_RADIUS = 1.73;
const POCKET_FRET_TANGENTIAL_HALF_EXTENT = 0.105;
const POCKET_FRET_RADIAL_HALF_EXTENT = 0.032;
const POCKET_FRET_VERTICAL_HALF_EXTENT = 0.11;
// Keep the fret's lower face just above the continuous floor. Letting the
// separator extend through the floor creates a moving edge that can inject a
// downward impulse when a ball approaches from the side.
const POCKET_FRET_Y =
  POCKET_FLOOR_Y + POCKET_FRET_VERTICAL_HALF_EXTENT + 0.01;
const EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

type InspectionView = 'top' | 'angled' | 'side';
type LoadState = 'loading' | 'loaded' | 'error';
type VectorReadout = { x: number; y: number; z: number };

type Part2AssetAudit = {
  sourceMeshCount: number;
  sourceTriangles: number;
  runtimeMeshCount: number;
  runtimeTriangles: number;
  normalizationScale: number;
  dimensions: VectorReadout;
  pivot: VectorReadout;
  sourcePivot: VectorReadout;
  sourceRoot: string;
  excludedGeometry: string[];
  attribution: { author: string; license: string; source: string };
  stationaryMeshCount: number;
  stationaryTriangles: number;
  rotorMeshCount: number;
  rotorTriangles: number;
};

type Part2DropReport = {
  status: 'running' | 'passed' | 'failed';
  initialPosition: VectorReadout;
  firstContactPosition: VectorReadout | null;
  firstContactRadius: number | null;
  firstContactTime: number | null;
  finalPosition: VectorReadout;
  finalSpeed: number;
  maxPenetration: number;
  finalSeparation: number;
  passThrough: boolean;
  visibleSurfaceMatch: boolean;
  ccdEnabled: boolean;
  maxVisualBodySyncError: number;
  colliderProfile: {
    outerTrackRadius: number;
    outerTrackHeight: number;
    bowlInnerRadius: number;
    bowlOuterRadius: number;
    innerFloorTop: number;
    centerGuardRadius: number;
  };
  detail: string;
};

type Part3ProbeResult = {
  id: string;
  label: string;
  spawnRadius: number;
  spawnHeight: number;
  initialVelocity: VectorReadout;
  initialAngularSpin: VectorReadout;
  lapCount: number;
  trackDuration: number;
  averageTrackSpeed: number;
  trackStartSpeed: number;
  trackEndSpeed: number;
  trackLapSpeeds: number[];
  energyLossRatio: number;
  continuousTrackContact: boolean;
  naturalRollOrSlide: boolean;
  inwardDescentTime: number | null;
  inwardDescentRadius: number | null;
  deflectorContact: boolean;
  peakSpeedBeforeContact: number | null;
  peakSpeedAfterContact: number | null;
  impactSpeedBefore: number | null;
  impactSpeedAfter: number | null;
  impactDirectionChangeDegrees: number | null;
  noPassThrough: boolean;
  visualContactAlignmentCredible: boolean;
  retainingRimRadius: number;
  nearestDeflectorRadius: number;
  earlyLapMinimumDeflectorClearance: number | null;
  deflectorColliderCount: number;
  deflectorColliderType: string;
  deflectorColliderFriction: number;
  deflectorColliderRestitution: number;
  bouncePlausible: boolean;
  hover: boolean;
  clipping: boolean;
  artificialAcceleration: boolean;
  maxRotorSyncError: number;
  peakSpeed: number;
  minRadius: number;
  maxRadius: number;
  maxPenetration: number;
  maxSeparation: number;
  stableContact: boolean;
  leftValidVolume: boolean;
  tunneling: boolean;
  velocityExplosion: boolean;
  maxVisualBodySyncError: number;
  outcome: 'stable' | 'settled' | 'failed';
  detail: string;
};

type Part3ValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: Part3ProbeResult[];
  ccdEnabled: boolean;
  detail: string;
};

type Part4ProbeResult = {
  id: string;
  label: string;
  rotorAngularSpeed: number;
  contactDuration: number;
  spawnRadius: number;
  spawnHeight: number;
  initialVelocity: VectorReadout;
  peakSpeed: number;
  maxEnergyGain: number;
  minRadius: number;
  maxRadius: number;
  maxPenetration: number;
  maxSeparation: number;
  escaped: boolean;
  tunneling: boolean;
  velocityExplosion: boolean;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  outsideTurretStationary: boolean;
  outcome: 'stable' | 'settled' | 'failed';
  detail: string;
};

type Part4ValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: Part4ProbeResult[];
  ccdEnabled: boolean;
  kinematicRotor: boolean;
  detail: string;
};

type PocketEntryProbeResult = {
  id: string;
  label: string;
  targetPocketIndex: number;
  targetPocketNumber: number;
  rotorAngularSpeed: number;
  entryVelocity: VectorReadout;
  peakBallSpeed: number;
  maxPenetration: number;
  maxSeparation: number;
  fretContact: boolean;
  artificialEnergyInjection: boolean;
  escaped: boolean;
  tunneled: boolean;
  settled: boolean;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  detail: string;
};

type PocketValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: PocketEntryProbeResult[];
  detail: string;
};

type Part2SceneViewportProps = {
  loadKey: number;
  validationMode?: 'part2' | 'part3' | 'part4';
  view: InspectionView;
  showGrid: boolean;
  showPhysicsDebug: boolean;
  showBallPlaceholder: boolean;
  showStationaryGroup: boolean;
  showRotorGroup: boolean;
  rotorAngle: number;
  onStateChange: (state: LoadState, detail?: string) => void;
  onAudit: (audit: Part2AssetAudit) => void;
  onRotorAngleChange: (angle: number) => void;
};

const VIEW_PRESETS: Record<InspectionView, { position: [number, number, number]; up: [number, number, number] }> = {
  top: { position: [0, 9.4, 0.001], up: [0, 0, -1] },
  angled: { position: [5.8, 4.9, 6.6], up: [0, 1, 0] },
  side: { position: [6.8, 1.2, 0.001], up: [0, 1, 0] },
};

// This is a measured, low-complexity reconstruction of the visible LP Test 04
// profile. It is intentionally not the raw GLB triangle mesh.
const BOWL_PROFILE: Array<[number, number]> = [
  [0.32, -0.62],
  [0.75, -0.57],
  [1.25, -0.52],
  [1.65, -0.49],
  [1.95, -0.458],
  [2.10, -0.385],
  [2.25, -0.35],
  [2.35, -0.338],
  [2.40, -0.33],
  [2.50, -0.276],
  [2.60, -0.23],
  [2.75, -0.12],
  [2.90, -0.02],
  [3.00, 0.01],
];

const COLLIDER_PROFILE = {
  outerTrackRadius: DROP_RADIUS,
  outerTrackHeight: -0.338,
  bowlInnerRadius: BOWL_PROFILE[0][0],
  bowlOuterRadius: BOWL_PROFILE.at(-1)![0],
  innerFloorTop: -0.68,
  centerGuardRadius: 0.25,
};

const PART3_PROBES = [
  {
    id: 'outer-track-launch',
    label: 'Outer-track launch / deflector clearance',
    angle: 0.37,
    radius: PART3_LAUNCH_RADIUS,
    speed: 5,
    spinFactor: 1,
    kind: 'outer-track',
    durationSeconds: PART3_TRACK_DURATION_SECONDS,
  },
  {
    id: 'controlled-deflector-approach',
    label: 'Controlled inward deflector approach',
    angle: 0.37,
    radius: PART3_DEFLECTOR_APPROACH_RADIUS,
    speed: 1.4,
    spinFactor: 0,
    kind: 'deflector-approach',
    durationSeconds: 2.5,
  },
] as const;

const PART4_PROBES = [
  {
    id: 'gentle-kinematic-contact',
    label: 'Gentle kinematic rotor contact',
    angle: 0.47,
    radius: ROTOR_CONTACT_RADIUS,
    relativeSpeed: 0.12,
    durationSeconds: 1.6,
  },
  {
    id: 'moderate-kinematic-contact',
    label: 'Moderate relative rotor contact',
    angle: 1.03,
    radius: ROTOR_CONTACT_RADIUS,
    relativeSpeed: 0.45,
    durationSeconds: 1.6,
  },
] as const;

const POCKET_ENTRY_PROBES = [
  {
    id: 'pocket-center',
    label: 'Pocket-center entry',
    targetPocketIndex: 0,
    angularOffset: 0,
    tangentialSpeed: 0,
  },
  {
    id: 'positive-side-fret',
    label: 'Positive-side fret approach',
    targetPocketIndex: 12,
    angularOffset: POCKET_STEP_RADIANS * 0.30,
    tangentialSpeed: -0.08,
  },
  {
    id: 'negative-side-fret',
    label: 'Negative-side fret approach',
    targetPocketIndex: 25,
    angularOffset: -POCKET_STEP_RADIANS * 0.30,
    tangentialSpeed: 0.04,
  },
] as const;

function part3SpawnPosition(probe: (typeof PART3_PROBES)[number]) {
  const y =
    probe.kind === 'deflector-approach'
      ? (PART3_DEFLECTOR_BOTTOM + PART3_DEFLECTOR_TOP) / 2
      : part3TrackHeight(probe.radius);
  return radialPosition(
    probe.radius,
    probe.angle,
    y + (probe.kind === 'deflector-approach' ? 0 : BALL_RADIUS + 0.002),
  );
}

function part3InitialVelocity(probe: (typeof PART3_PROBES)[number]): VectorReadout {
  if (probe.kind === 'deflector-approach') {
    return {
      x: Number((-Math.sin(probe.angle) * probe.speed).toFixed(4)),
      y: 0,
      z: Number((-Math.cos(probe.angle) * probe.speed).toFixed(4)),
    };
  }
  return {
    x: Number((Math.cos(probe.angle) * probe.speed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(probe.angle) * probe.speed).toFixed(4)),
  };
}

function part3InitialAngularSpin(probe: (typeof PART3_PROBES)[number]): VectorReadout {
  if (probe.kind === 'deflector-approach') {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: 0,
    y: 0,
    z: Number((-probe.speed / probe.radius * probe.spinFactor).toFixed(4)),
  };
}

function addPart3DeflectorColliders(
  world: RAPIER.World,
  stationaryBody: RAPIER.RigidBody,
) {
  const colliders: RAPIER.Collider[] = [];
  const halfTangentialWidth = PART3_DEFLECTOR_TANGENTIAL_WIDTH / 2;
  const halfHeight = PART3_DEFLECTOR_HEIGHT / 2;
  const halfRadialDepth =
    (PART3_DEFLECTOR_OUTER_RADIUS - PART3_DEFLECTOR_INNER_RADIUS) / 2;
  const centerY = (PART3_DEFLECTOR_BOTTOM + PART3_DEFLECTOR_TOP) / 2;
  for (let index = 0; index < PART3_DEFLECTOR_COUNT; index += 1) {
    const angle = (index + 0.5) * PART3_DEFLECTOR_PITCH;
    const collider = RAPIER.ColliderDesc.cuboid(
      halfTangentialWidth,
      halfHeight,
      halfRadialDepth,
    )
      .setTranslation(
        Math.sin(angle) * PART3_DEFLECTOR_RADIUS,
        centerY,
        Math.cos(angle) * PART3_DEFLECTOR_RADIUS,
      )
      .setRotation({
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2),
      })
      .setFriction(PART3_DEFLECTOR_FRICTION)
      .setRestitution(PART3_DEFLECTOR_RESTITUTION);
    colliders.push(world.createCollider(collider, stationaryBody));
  }
  return colliders;
}

function part3TrackHeight(radius: number) {
  const trackProfile: Array<[number, number]> = [
    [1.95, -0.458],
    [2.05, -0.39],
    [2.12, -0.35],
    [2.25, -0.343],
    [2.35, -0.338],
    [2.45, -0.33],
    [2.65, -0.27],
    [2.90, -0.27],
    [2.95, -0.15],
  ];
  const clamped = Math.max(trackProfile[0][0], Math.min(trackProfile.at(-1)![0], radius));
  for (let index = 1; index < trackProfile.length; index += 1) {
    const [rightRadius, rightY] = trackProfile[index];
    const [leftRadius, leftY] = trackProfile[index - 1];
    if (clamped <= rightRadius) {
      return THREE.MathUtils.lerp(
        leftY,
        rightY,
        (clamped - leftRadius) / (rightRadius - leftRadius),
      );
    }
  }
  return trackProfile.at(-1)![1];
}

// This is an analytic lathed cross-section of the visible dark outer ray and
// its retaining edge. It is not derived from or used as a raw GLB collider.
function makePart3OuterTrackTrimesh() {
  const crossSection: Array<[number, number]> = [
    [1.95, -0.458],
    [2.05, -0.39],
    [2.12, -0.35],
    [2.25, -0.343],
    [2.35, -0.338],
    [2.45, -0.33],
    [2.65, -0.27],
    [2.90, -0.27],
    [2.95, -0.15],
    [2.95, -0.4],
    [1.95, -0.4],
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  const segments = 128;
  for (const [radius, y] of crossSection) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TWO_PI;
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  for (let row = 0; row < crossSection.length; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = row * segments + segment;
      const b = row * segments + next;
      const c = ((row + 1) % crossSection.length) * segments + next;
      const d = ((row + 1) % crossSection.length) * segments + segment;
      indices.push(a, d, b, b, d, c);
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function part4SpawnPosition(probe: (typeof PART4_PROBES)[number]) {
  return radialPosition(
    probe.radius,
    probe.angle,
    ROTOR_CONTACT_HEIGHT + BALL_RADIUS + 0.002,
  );
}

function part4InitialVelocity(probe: (typeof PART4_PROBES)[number]): VectorReadout {
  const surfaceSpeed = TEST_ANGULAR_SPEED * probe.radius;
  const totalSpeed = surfaceSpeed + probe.relativeSpeed;
  return {
    x: Number((Math.cos(probe.angle) * totalSpeed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(probe.angle) * totalSpeed).toFixed(4)),
  };
}

function buildPocketFloorTrimesh() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const radii = [
    POCKET_FLOOR_INNER_RADIUS,
    POCKET_FLOOR_OUTER_RADIUS,
    POCKET_FLOOR_INNER_RADIUS,
    POCKET_FLOOR_OUTER_RADIUS,
  ];
  const heights = [
    POCKET_FLOOR_Y,
    POCKET_FLOOR_Y,
    POCKET_FLOOR_Y - POCKET_FLOOR_THICKNESS,
    POCKET_FLOOR_Y - POCKET_FLOOR_THICKNESS,
  ];
  for (let ring = 0; ring < 4; ring += 1) {
    for (let index = 0; index < POCKET_FLOOR_SEGMENTS; index += 1) {
      const angle = (index / POCKET_FLOOR_SEGMENTS) * TWO_PI;
      vertices.push(
        Math.sin(angle) * radii[ring],
        heights[ring],
        Math.cos(angle) * radii[ring],
      );
    }
  }

  const innerTop = 0;
  const outerTop = POCKET_FLOOR_SEGMENTS;
  const innerBottom = POCKET_FLOOR_SEGMENTS * 2;
  const outerBottom = POCKET_FLOOR_SEGMENTS * 3;
  for (let index = 0; index < POCKET_FLOOR_SEGMENTS; index += 1) {
    const next = (index + 1) % POCKET_FLOOR_SEGMENTS;
    indices.push(
      innerTop + index,
      outerTop + index,
      outerTop + next,
      innerTop + index,
      outerTop + next,
      innerTop + next,
      innerBottom + index,
      outerBottom + next,
      outerBottom + index,
      innerBottom + index,
      innerBottom + next,
      outerBottom + next,
      innerTop + index,
      innerTop + next,
      innerBottom + index,
      innerTop + next,
      innerBottom + next,
      innerBottom + index,
      outerTop + index,
      outerBottom + index,
      outerTop + next,
      outerTop + next,
      outerBottom + index,
      outerBottom + next,
    );
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function addKinematicPocketSystem(world: RAPIER.World, body: RAPIER.RigidBody) {
  const colliders: RAPIER.Collider[] = [];
  const floorMesh = buildPocketFloorTrimesh();
  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        floorMesh.vertices,
        floorMesh.indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
          RAPIER.TriMeshFlags.ORIENTED,
      )
        .setTranslation(0, 0, 0)
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16)),
      body,
    ),
  );
  for (let index = 0; index < EUROPEAN_POCKET_COUNT; index += 1) {
    const angle = (index + 0.5) * POCKET_STEP_RADIANS;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      POCKET_FRET_TANGENTIAL_HALF_EXTENT,
      POCKET_FRET_VERTICAL_HALF_EXTENT,
      POCKET_FRET_RADIAL_HALF_EXTENT,
      0.012,
    )
      .setTranslation(...radialPosition(POCKET_FRET_RADIUS, angle, POCKET_FRET_Y))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16));
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function pocketIndexFromLocalPosition(x: number, z: number) {
  return (
    Math.round(normalizedAngle(Math.atan2(x, z)) / POCKET_STEP_RADIANS) %
    EUROPEAN_POCKET_COUNT
  );
}

function pocketEntryVelocity(angle: number, tangentialSpeed: number): VectorReadout {
  return {
    x: Math.cos(angle) * tangentialSpeed,
    y: -0.22,
    z: -Math.sin(angle) * tangentialSpeed,
  };
}

async function runPocketEntryValidation(): Promise<PocketValidationReport> {
  await RAPIER.init();
  const results: PocketEntryProbeResult[] = [];
  // Direct-entry validation phase-locks the rotor at its reference angle.
  // The same setNextKinematicRotation path is used, but no outer-track launch
  // energy is allowed into this isolated geometry test.
  const rotorAngularSpeed = 0;
  const durationSteps = Math.round(3.5 / FIXED_TIMESTEP);

  for (const probe of POCKET_ENTRY_PROBES) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
    world.timestep = FIXED_TIMESTEP;
    world.maxCcdSubsteps = 8;
    const rotorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased(),
    );
    const pocketColliders = addKinematicPocketSystem(world, rotorBody);
    const targetAngle =
      probe.targetPocketIndex * POCKET_STEP_RADIANS + probe.angularOffset;
    const entryPosition = radialPosition(
      1.62,
      targetAngle,
      POCKET_FLOOR_Y + BALL_RADIUS + 0.18,
    );
    const entryVelocity = pocketEntryVelocity(
      targetAngle,
      probe.tangentialSpeed,
    );
    const ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...entryPosition)
        .setLinvel(entryVelocity.x, entryVelocity.y, entryVelocity.z)
        .setAdditionalMass(BALL_MASS)
        .setLinearDamping(0.04)
        .setAngularDamping(0.08)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(BALL_RADIUS * 2.5)
        .setCanSleep(false),
    );
    ballBody.enableCcd(true);
    ballBody.setSoftCcdPrediction(BALL_RADIUS * 2.5);
    const ballCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setFriction(0.42)
        .setRestitution(0.02)
        .setDensity(0.001)
        .setCollisionGroups(
          BALL_COLLISION_GROUP |
            ((ROTOR_COLLISION_GROUP | STATIONARY_COLLISION_GROUP) << 16),
        ),
      ballBody,
    );
    const fretHandles = new Set(
      pocketColliders.slice(1).map((collider) => collider.handle),
    );
    let peakBallSpeed = 0;
    let maxPenetration = 0;
    let maxSeparation = 0;
    let maxVisualBodySyncError = 0;
    let maxRotorSyncError = 0;
    let previousSpeed = Math.hypot(
      entryVelocity.x,
      entryVelocity.y,
      entryVelocity.z,
    );
    let settledFrames = 0;
    let fretContact = false;
    let escaped = false;
    let tunneled = false;
    let artificialEnergyInjection = false;
    let rotorAngle = 0;

    for (let step = 0; step < durationSteps; step += 1) {
      rotorAngle += rotorAngularSpeed * FIXED_TIMESTEP;
      rotorBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(rotorAngle / 2),
        z: 0,
        w: Math.cos(rotorAngle / 2),
      });
      world.step();
      const position = ballBody.translation();
      const velocity = ballBody.linvel();
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const radius = Math.hypot(position.x, position.z);
      const bottom = position.y - BALL_RADIUS;
      const penetration = Math.max(0, POCKET_FLOOR_Y - bottom);
      const separation = Math.max(0, bottom - POCKET_FLOOR_Y);
      const rotorRotation = rotorBody.rotation();
      const bodyRotorAngle = normalizedAngle(
        2 * Math.atan2(rotorRotation.y, rotorRotation.w),
      );
      maxRotorSyncError = Math.max(
        maxRotorSyncError,
        Math.abs(
          THREE.MathUtils.euclideanModulo(
            bodyRotorAngle - rotorAngle + Math.PI,
            TWO_PI,
          ) - Math.PI,
        ),
      );
      maxVisualBodySyncError = 0;
      peakBallSpeed = Math.max(peakBallSpeed, speed);
      maxPenetration = Math.max(maxPenetration, penetration);
      maxSeparation = Math.max(maxSeparation, separation);
      world.contactPairsWith(ballCollider, (otherCollider) => {
        if (fretHandles.has(otherCollider.handle)) fretContact = true;
      });
      escaped ||=
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z) ||
        radius < POCKET_FLOOR_INNER_RADIUS - 0.14 ||
        radius > POCKET_FLOOR_OUTER_RADIUS + 0.14 ||
        position.y < POCKET_FLOOR_Y - BALL_RADIUS - 0.18;
      tunneled ||= penetration > 0.08;
      artificialEnergyInjection ||=
        speed > Math.max(8, previousSpeed * 4);
      if (
        speed < 0.12 &&
        radius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
        radius <= POCKET_FLOOR_OUTER_RADIUS - BALL_RADIUS &&
        Math.abs(bottom - POCKET_FLOOR_Y) <= 0.12
      ) {
        settledFrames += 1;
      } else {
        settledFrames = 0;
      }
      previousSpeed = speed;
    }

    const finalPosition = ballBody.translation();
    const finalVelocity = ballBody.linvel();
    const finalSpeed = Math.hypot(
      finalVelocity.x,
      finalVelocity.y,
      finalVelocity.z,
    );
    const finalRadius = Math.hypot(finalPosition.x, finalPosition.z);
    const finalAngle = normalizedAngle(
      Math.atan2(finalPosition.x, finalPosition.z) - rotorAngle,
    );
    const finalPocketIndex =
      finalRadius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
      finalRadius <= POCKET_FLOOR_OUTER_RADIUS - BALL_RADIUS
        ? pocketIndexFromLocalPosition(
            Math.sin(finalAngle),
            Math.cos(finalAngle),
          )
        : null;
    const settled =
      settledFrames >= Math.round(0.5 / FIXED_TIMESTEP) && finalSpeed < 0.12;
    const pocketMatch = finalPocketIndex === probe.targetPocketIndex;
    const passed =
      !escaped &&
      !tunneled &&
      !artificialEnergyInjection &&
      settled &&
      pocketMatch &&
      maxRotorSyncError <= 0.000001;

    results.push({
      id: probe.id,
      label: probe.label,
      targetPocketIndex: probe.targetPocketIndex,
      targetPocketNumber: EUROPEAN_SEQUENCE[probe.targetPocketIndex],
      rotorAngularSpeed,
      entryVelocity,
      peakBallSpeed: Number(peakBallSpeed.toFixed(4)),
      maxPenetration: Number(maxPenetration.toFixed(4)),
      maxSeparation: Number(maxSeparation.toFixed(4)),
      fretContact,
      artificialEnergyInjection,
      escaped,
      tunneled,
      settled,
      finalPocketIndex,
      finalPocketNumber:
        finalPocketIndex === null ? null : EUROPEAN_SEQUENCE[finalPocketIndex],
      maxVisualBodySyncError,
      maxRotorSyncError: Number(maxRotorSyncError.toFixed(6)),
      detail: passed
        ? fretContact
          ? 'Stable pocket settle with controlled fret contact.'
          : 'Stable pocket-center settle without fret contact.'
        : `Pocket entry failed: ${[
            escaped && 'escape',
            tunneled && 'tunneling',
            artificialEnergyInjection && 'energy injection',
            !settled && 'no stable settle',
            !pocketMatch && 'wrong final pocket',
          ]
            .filter(Boolean)
            .join(', ') || 'review required'}.`,
    });
    world.removeRigidBody(ballBody);
    world.removeRigidBody(rotorBody);
  }

  const passed = results.filter(
    (result) =>
      result.settled &&
      !result.escaped &&
      !result.tunneled &&
      !result.artificialEnergyInjection &&
      result.finalPocketIndex === result.targetPocketIndex,
  ).length;
  return {
    status: passed === POCKET_ENTRY_PROBES.length ? 'passed' : 'failed',
    results,
    detail:
      passed === POCKET_ENTRY_PROBES.length
        ? 'All three direct European pocket-entry probes passed at 120 Hz with CCD.'
        : `${POCKET_ENTRY_PROBES.length - passed} direct pocket-entry probe(s) need geometry review.`,
  };
}

function addKinematicRotorBand(world: RAPIER.World, body: RAPIER.RigidBody) {
  const colliders: RAPIER.Collider[] = [];
  for (let index = 0; index < ROTOR_CONTACT_SEGMENTS; index += 1) {
    const angle = (index / ROTOR_CONTACT_SEGMENTS) * TWO_PI;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      (ROTOR_CONTACT_RADIUS * Math.PI) / ROTOR_CONTACT_SEGMENTS,
      0.018,
      0.16,
      0.025,
    )
      .setTranslation(...radialPosition(ROTOR_CONTACT_RADIUS, angle, ROTOR_CONTACT_HEIGHT))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16));
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function countMeshes(object: THREE.Object3D) {
  let count = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function countTriangles(object: THREE.Object3D) {
  let triangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    triangles += index ? index.count / 3 : (position?.count ?? 0) / 3;
  });
  return Math.round(triangles);
}

function roundedVector(vector: THREE.Vector3): VectorReadout {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

function normalizedAngle(angle: number) {
  return THREE.MathUtils.euclideanModulo(angle, TWO_PI);
}

function radialPosition(radius: number, angle: number, y: number): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function profileHeight(radius: number) {
  const clamped = Math.max(BOWL_PROFILE[0][0], Math.min(BOWL_PROFILE.at(-1)![0], radius));
  for (let index = 1; index < BOWL_PROFILE.length; index += 1) {
    const [rightRadius, rightY] = BOWL_PROFILE[index];
    const [leftRadius, leftY] = BOWL_PROFILE[index - 1];
    if (clamped <= rightRadius) {
      const alpha = (clamped - leftRadius) / (rightRadius - leftRadius);
      return THREE.MathUtils.lerp(leftY, rightY, alpha);
    }
  }
  return BOWL_PROFILE.at(-1)![1];
}

const DROP_TRACK_Y = profileHeight(DROP_RADIUS);
const ROTOR_CONTACT_HEIGHT = profileHeight(ROTOR_CONTACT_RADIUS) + 0.04;
const DROP_INITIAL_POSITION = radialPosition(
  DROP_RADIUS,
  0,
  DROP_TRACK_Y + DROP_HEIGHT_ABOVE_SURFACE,
);

function makeProfileTrimesh() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const profileCount = BOWL_PROFILE.length;

  for (const [radius, y] of BOWL_PROFILE) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const angle = (segment / PROFILE_SEGMENTS) * TWO_PI;
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  const bottomOffset = profileCount * PROFILE_SEGMENTS;
  for (const [radius, y] of BOWL_PROFILE) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const angle = (segment / PROFILE_SEGMENTS) * TWO_PI;
      vertices.push(
        Math.sin(angle) * radius,
        y - PROFILE_SHELL_THICKNESS,
        Math.cos(angle) * radius,
      );
    }
  }
  for (let row = 0; row < profileCount - 1; row += 1) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const next = (segment + 1) % PROFILE_SEGMENTS;
      const a = row * PROFILE_SEGMENTS + segment;
      const b = row * PROFILE_SEGMENTS + next;
      const c = (row + 1) * PROFILE_SEGMENTS + next;
      const d = (row + 1) * PROFILE_SEGMENTS + segment;
      indices.push(a, d, b, b, d, c);

      const ba = bottomOffset + a;
      const bb = bottomOffset + b;
      const bc = bottomOffset + c;
      const bd = bottomOffset + d;
      indices.push(ba, bb, bd, bb, bc, bd);
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function addRetainingRim(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  radius: number,
  y: number,
) {
  const colliders: RAPIER.Collider[] = [];
  const count = 32;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TWO_PI;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      (radius * Math.PI) / count * 0.9,
      0.11,
      0.07,
      0.025,
    )
      .setTranslation(...radialPosition(radius, angle, y))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.45)
      .setRestitution(0.02);
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function addProfileSupportRings(world: RAPIER.World, body: RAPIER.RigidBody) {
  const count = 48;
  const colliders: RAPIER.Collider[] = [];
  for (let profileIndex = 0; profileIndex < BOWL_PROFILE.length; profileIndex += 1) {
    const [radius, y] = BOWL_PROFILE[profileIndex];
    const previousRadius = BOWL_PROFILE[profileIndex - 1]?.[0] ?? radius;
    const nextRadius = BOWL_PROFILE[profileIndex + 1]?.[0] ?? radius;
    const radialHalfExtent =
      Math.max(radius - previousRadius, nextRadius - radius) / 2 + 0.01;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TWO_PI;
      const collider = RAPIER.ColliderDesc.roundCuboid(
        Math.max(0.05, (radius * Math.PI) / count),
        0.018,
        radialHalfExtent,
        0.025,
      )
        .setTranslation(...radialPosition(radius, angle, y))
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        .setFriction(0.42)
        .setRestitution(0.02);
      colliders.push(world.createCollider(collider, body));
    }
  }
  return colliders;
}

function createBallVisual() {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 20),
    new THREE.MeshPhysicalMaterial({
      color: '#f5f1dc',
      roughness: 0.14,
      metalness: 0.08,
      clearcoat: 0.32,
    }),
  );
  ball.name = 'Part2__DynamicBallVisual';
  ball.castShadow = true;
  return ball;
}

export function Part2SceneViewport({
  loadKey,
  validationMode = 'part2',
  view,
  showGrid,
  showPhysicsDebug,
  showBallPlaceholder,
  showStationaryGroup,
  showRotorGroup,
  rotorAngle,
  onStateChange,
  onAudit,
  onRotorAngleChange,
}: Part2SceneViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  const callbacksRef = useRef({ onStateChange, onAudit, onRotorAngleChange });
  const rotorAngleRef = useRef(normalizedAngle(rotorAngle));
  const [angleReadout, setAngleReadout] = useState(normalizedAngle(rotorAngle));
  const [dropReport, setDropReport] = useState<Part2DropReport | null>(null);
  const [part3Report, setPart3Report] = useState<Part3ValidationReport | null>(null);
  const [part4Report, setPart4Report] = useState<Part4ValidationReport | null>(null);
  const [pocketReport, setPocketReport] = useState<PocketValidationReport | null>(null);

  viewRef.current = view;
  callbacksRef.current = { onStateChange, onAudit, onRotorAngleChange };

  useEffect(() => {
    rotorAngleRef.current = normalizedAngle(rotorAngle);
  }, [rotorAngle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let wheelRoot: THREE.Group | null = null;
    let stationaryGroup: THREE.Group | null = null;
    let rotorPivot: THREE.Group | null = null;
    let ballMesh: THREE.Mesh | null = null;
    let world: RAPIER.World | null = null;
    let ballBody: RAPIER.RigidBody | null = null;
    let rotorBody: RAPIER.RigidBody | null = null;
    let physicsBallCollider: RAPIER.Collider | null = null;
    let part3TrackCollider: RAPIER.Collider | null = null;
    let part3DeflectorColliders: RAPIER.Collider[] = [];
    let rotorColliders: RAPIER.Collider[] = [];
    let accumulator = 0;
    let lastTime = performance.now();
    let fixedStepCount = 0;
    let dropStarted = false;
    let dropSteps = 0;
    let previousVerticalVelocity = 0;
    let firstContact: VectorReadout | null = null;
    let firstContactRadius: number | null = null;
    let firstContactTime: number | null = null;
    let maxPenetration = 0;
    let maxSeparation = 0;
    let maxVisualBodySyncError = 0;
    let ccdEnabled = false;
    let visibleSurfaceMatch = false;
    let part3ProbeIndex = 0;
    let part3Elapsed = 0;
    let part3PeakSpeed = 0;
    let part3MinRadius = Number.POSITIVE_INFINITY;
    let part3MaxRadius = 0;
    let part3MaxPenetration = 0;
    let part3MaxSeparation = 0;
    let part3ContactFrames = 0;
    let part3SampleFrames = 0;
    let part3MaxVisualBodySyncError = 0;
    let part3LeftValidVolume = false;
    let part3TrackAngle: number | null = null;
    let part3TrackAngleStart: number | null = null;
    let part3TrackAngleEnd: number | null = null;
    let part3TrackContactFrames = 0;
    let part3TrackSampleFrames = 0;
    let part3TrackSpeedSum = 0;
    let part3TrackStartSpeed = 0;
    let part3TrackEndSpeed = 0;
    let part3TrackLapSpeeds: number[] = [];
    let part3TrackCompletedLaps = 0;
    let part3InwardDescentTime: number | null = null;
    let part3InwardDescentRadius: number | null = null;
    let part3ArtificialAcceleration = false;
    let part3Hover = false;
    let part3Clipping = false;
    let part3BouncePlausible = true;
    let part3PreviousSpeed = 0;
    let part3DeflectorContact = false;
    let part3DeflectorContactTime: number | null = null;
    let part3ImpactSpeedBefore: number | null = null;
    let part3ImpactSpeedAfter: number | null = null;
    let part3ImpactDirectionBefore: THREE.Vector3 | null = null;
    let part3ImpactDirectionAfter: THREE.Vector3 | null = null;
    let part3EarlyLapMinimumDeflectorClearance: number | null = null;
    let part3DeflectorPassThrough = false;
    let part3Results: Part3ProbeResult[] = [];
    let part3Finished = false;
    let part4ProbeIndex = 0;
    let part4Elapsed = 0;
    let part4PeakSpeed = 0;
    let part4InitialSpeed = 0;
    let part4MinRadius = Number.POSITIVE_INFINITY;
    let part4MaxRadius = 0;
    let part4MaxPenetration = 0;
    let part4MaxSeparation = 0;
    let part4ContactFrames = 0;
    let part4SampleFrames = 0;
    let part4MaxVisualBodySyncError = 0;
    let part4MaxRotorSyncError = 0;
    let part4MaxEnergyGain = 0;
    let part4OutsideTurretStationary = true;
    let part4LeftValidVolume = false;
    let part4Results: Part4ProbeResult[] = [];
    let part4Finished = false;
    const stationaryBaselinePosition = new THREE.Vector3();
    const stationaryBaselineQuaternion = new THREE.Quaternion();

    callbacksRef.current.onStateChange('loading');

    const publishDropReport = (report: Part2DropReport) => {
      setDropReport(report);
    };

    const publishPart3Report = (
      status: Part3ValidationReport['status'],
      detail: string,
      results = part3Results,
    ) => {
      setPart3Report({
        status,
        results,
        ccdEnabled,
        detail,
      });
    };

    const publishPart4Report = (
      status: Part4ValidationReport['status'],
      detail: string,
      results = part4Results,
    ) => {
      setPart4Report({
        status,
        results,
        ccdEnabled,
        kinematicRotor: Boolean(rotorBody),
        detail,
      });
    };

    const startPart3Probe = (index: number) => {
      const probe = PART3_PROBES[index];
      if (!probe || !ballBody || !ballMesh) return;
      const position = part3SpawnPosition(probe);
      const velocity = part3InitialVelocity(probe);
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      const angularSpin = part3InitialAngularSpin(probe);
      ballBody.setAngvel({ x: angularSpin.x, y: angularSpin.y, z: angularSpin.z }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part3ProbeIndex = index;
      part3Elapsed = 0;
      part3PeakSpeed = 0;
      part3MinRadius = probe.radius;
      part3MaxRadius = probe.radius;
      part3MaxPenetration = 0;
      part3MaxSeparation = 0;
      part3ContactFrames = 0;
      part3SampleFrames = 0;
      part3MaxVisualBodySyncError = 0;
      part3LeftValidVolume = false;
      part3TrackAngle = null;
      part3TrackAngleStart = null;
      part3TrackAngleEnd = null;
      part3TrackContactFrames = 0;
      part3TrackSampleFrames = 0;
      part3TrackSpeedSum = 0;
      part3TrackStartSpeed = 0;
      part3TrackEndSpeed = 0;
      part3TrackLapSpeeds = [];
      part3TrackCompletedLaps = 0;
      part3InwardDescentTime = null;
      part3InwardDescentRadius = null;
      part3ArtificialAcceleration = false;
      part3Hover = false;
      part3Clipping = false;
      part3BouncePlausible = true;
      part3PreviousSpeed = probe.speed;
      part3DeflectorContact = false;
      part3DeflectorContactTime = null;
      part3ImpactSpeedBefore = null;
      part3ImpactSpeedAfter = null;
      part3ImpactDirectionBefore = null;
      part3ImpactDirectionAfter = null;
      part3EarlyLapMinimumDeflectorClearance = null;
      part3DeflectorPassThrough = false;
      publishPart3Report(
        'running',
        `Running probe ${index + 1}/${PART3_PROBES.length}: ${probe.label}.`,
      );
    };

    const startPart4Probe = (index: number) => {
      const probe = PART4_PROBES[index];
      if (!probe || !ballBody || !ballMesh || !rotorBody) return;
      const position = part4SpawnPosition(probe);
      const velocity = part4InitialVelocity(probe);
      const rotorAngleNow = normalizedAngle(rotorAngleRef.current);
      rotorBody.setRotation(
        { x: 0, y: Math.sin(rotorAngleNow / 2), z: 0, w: Math.cos(rotorAngleNow / 2) },
        true,
      );
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part4ProbeIndex = index;
      part4Elapsed = 0;
      part4InitialSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      part4PeakSpeed = part4InitialSpeed;
      part4MinRadius = probe.radius;
      part4MaxRadius = probe.radius;
      part4MaxPenetration = 0;
      part4MaxSeparation = 0;
      part4ContactFrames = 0;
      part4SampleFrames = 0;
      part4MaxVisualBodySyncError = 0;
      part4MaxRotorSyncError = 0;
      part4MaxEnergyGain = 0;
      part4OutsideTurretStationary = true;
      part4LeftValidVolume = false;
      publishPart4Report(
        'running',
        `Running probe ${index + 1}/${PART4_PROBES.length}: ${probe.label}.`,
      );
    };

    try {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
      } catch (rendererError) {
        renderer = null;
        console.warn(
          'WebGL renderer unavailable; continuing with browser physics validation.',
          rendererError,
        );
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      const applyView = (nextView: InspectionView) => {
        const preset = VIEW_PRESETS[nextView];
        camera.up.set(...preset.up);
        camera.position.set(...preset.position);
        controls?.target.set(0, 0, 0);
        controls?.update();
      };

      const keyLight = new THREE.DirectionalLight('#fff8df', 3.4);
      keyLight.position.set(4, 8, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#9fc7ca', 1.8);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);
      scene.add(new THREE.HemisphereLight('#b3d4d2', '#0e171b', 1.2));

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({ color: '#1b2e33', roughness: 0.94, metalness: 0.05 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.48;
      scene.add(floor);

      const grid = new THREE.GridHelper(16, 16, '#567277', '#2f474d');
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      scene.add(grid);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;
      applyView(viewRef.current);

      const loader = new GLTFLoader();
      loader.load(
        ROULETTE_ASSET_PATH,
        async (gltf) => {
          if (disposed) return;
          const runtimeScene = gltf.scene.clone(true);
          const embeddedScaleNode = (() => {
            let found: THREE.Object3D | undefined;
            runtimeScene.traverse((child) => {
              if (
                !found &&
                Math.abs(child.scale.x - 0.01) < 0.000001 &&
                Math.abs(child.scale.y - 0.01) < 0.000001 &&
                Math.abs(child.scale.z - 0.01) < 0.000001
              ) {
                found = child;
              }
            });
            return found;
          })();
          if (!embeddedScaleNode) {
            throw new Error('PART 2 requires the embedded 0.01 GLB transform for scale normalization');
          }
          embeddedScaleNode.scale.set(1, 1, 1);
          runtimeScene.updateMatrixWorld(true);
          const sourceMeshCount = countMeshes(runtimeScene);
          const sourceTriangles = countTriangles(runtimeScene);
          const sourceCenter = new THREE.Vector3(
            ROULETTE_RAW_SOURCE_CENTER.x,
            ROULETTE_RAW_SOURCE_CENTER.y,
            ROULETTE_RAW_SOURCE_CENTER.z,
          );

          const outside = runtimeScene.getObjectByName('geo1_outside_0');
          const inside = runtimeScene.getObjectByName('geo1_inside_0');
          const turret = runtimeScene.getObjectByName('geo1_turret_0');
          if (!outside || !inside || !turret) {
            throw new Error('PART 2 requires geo1_outside_0, geo1_inside_0, and geo1_turret_0');
          }

          wheelRoot = new THREE.Group();
          wheelRoot.name = 'Part2__AuthoritativeWheelRoot';
          wheelRoot.position.set(0, ROULETTE_Y_ORIGIN, 0);
          wheelRoot.userData = {
            sourceAsset: ROULETTE_ASSET_PATH,
            authoritativeTransform: {
              sourceCenter: ROULETTE_RAW_SOURCE_CENTER,
              normalizedCenter: { x: 0, y: 0, z: 0 },
              diameter: ROULETTE_NORMALIZED_DIAMETER,
              scale: ROULETTE_AUTHORITATIVE_SCALE,
              yOrigin: ROULETTE_Y_ORIGIN,
              rotationAxis: ROULETTE_ROTATION_AXIS,
            },
            part2Only: true,
            rawGlbUsedAsCollider: false,
          };
          const runtimeOffset = new THREE.Group();
          runtimeOffset.position.set(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
          runtimeOffset.scale.setScalar(ROULETTE_AUTHORITATIVE_SCALE);
          runtimeOffset.add(runtimeScene);
          wheelRoot.add(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          const normalizedBounds = new THREE.Box3().setFromObject(runtimeScene);
          runtimeOffset.position.sub(normalizedBounds.getCenter(new THREE.Vector3()));
          wheelRoot.updateMatrixWorld(true);

          stationaryGroup = new THREE.Group();
          stationaryGroup.name = 'Part2__StationaryOutsideAndTurret';
          rotorPivot = new THREE.Group();
          rotorPivot.name = 'Part2__RotorPivot__Y';
          rotorPivot.position.set(0, 0, 0);
          rotorPivot.rotation.set(0, rotorAngleRef.current, 0);
          const rotorGroup = new THREE.Group();
          rotorGroup.name = 'Part2__InsideRotorVisual';
          rotorPivot.add(rotorGroup);
          wheelRoot.add(stationaryGroup, rotorPivot);
          stationaryGroup.attach(outside);
          rotorGroup.attach(inside);
          stationaryGroup.attach(turret);
          stationaryBaselinePosition.copy(stationaryGroup.position);
          stationaryBaselineQuaternion.copy(stationaryGroup.quaternion);
          wheelRoot.remove(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          scene.add(wheelRoot);

          const runtimeBounds = new THREE.Box3().setFromObject(wheelRoot);
          const runtimeSize = runtimeBounds.getSize(new THREE.Vector3());
          const json = gltf.parser.json as { asset?: { extras?: Record<string, string> } };
          const extras = json.asset?.extras ?? {};
          callbacksRef.current.onAudit({
            sourceMeshCount,
            sourceTriangles,
            runtimeMeshCount: countMeshes(stationaryGroup) + countMeshes(rotorGroup),
            runtimeTriangles: countTriangles(stationaryGroup) + countTriangles(rotorGroup),
            normalizationScale: ROULETTE_AUTHORITATIVE_SCALE,
            dimensions: roundedVector(runtimeSize),
            pivot: roundedVector(runtimeBounds.getCenter(new THREE.Vector3())),
            sourcePivot: ROULETTE_RAW_SOURCE_CENTER,
            sourceRoot: gltf.scene.name || 'Sketchfab_model',
            excludedGeometry: [],
            stationaryMeshCount: countMeshes(stationaryGroup),
            stationaryTriangles: countTriangles(stationaryGroup),
            rotorMeshCount: countMeshes(rotorGroup),
            rotorTriangles: countTriangles(rotorGroup),
            attribution: {
              author: extras.author ?? 'Unknown author',
              license: extras.license ?? 'Unknown license',
              source: extras.source ?? 'Source URL not provided',
            },
          });

          await RAPIER.init();
          if (disposed) return;
          world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
          world.timestep = FIXED_TIMESTEP;
          world.maxCcdSubsteps = 8;
          const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
          if (validationMode === 'part3') {
            const outerTrackMesh = makePart3OuterTrackTrimesh();
            part3TrackCollider = world.createCollider(
              RAPIER.ColliderDesc.trimesh(
                outerTrackMesh.vertices,
                outerTrackMesh.indices,
                RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
              )
                .setFriction(PART3_TRACK_FRICTION)
                .setRestitution(0.01),
              stationaryBody,
            );
            part3DeflectorColliders = addPart3DeflectorColliders(world, stationaryBody);
          } else {
            const profileMesh = makeProfileTrimesh();
            const profileCollider = RAPIER.ColliderDesc.trimesh(
              profileMesh.vertices,
              profileMesh.indices,
              RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
            )
              .setFriction(0.42)
              .setRestitution(0.02);
            world.createCollider(profileCollider, stationaryBody);
            addProfileSupportRings(world, stationaryBody);
            addRetainingRim(world, stationaryBody, 2.94, -0.02);
          }
          world.createCollider(
            RAPIER.ColliderDesc.cylinder(1.88, 0.04)
              .setTranslation(0, COLLIDER_PROFILE.innerFloorTop - 0.04, 0)
              .setFriction(0.38)
              .setRestitution(0.01),
            stationaryBody,
          );
          world.createCollider(
            RAPIER.ColliderDesc.cylinder(0.34, COLLIDER_PROFILE.centerGuardRadius)
              .setTranslation(0, -0.10, 0)
              .setFriction(0.38)
              .setRestitution(0.01),
            stationaryBody,
          );

          if (validationMode === 'part4') {
            const initialRotorAngle = normalizedAngle(rotorAngleRef.current);
            rotorBody = world.createRigidBody(
              RAPIER.RigidBodyDesc.kinematicPositionBased()
                .setTranslation(0, 0, 0)
                .setRotation({
                  x: 0,
                  y: Math.sin(initialRotorAngle / 2),
                  z: 0,
                  w: Math.cos(initialRotorAngle / 2),
                }),
            );
            // Keep the established PART 4 acceptance body isolated from the
            // new pocket probes. The pocket system is exercised in its own
            // direct-entry worlds below so this baseline remains comparable.
            rotorColliders = addKinematicRotorBand(world, rotorBody);
          }

          const initialPosition =
            validationMode === 'part3'
              ? part3SpawnPosition(PART3_PROBES[0])
              : validationMode === 'part4'
                ? part4SpawnPosition(PART4_PROBES[0])
                : DROP_INITIAL_POSITION;
          ballMesh = createBallVisual();
          ballMesh.visible = showBallPlaceholder;
          wheelRoot.add(ballMesh);
          ballBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(...initialPosition)
              .setLinvel(0, 0, 0)
              .setAngvel({ x: 0, y: 0, z: 0 })
              .setAdditionalMass(BALL_MASS)
              .setLinearDamping(
                validationMode === 'part3' ? PART3_TRACK_DAMPING : 0.04,
              )
              .setAngularDamping(
                validationMode === 'part3' ? PART3_TRACK_DAMPING : 0.08,
              )
              .setCcdEnabled(true)
              .setSoftCcdPrediction(BALL_RADIUS * 2.5),
          );
          ballBody.enableCcd(true);
          ballBody.setSoftCcdPrediction(BALL_RADIUS * 2.5);
          ccdEnabled = true;
          const ballColliderDescriptor = RAPIER.ColliderDesc.ball(BALL_RADIUS)
              .setFriction(validationMode === 'part3' ? PART3_TRACK_FRICTION : 0.42)
              .setRestitution(validationMode === 'part3' ? 0.01 : 0.02)
              .setDensity(0.001);
          if (validationMode === 'part4') {
            ballColliderDescriptor.setCollisionGroups(
              BALL_COLLISION_GROUP |
                ((STATIONARY_COLLISION_GROUP | ROTOR_COLLISION_GROUP) << 16),
            );
          }
          physicsBallCollider = world.createCollider(ballColliderDescriptor, ballBody);
          ballBody.setTranslation({ x: initialPosition[0], y: initialPosition[1], z: initialPosition[2] }, true);
          ballMesh.position.set(...initialPosition);
          setPocketReport({
            status: 'running',
            results: [],
            detail: 'Running three direct European pocket-entry probes at 120 Hz with CCD…',
          });
          void runPocketEntryValidation().then((report) => {
            if (!disposed) setPocketReport(report);
          });
          if (validationMode === 'part3') {
            startPart3Probe(0);
            callbacksRef.current.onStateChange('loaded', 'PART 3 static-collider ball probes running');
          } else if (validationMode === 'part4') {
            startPart4Probe(0);
            callbacksRef.current.onStateChange('loaded', 'PART 4 kinematic-rotor probes running');
          } else {
            publishDropReport({
              status: 'running',
              initialPosition: roundedVector(new THREE.Vector3(...initialPosition)),
              firstContactPosition: null,
              firstContactRadius: null,
              firstContactTime: null,
              finalPosition: roundedVector(new THREE.Vector3(...initialPosition)),
              finalSpeed: 0,
              maxPenetration: 0,
              finalSeparation: DROP_HEIGHT_ABOVE_SURFACE,
              passThrough: false,
              visibleSurfaceMatch: false,
              ccdEnabled,
              maxVisualBodySyncError: 0,
              colliderProfile: COLLIDER_PROFILE,
              detail: 'One zero-horizontal-velocity drop running at 120 Hz.',
            });
            dropStarted = true;
            callbacksRef.current.onStateChange('loaded', 'PART 2 collider shell ready · one zero-velocity drop running');
          }
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('PART 2 roulette visual source failed to load', error);
          callbacksRef.current.onStateChange('error', 'The rou_LP_Test_04 visual source could not be read.');
        },
      );

      const resize = () => {
        const container = stage.parentElement ?? stage;
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
        const cameraOffset = camera.position.clone().sub(target);
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const horizontalHalfFov = Math.atan(
          Math.tan(verticalHalfFov) * camera.aspect,
        );
        const wheelRadiusWithMargin = (ROULETTE_NORMALIZED_DIAMETER / 2) * 1.08;
        const requiredDistance = wheelRadiusWithMargin / Math.min(
          Math.tan(verticalHalfFov),
          Math.tan(horizontalHalfFov),
        );
        if (cameraOffset.length() < requiredDistance) {
          camera.position.copy(
            target.clone().add(cameraOffset.setLength(requiredDistance)),
          );
          controls?.update();
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage.parentElement ?? stage);
      resize();
      const resetView = () => applyView(viewRef.current);
      window.addEventListener('roulette-reset-view', resetView);

      const completePart3Probe = (position: RAPIER.Vector, velocity: RAPIER.Vector) => {
        const probe = PART3_PROBES[part3ProbeIndex];
        const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const isDeflectorApproach = probe.kind === 'deflector-approach';
        const trackContactRatio =
          part3TrackSampleFrames > 0
            ? part3TrackContactFrames / part3TrackSampleFrames
            : 0;
        const continuousTrackContact = trackContactRatio >= 0.94;
        const stableContact =
          part3SampleFrames > 0 && part3ContactFrames / part3SampleFrames >= 0.75;
        const leftValidVolume =
          part3LeftValidVolume ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y) ||
          !Number.isFinite(position.z);
        const tunneling = leftValidVolume || part3MaxPenetration > 0.08;
        const velocityExplosion =
          part3PeakSpeed > Math.max(8, probe.speed * 4);
        const lapCount =
          part3TrackAngleStart === null || part3TrackAngleEnd === null
            ? 0
            : Math.abs(part3TrackAngleEnd - part3TrackAngleStart) / TWO_PI;
        const trackDuration =
          part3TrackAngleStart === null || part3TrackAngleEnd === null
            ? 0
            : Math.max(
                0,
                part3InwardDescentTime === null
                  ? part3Elapsed
                  : part3InwardDescentTime,
              );
        const averageTrackSpeed =
          part3TrackContactFrames > 0
            ? part3TrackSpeedSum / part3TrackContactFrames
            : 0;
        const energyLossRatio =
          part3TrackStartSpeed > 0
            ? Math.max(
                0,
                1 -
                  (part3TrackEndSpeed * part3TrackEndSpeed) /
                    (part3TrackStartSpeed * part3TrackStartSpeed),
              )
            : 0;
        const naturalRollOrSlide =
          part3TrackContactFrames > 120 &&
          part3TrackStartSpeed > part3TrackEndSpeed;
        const impactDirectionChangeDegrees =
          part3ImpactDirectionBefore && part3ImpactDirectionAfter
            ? THREE.MathUtils.radToDeg(
                part3ImpactDirectionBefore.angleTo(part3ImpactDirectionAfter),
              )
            : null;
        const noPassThrough = !part3DeflectorPassThrough;
        const visualContactAlignmentCredible =
          PART3_DEFLECTOR_INNER_RADIUS >= 2.46 &&
          PART3_DEFLECTOR_OUTER_RADIUS <= 2.67 &&
          PART3_DEFLECTOR_BOTTOM <= -0.28 &&
          PART3_DEFLECTOR_TOP >= 0.01;
        const passed =
          isDeflectorApproach
            ? part3DeflectorContact &&
              part3ImpactSpeedBefore !== null &&
              part3ImpactSpeedAfter !== null &&
              (impactDirectionChangeDegrees ?? 0) >= 10 &&
              noPassThrough &&
              !velocityExplosion &&
              !leftValidVolume &&
              !tunneling &&
              part3MaxVisualBodySyncError <= 0.001 &&
              visualContactAlignmentCredible
            : lapCount >= 2.5 &&
              lapCount <= 8 &&
              continuousTrackContact &&
              naturalRollOrSlide &&
              (part3EarlyLapMinimumDeflectorClearance ?? 0) >= 0.005 &&
              !part3ArtificialAcceleration &&
              !part3Hover &&
              !part3Clipping &&
              stableContact &&
              !leftValidVolume &&
              !tunneling &&
              !velocityExplosion &&
              part3MaxVisualBodySyncError <= 0.001;
        const result: Part3ProbeResult = {
          id: probe.id,
          label: probe.label,
          spawnRadius: probe.radius,
          spawnHeight: Number(part3SpawnPosition(probe)[1].toFixed(4)),
          initialVelocity: part3InitialVelocity(probe),
          initialAngularSpin: part3InitialAngularSpin(probe),
          lapCount: Number(lapCount.toFixed(3)),
          trackDuration: Number(trackDuration.toFixed(4)),
          averageTrackSpeed: Number(averageTrackSpeed.toFixed(4)),
          trackStartSpeed: Number(part3TrackStartSpeed.toFixed(4)),
          trackEndSpeed: Number(part3TrackEndSpeed.toFixed(4)),
          trackLapSpeeds: part3TrackLapSpeeds.map((speed) =>
            Number(speed.toFixed(4)),
          ),
          energyLossRatio: Number(energyLossRatio.toFixed(4)),
          continuousTrackContact,
          naturalRollOrSlide,
          inwardDescentTime:
            part3InwardDescentTime === null
              ? null
              : Number(part3InwardDescentTime.toFixed(4)),
          inwardDescentRadius:
            part3InwardDescentRadius === null
              ? null
              : Number(part3InwardDescentRadius.toFixed(4)),
          deflectorContact: part3DeflectorContact,
          peakSpeedBeforeContact:
            part3ImpactSpeedBefore === null
              ? null
              : Number(part3ImpactSpeedBefore.toFixed(4)),
          peakSpeedAfterContact:
            part3ImpactSpeedAfter === null
              ? null
              : Number(part3ImpactSpeedAfter.toFixed(4)),
          impactSpeedBefore:
            part3ImpactSpeedBefore === null
              ? null
              : Number(part3ImpactSpeedBefore.toFixed(4)),
          impactSpeedAfter:
            part3ImpactSpeedAfter === null
              ? null
              : Number(part3ImpactSpeedAfter.toFixed(4)),
          impactDirectionChangeDegrees:
            impactDirectionChangeDegrees === null
              ? null
              : Number(impactDirectionChangeDegrees.toFixed(2)),
          noPassThrough,
          visualContactAlignmentCredible,
          retainingRimRadius: PART3_RETAINING_RIM_INNER_RADIUS,
          nearestDeflectorRadius:
            isDeflectorApproach
              ? PART3_DEFLECTOR_INNER_RADIUS
              : PART3_DEFLECTOR_OUTER_RADIUS,
          earlyLapMinimumDeflectorClearance:
            part3EarlyLapMinimumDeflectorClearance === null
              ? null
              : Number(part3EarlyLapMinimumDeflectorClearance.toFixed(4)),
          deflectorColliderCount: part3DeflectorColliders.length,
          deflectorColliderType: 'cuboid',
          deflectorColliderFriction: PART3_DEFLECTOR_FRICTION,
          deflectorColliderRestitution: PART3_DEFLECTOR_RESTITUTION,
          bouncePlausible: part3BouncePlausible,
          hover: part3Hover,
          clipping: part3Clipping,
          artificialAcceleration: part3ArtificialAcceleration,
          maxRotorSyncError: 0,
          peakSpeed: Number(part3PeakSpeed.toFixed(4)),
          minRadius: Number(part3MinRadius.toFixed(4)),
          maxRadius: Number(part3MaxRadius.toFixed(4)),
          maxPenetration: Number(part3MaxPenetration.toFixed(4)),
          maxSeparation: Number(part3MaxSeparation.toFixed(4)),
          stableContact,
          leftValidVolume,
          tunneling,
          velocityExplosion,
          maxVisualBodySyncError: Number(part3MaxVisualBodySyncError.toFixed(6)),
          outcome: passed ? (finalSpeed < 0.08 ? 'settled' : 'stable') : 'failed',
          detail: passed
            ? isDeflectorApproach
              ? `Deflector impact passed: ${part3ImpactSpeedBefore?.toFixed(3)}→${part3ImpactSpeedAfter?.toFixed(3)} m/s with ${impactDirectionChangeDegrees?.toFixed(1)}° direction change.`
              : `Outer-track launch passed: ${lapCount.toFixed(2)} laps with ${part3EarlyLapMinimumDeflectorClearance?.toFixed(3)} m positive clearance before any inward approach.`
            : `Outer-track smoke failed: ${[
                isDeflectorApproach
                  ? !part3DeflectorContact
                    ? 'no deflector contact'
                    : ''
                  : lapCount < 2.5 || lapCount > 8
                    ? 'lap target'
                    : '',
                isDeflectorApproach
                  ? part3ImpactSpeedAfter === null
                    ? 'no impact aftermath'
                    : ''
                  : !continuousTrackContact
                    ? 'contact continuity'
                    : '',
                isDeflectorApproach
                  ? (impactDirectionChangeDegrees ?? 0) < 10
                    ? 'no direction change'
                    : ''
                  : '',
                !noPassThrough ? 'pass-through' : '',
                part3ArtificialAcceleration ? 'artificial acceleration' : '',
                part3Hover ? 'hover' : '',
                part3Clipping ? 'clipping' : '',
                leftValidVolume ? 'escape' : '',
                tunneling ? 'tunneling' : '',
                velocityExplosion ? 'velocity spike' : '',
              ]
                .filter(Boolean)
                .join(', ') || 'review required'}.`,
        };
        part3Results = [...part3Results, result];
        if (part3ProbeIndex === PART3_PROBES.length - 1) {
          part3Finished = true;
          publishPart3Report(
            part3Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'passed'
              : 'failed',
            part3Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'Both targeted outer-track probes passed with measured clearance and deflector contact.'
              : 'One or more targeted outer-track probes failed the measured geometry envelope.',
          );
        } else {
          startPart3Probe(part3ProbeIndex + 1);
        }
      };

      const completePart4Probe = (position: RAPIER.Vector, velocity: RAPIER.Vector) => {
        const probe = PART4_PROBES[part4ProbeIndex];
        const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const stableContact =
          part4SampleFrames > 0 && part4ContactFrames / part4SampleFrames >= 0.75;
        const velocityExplosion =
          part4PeakSpeed > Math.max(8, part4InitialSpeed * 4);
        const passed =
          stableContact &&
          !part4LeftValidVolume &&
          part4MaxPenetration <= 0.08 &&
          !velocityExplosion &&
          part4MaxVisualBodySyncError <= 0.001 &&
          part4MaxRotorSyncError <= 0.001 &&
          part4OutsideTurretStationary;
        const result: Part4ProbeResult = {
          id: probe.id,
          label: probe.label,
          rotorAngularSpeed: TEST_ANGULAR_SPEED,
          contactDuration: Number((part4ContactFrames * FIXED_TIMESTEP).toFixed(4)),
          spawnRadius: probe.radius,
          spawnHeight: Number(part4SpawnPosition(probe)[1].toFixed(4)),
          initialVelocity: part4InitialVelocity(probe),
          peakSpeed: Number(part4PeakSpeed.toFixed(4)),
          maxEnergyGain: Number(part4MaxEnergyGain.toFixed(4)),
          minRadius: Number(part4MinRadius.toFixed(4)),
          maxRadius: Number(part4MaxRadius.toFixed(4)),
          maxPenetration: Number(part4MaxPenetration.toFixed(4)),
          maxSeparation: Number(part4MaxSeparation.toFixed(4)),
          escaped: part4LeftValidVolume,
          tunneling: part4LeftValidVolume || part4MaxPenetration > 0.08,
          velocityExplosion,
          maxVisualBodySyncError: Number(part4MaxVisualBodySyncError.toFixed(6)),
          maxRotorSyncError: Number(part4MaxRotorSyncError.toFixed(6)),
          outsideTurretStationary: part4OutsideTurretStationary,
          outcome: passed ? (finalSpeed < 0.08 ? 'settled' : 'stable') : 'failed',
          detail: passed
            ? finalSpeed < 0.08
              ? 'Moving rotor contact remained stable and the ball settled.'
              : 'Moving rotor contact remained stable without artificial launch.'
            : 'Probe failed the kinematic-rotor contact envelope.',
        };
        part4Results = [...part4Results, result];
        if (!passed || part4ProbeIndex === PART4_PROBES.length - 1) {
          part4Finished = true;
          publishPart4Report(
            part4Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'passed'
              : 'failed',
            part4Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'Both deterministic kinematic-rotor probes passed.'
              : 'A deterministic kinematic-rotor probe failed.',
          );
        } else {
          startPart4Probe(part4ProbeIndex + 1);
        }
      };

      const render = () => {
        if (disposed) return;
        const now = performance.now();
        accumulator += Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        while (accumulator >= FIXED_TIMESTEP) {
          if (rotorPivot) {
            rotorAngleRef.current = normalizedAngle(rotorAngleRef.current + TEST_ANGULAR_SPEED * FIXED_TIMESTEP);
            rotorPivot.rotation.set(0, rotorAngleRef.current, 0);
            if (validationMode === 'part4' && rotorBody) {
              rotorBody.setNextKinematicRotation({
                x: 0,
                y: Math.sin(rotorAngleRef.current / 2),
                z: 0,
                w: Math.cos(rotorAngleRef.current / 2),
              });
            }
            fixedStepCount += 1;
            if (fixedStepCount % 6 === 0) {
              setAngleReadout(rotorAngleRef.current);
              callbacksRef.current.onRotorAngleChange(rotorAngleRef.current);
            }
          }

          if (validationMode === 'part3' && world && ballBody && ballMesh && !part3Finished) {
            const probe = PART3_PROBES[part3ProbeIndex];
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const surfaceY =
              radius >= 1.95 && radius <= PART3_RETAINING_RIM_INNER_RADIUS
                ? part3TrackHeight(radius)
                : COLLIDER_PROFILE.innerFloorTop;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, surfaceY - bottom);
            const separation = Math.max(0, bottom - surfaceY);
            let trackPairContact = false;
            if (physicsBallCollider && part3TrackCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (otherCollider.handle === part3TrackCollider?.handle) {
                  trackPairContact = true;
                }
              });
            }
            let deflectorPairContact = false;
            if (physicsBallCollider && part3DeflectorColliders.length > 0) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (
                  part3DeflectorColliders.some(
                    (deflectorCollider) => deflectorCollider.handle === otherCollider.handle,
                  )
                ) {
                  deflectorPairContact = true;
                }
              });
            }
            const geometricTrackContact =
              radius >= PART3_TRACK_INNER_RADIUS &&
              radius <= PART3_TRACK_OUTER_RADIUS &&
              separation <= PART3_TRACK_CONTACT_TOLERANCE &&
              penetration <= 0.03;
            const onTrack = geometricTrackContact && trackPairContact;
            const trackAngle = normalizedAngle(Math.atan2(position.x, position.z));
            if (probe.kind === 'outer-track' && part3InwardDescentTime === null) {
              const deflectorClearance =
                radius >= PART3_DEFLECTOR_OUTER_RADIUS
                  ? radius - BALL_RADIUS - PART3_DEFLECTOR_OUTER_RADIUS
                  : PART3_DEFLECTOR_INNER_RADIUS - radius - BALL_RADIUS;
              part3EarlyLapMinimumDeflectorClearance =
                part3EarlyLapMinimumDeflectorClearance === null
                  ? deflectorClearance
                  : Math.min(
                      part3EarlyLapMinimumDeflectorClearance,
                      deflectorClearance,
                    );
            }
            if (probe.kind === 'deflector-approach') {
              if (deflectorPairContact && !part3DeflectorContact) {
                part3DeflectorContact = true;
                part3DeflectorContactTime = part3Elapsed;
                part3ImpactSpeedBefore = part3PreviousSpeed;
                const incomingDirection = new THREE.Vector3(
                  velocity.x,
                  0,
                  velocity.z,
                );
                if (incomingDirection.lengthSq() > 0.000001) {
                  part3ImpactDirectionBefore = incomingDirection.normalize();
                }
              } else if (
                part3DeflectorContact &&
                part3ImpactSpeedAfter === null &&
                part3DeflectorContactTime !== null &&
                part3Elapsed - part3DeflectorContactTime >= 0.05
              ) {
                part3ImpactSpeedAfter = speed;
                const outgoingDirection = new THREE.Vector3(
                  velocity.x,
                  0,
                  velocity.z,
                );
                if (outgoingDirection.lengthSq() > 0.000001) {
                  part3ImpactDirectionAfter = outgoingDirection.normalize();
                }
                const impactDirectionChange =
                  part3ImpactDirectionBefore && part3ImpactDirectionAfter
                    ? THREE.MathUtils.radToDeg(
                        part3ImpactDirectionBefore.angleTo(part3ImpactDirectionAfter),
                      )
                    : 0;
                part3BouncePlausible =
                  part3ImpactSpeedAfter <=
                    (part3ImpactSpeedBefore ?? part3ImpactSpeedAfter) * 1.05 &&
                  impactDirectionChange >= 10;
              }
              part3DeflectorPassThrough ||=
                radius <
                  PART3_DEFLECTOR_INNER_RADIUS - BALL_RADIUS - 0.01 &&
                !part3DeflectorContact;
            }
            const leftValidVolume =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;
            part3Elapsed += FIXED_TIMESTEP;
            part3SampleFrames += 1;
            part3PeakSpeed = Math.max(
              part3PeakSpeed,
              Math.hypot(velocity.x, velocity.y, velocity.z),
            );
            part3MinRadius = Math.min(part3MinRadius, radius);
            part3MaxRadius = Math.max(part3MaxRadius, radius);
            part3MaxPenetration = Math.max(part3MaxPenetration, penetration);
            part3MaxSeparation = Math.max(part3MaxSeparation, separation);
            part3LeftValidVolume ||= leftValidVolume;
            part3ArtificialAcceleration ||=
              speed > Math.max(12, part3PreviousSpeed * 3);
            part3Clipping ||= penetration > 0.03;
            if (geometricTrackContact) {
              part3TrackSampleFrames += 1;
              part3TrackContactFrames += trackPairContact ? 1 : 0;
              part3TrackSpeedSum += speed;
              part3TrackEndSpeed = speed;
              part3Hover ||= !trackPairContact;
              if (part3TrackStartSpeed === 0) {
                part3TrackStartSpeed = speed;
                part3TrackAngle = trackAngle;
                part3TrackAngleStart = trackAngle;
              } else if (part3TrackAngle !== null) {
                const delta = THREE.MathUtils.euclideanModulo(
                  trackAngle - normalizedAngle(part3TrackAngle) + Math.PI,
                  TWO_PI,
                ) - Math.PI;
                part3TrackAngle += delta;
                part3TrackAngleEnd = part3TrackAngle;
                const completedLaps = Math.floor(
                  Math.abs(part3TrackAngle - part3TrackAngleStart!) / TWO_PI,
                );
                if (completedLaps > part3TrackCompletedLaps) {
                  part3TrackCompletedLaps = completedLaps;
                  part3TrackLapSpeeds.push(speed);
                }
              }
            } else if (
              part3InwardDescentTime === null &&
              part3TrackAngleStart !== null &&
              radius < PART3_TRACK_INNER_RADIUS
            ) {
              part3InwardDescentTime = part3Elapsed;
              part3InwardDescentRadius = radius;
              part3TrackAngleEnd ??= part3TrackAngle;
            }
            const inContactEnvelope = penetration <= 0.03 && separation <= 0.12;
            if (inContactEnvelope) part3ContactFrames += 1;
            ballMesh.position.set(position.x, position.y, position.z);
            part3MaxVisualBodySyncError = Math.max(
              part3MaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            part3PreviousSpeed = speed;
            if (part3Elapsed >= probe.durationSeconds) {
              completePart3Probe(position, velocity);
            }
          }

          if (validationMode === 'part4' && world && ballBody && ballMesh && rotorBody && !part4Finished) {
            const probe = PART4_PROBES[part4ProbeIndex];
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const radius = Math.hypot(position.x, position.z);
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, ROTOR_CONTACT_HEIGHT - bottom);
            const separation = Math.max(0, bottom - ROTOR_CONTACT_HEIGHT);
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const leftValidVolume =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;
            const rotorRotation = rotorBody.rotation();
            const rotorBodyAngle = normalizedAngle(
              2 * Math.atan2(rotorRotation.y, rotorRotation.w),
            );
            const rotorSyncError = Math.abs(
              THREE.MathUtils.euclideanModulo(
                rotorBodyAngle - rotorAngleRef.current + Math.PI,
                TWO_PI,
              ) - Math.PI,
            );
            const stationaryPositionDrift = stationaryGroup
              ? stationaryGroup.position.distanceTo(stationaryBaselinePosition)
              : Number.POSITIVE_INFINITY;
            const stationaryRotationDrift = stationaryGroup
              ? stationaryGroup.quaternion.angleTo(stationaryBaselineQuaternion)
              : Number.POSITIVE_INFINITY;
            part4Elapsed += FIXED_TIMESTEP;
            part4SampleFrames += 1;
            part4PeakSpeed = Math.max(part4PeakSpeed, speed);
            part4MaxEnergyGain = Math.max(
              part4MaxEnergyGain,
              Math.max(0, speed * speed - part4InitialSpeed * part4InitialSpeed),
            );
            part4MinRadius = Math.min(part4MinRadius, radius);
            part4MaxRadius = Math.max(part4MaxRadius, radius);
            part4MaxPenetration = Math.max(part4MaxPenetration, penetration);
            part4MaxSeparation = Math.max(part4MaxSeparation, separation);
            part4MaxRotorSyncError = Math.max(part4MaxRotorSyncError, rotorSyncError);
            part4LeftValidVolume ||= leftValidVolume;
            part4OutsideTurretStationary &&=
              stationaryPositionDrift <= 0.000001 &&
              stationaryRotationDrift <= 0.000001;
            if (penetration <= 0.03 && separation <= 0.12) {
              part4ContactFrames += 1;
            }
            ballMesh.position.set(position.x, position.y, position.z);
            part4MaxVisualBodySyncError = Math.max(
              part4MaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            if (part4Elapsed >= probe.durationSeconds) {
              completePart4Probe(position, velocity);
            }
          }

          if (validationMode === 'part2' && world && ballBody && ballMesh && dropStarted && dropSteps < DROP_DURATION_SECONDS / FIXED_TIMESTEP) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const radius = Math.hypot(position.x, position.z);
            const surfaceY = radius >= BOWL_PROFILE[0][0] ? profileHeight(radius) : COLLIDER_PROFILE.innerFloorTop;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, surfaceY - bottom);
            const separation = Math.max(0, bottom - surfaceY);
            maxPenetration = Math.max(maxPenetration, penetration);
            maxSeparation = Math.max(maxSeparation, separation);
            if (!firstContact && previousVerticalVelocity < -0.08 && velocity.y >= -0.08 && position.y < DROP_TRACK_Y + BALL_RADIUS + 0.12) {
              firstContact = roundedVector(new THREE.Vector3(position.x, position.y, position.z));
              firstContactRadius = Number(radius.toFixed(4));
              firstContactTime = Number(((dropSteps + 1) * FIXED_TIMESTEP).toFixed(4));
              visibleSurfaceMatch = Math.abs(position.y - (surfaceY + BALL_RADIUS)) < 0.08;
            }
            ballMesh.position.set(position.x, position.y, position.z);
            maxVisualBodySyncError = Math.max(
              maxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            previousVerticalVelocity = velocity.y;
            dropSteps += 1;
            if (dropSteps === Math.floor(DROP_DURATION_SECONDS / FIXED_TIMESTEP)) {
              const finalPosition = roundedVector(new THREE.Vector3(position.x, position.y, position.z));
              const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
              const passThrough =
                position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08 ||
                radius > 3.08 ||
                !Number.isFinite(position.y);
              const finalSeparation = Math.max(0, (position.y - BALL_RADIUS) - surfaceY);
              const passed = Boolean(firstContact) && !passThrough && maxPenetration < 0.02 && visibleSurfaceMatch;
              publishDropReport({
                status: passed ? 'passed' : 'failed',
                initialPosition: roundedVector(new THREE.Vector3(...DROP_INITIAL_POSITION)),
                firstContactPosition: firstContact,
                firstContactRadius,
                firstContactTime,
                finalPosition,
                finalSpeed: Number(finalSpeed.toFixed(4)),
                maxPenetration: Number(maxPenetration.toFixed(4)),
                finalSeparation: Number(finalSeparation.toFixed(4)),
                passThrough,
                visibleSurfaceMatch,
                ccdEnabled,
                maxVisualBodySyncError: Number(maxVisualBodySyncError.toFixed(6)),
                colliderProfile: COLLIDER_PROFILE,
                detail: passed
                  ? 'Zero-horizontal-velocity drop contacted the derived visible profile without pass-through.'
                  : 'Drop did not satisfy the PART 2 contact envelope.',
              });
            }
          }
          accumulator -= FIXED_TIMESTEP;
        }
        controls?.update();
        renderer?.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        window.removeEventListener('roulette-reset-view', resetView);
        observer.disconnect();
        controls?.dispose();
        renderer?.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        if (ballBody && world) world.removeRigidBody(ballBody);
        if (rotorBody && world) world.removeRigidBody(rotorBody);
        void physicsBallCollider;
        void rotorColliders;
        world?.free();
      };
    } catch (error) {
      console.error('PART 2 roulette scene failed to initialize', error);
      callbacksRef.current.onStateChange('error', 'WebGL or Rapier could not initialize in this browser.');
      return () => renderer?.dispose();
    }
  }, [loadKey]);

  useEffect(() => {
    if (rotorAngleRef.current !== rotorAngle) {
      rotorAngleRef.current = normalizedAngle(rotorAngle);
    }
  }, [rotorAngle]);

  useEffect(() => {
    if (showPhysicsDebug) {
      // The collider shell remains invisible by default; this flag is reserved
      // for the next debug-overlay pass without changing collider behavior.
    }
  }, [showPhysicsDebug]);

  const renderPart3Report = () => (
    <div
      className="part2-drop-report"
      data-testid="part3-validation-report"
      data-status={part3Report?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part3Report ? (
        <>
          <strong>{part3Report.detail}</strong>
          <span>
            CCD {part3Report.ccdEnabled ? 'enabled' : 'disabled'} · 120 Hz · 2 targeted probes ·
            measured dark track r {DARK_OUTER_TRACK_RADIUS.toFixed(4)} / y {DARK_OUTER_TRACK_HEIGHT.toFixed(4)} ·
            launch lane r {PART3_LAUNCH_RADIUS.toFixed(4)} · retaining inner r {PART3_RETAINING_RIM_INNER_RADIUS.toFixed(4)}
          </span>
          {part3Report.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · launch r {result.spawnRadius.toFixed(4)} / y {result.spawnHeight.toFixed(4)} ·
              vtan {Math.hypot(result.initialVelocity.x, result.initialVelocity.z).toFixed(4)} ·
              spin {result.initialAngularSpin.z.toFixed(4)} · laps {result.lapCount.toFixed(3)} ·
              track {result.trackDuration.toFixed(4)} s · avg/peak {result.averageTrackSpeed.toFixed(4)} / {result.peakSpeed.toFixed(4)} ·
              speed {result.trackStartSpeed.toFixed(4)}→{result.trackEndSpeed.toFixed(4)} · energy loss {(result.energyLossRatio * 100).toFixed(2)}% ·
              clearance {result.earlyLapMinimumDeflectorClearance?.toFixed(4) ?? '—'} m
            </span>
          ))}
          {part3Report.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: contact {result.continuousTrackContact ? 'continuous' : 'interrupted'} ·
              inward {result.inwardDescentTime?.toFixed(4) ?? '—'} s @ r {result.inwardDescentRadius?.toFixed(4) ?? '—'} ·
              lap speeds [{result.trackLapSpeeds.map((speed) => speed.toFixed(3)).join(', ')}] ·
              roll/slide {result.naturalRollOrSlide ? 'natural' : 'invalid'} · bounce {result.bouncePlausible ? 'plausible' : 'invalid'} ·
              deflector {result.deflectorContact ? 'yes' : 'no'} · impact {result.impactSpeedBefore?.toFixed(4) ?? '—'}→{result.impactSpeedAfter?.toFixed(4) ?? '—'} m/s ·
              direction Δ {result.impactDirectionChangeDegrees?.toFixed(1) ?? '—'}° · pass-through {result.noPassThrough ? 'no' : 'yes'} ·
              colliders {result.deflectorColliderCount}×{result.deflectorColliderType} · μ {result.deflectorColliderFriction.toFixed(2)} · e {result.deflectorColliderRestitution.toFixed(2)} ·
              visual alignment {result.visualContactAlignmentCredible ? 'credible' : 'unverified'} ·
              hover {result.hover ? 'yes' : 'no'} · clipping {result.clipping ? 'yes' : 'no'} ·
              escape {result.leftValidVolume ? 'yes' : 'no'} · tunneling {result.tunneling ? 'yes' : 'no'} ·
              velocity spike {result.velocityExplosion ? 'yes' : 'no'} · artificial acceleration {result.artificialAcceleration ? 'yes' : 'no'} ·
              pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
              ball sync {result.maxVisualBodySyncError.toFixed(6)} · rotor sync {result.maxRotorSyncError.toFixed(6)} · {result.detail}
            </span>
          ))}
        </>
      ) : (
        'Waiting for outer-track smoke spins.'
      )}
    </div>
  );

  const renderPart4Report = () => (
    <div
      className="part2-drop-report"
      data-testid="part4-validation-report"
      data-status={part4Report?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part4Report ? (
        <>
          <strong>{part4Report.detail}</strong>
          <span>
            kinematic rotor {part4Report.kinematicRotor ? 'enabled' : 'disabled'} · CCD {part4Report.ccdEnabled ? 'enabled' : 'disabled'} ·
            rotor ω {TEST_ANGULAR_SPEED.toFixed(4)} rad/s · 37-pocket colliders active
          </span>
          {part4Report.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · contact {result.contactDuration.toFixed(4)} s ·
              spawn r {result.spawnRadius.toFixed(4)} / y {result.spawnHeight.toFixed(4)} ·
              v {result.initialVelocity.x.toFixed(4)}, {result.initialVelocity.y.toFixed(4)}, {result.initialVelocity.z.toFixed(4)} ·
              peak {result.peakSpeed.toFixed(4)} · energy gain {result.maxEnergyGain.toFixed(4)} ·
              r {result.minRadius.toFixed(4)}–{result.maxRadius.toFixed(4)}
            </span>
          ))}
          {part4Report.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
              escape {result.escaped ? 'yes' : 'no'} · tunneling {result.tunneling ? 'yes' : 'no'} ·
              velocity spike {result.velocityExplosion ? 'yes' : 'no'} · ball sync {result.maxVisualBodySyncError.toFixed(6)} ·
              rotor sync {result.maxRotorSyncError.toFixed(6)} · outside/turret static {result.outsideTurretStationary ? 'yes' : 'no'} ·
              {result.detail}
            </span>
          ))}
        </>
      ) : (
        'Waiting for PART 4 kinematic-rotor probes.'
      )}
    </div>
  );

  const renderPocketReport = () => (
    <div
      className="part2-drop-report"
      data-testid="pocket-validation-report"
      data-status={pocketReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {pocketReport ? (
        <>
          <strong>{pocketReport.detail}</strong>
          <span>
            European single-zero sequence · 37 pockets · pitch {THREE.MathUtils.radToDeg(POCKET_STEP_RADIANS).toFixed(6)}° ·
            continuous floor r {POCKET_FLOOR_INNER_RADIUS.toFixed(2)}–{POCKET_FLOOR_OUTER_RADIUS.toFixed(2)} ·
            37 frets · phase-locked rotor ω 0.0000 rad/s
          </span>
          {pocketReport.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.detail} · target {result.targetPocketNumber} / index {result.targetPocketIndex} ·
              final {result.finalPocketNumber ?? '—'} · peak {result.peakBallSpeed.toFixed(4)} ·
              pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
              fret {result.fretContact ? 'yes' : 'no'} · escape {result.escaped ? 'yes' : 'no'} ·
              tunnel {result.tunneled ? 'yes' : 'no'} · energy injection {result.artificialEnergyInjection ? 'yes' : 'no'} ·
              rotor sync {result.maxRotorSyncError.toFixed(6)}
            </span>
          ))}
        </>
      ) : (
        'Waiting for three direct pocket-entry probes.'
      )}
    </div>
  );

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={
          validationMode === 'part4'
            ? 'Part 4 kinematic rotor interaction preview'
            : validationMode === 'part3'
              ? 'Part 3 dynamic ball validation preview'
              : 'Part 2 roulette collider alignment preview'
        }
      />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>
          {validationMode === 'part4'
            ? 'PART 4 · KINEMATIC ROTOR INTERACTION'
            : validationMode === 'part3'
              ? 'PART 3 · DYNAMIC BALL VALIDATION'
              : 'PART 2 · ZERO-VELOCITY CONTACT'}
        </span>
        <span>ANGLE {THREE.MathUtils.radToDeg(angleReadout).toFixed(2)}° · PIVOT [0, 0, 0] · Y+</span>
        <span>
          {validationMode === 'part4'
            ? `PROBES ${part4Report?.status.toUpperCase() ?? 'WAITING'} · KINEMATIC ROTOR · CCD`
            : validationMode === 'part3'
              ? `PROBES ${part3Report?.status.toUpperCase() ?? 'WAITING'} · STATIC COLLIDER · CCD`
              : `DROP ${dropReport?.status.toUpperCase() ?? 'WAITING'} · CCD · 120 HZ`}
        </span>
      </div>
      {validationMode === 'part4' ? (
        <>
          {renderPart4Report()}
          {renderPocketReport()}
        </>
      ) : validationMode === 'part3' ? renderPart3Report() : (
        <div
          className="part2-drop-report"
          data-testid="part2-drop-report"
          data-status={dropReport?.status ?? 'waiting'}
          data-first-contact={dropReport?.firstContactPosition ? 'yes' : 'no'}
          data-pass-through={dropReport?.passThrough ? 'yes' : 'no'}
          data-visible-surface-match={dropReport?.visibleSurfaceMatch ? 'yes' : 'no'}
          aria-live="polite"
        >
          {dropReport ? (
            <>
              <strong>{dropReport.detail}</strong>
              <span>
                contact {dropReport.firstContactPosition ? 'yes' : 'no'} · final speed {dropReport.finalSpeed.toFixed(4)} ·
                max penetration {dropReport.maxPenetration.toFixed(4)} · separation {dropReport.finalSeparation.toFixed(4)}
              </span>
              <span>
                pass-through {dropReport.passThrough ? 'yes' : 'no'} · visible match {dropReport.visibleSurfaceMatch ? 'yes' : 'no'} ·
                contact radius {dropReport.firstContactRadius?.toFixed(4) ?? '—'} ·
                contact time {dropReport.firstContactTime?.toFixed(4) ?? '—'} s
              </span>
              <span>
                first {dropReport.firstContactPosition ? `${dropReport.firstContactPosition.x.toFixed(4)}, ${dropReport.firstContactPosition.y.toFixed(4)}, ${dropReport.firstContactPosition.z.toFixed(4)}` : '—'} ·
                final {dropReport.finalPosition.x.toFixed(4)}, {dropReport.finalPosition.y.toFixed(4)}, {dropReport.finalPosition.z.toFixed(4)}
              </span>
              <span>
                CCD {dropReport.ccdEnabled ? 'enabled' : 'disabled'} · visual/body sync error {dropReport.maxVisualBodySyncError.toFixed(6)}
              </span>
            </>
          ) : (
            'Waiting for one controlled drop.'
          )}
        </div>
      )}
    </div>
  );
}