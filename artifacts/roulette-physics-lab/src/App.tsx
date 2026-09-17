import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  getGetPhysicsLabCurrentRoundQueryKey,
  useCreatePhysicsLabRound,
  useGetPhysicsLabCurrentRound,
  type PhysicsLabRound,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Crosshair,
  Download,
  Eye,
  Grid3X3,
  Layers3,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Ruler,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';

const ASSET_PATH = '/physics-lab/roulette-visual-source.glb';
const TARGET_WHEEL_DIAMETER = 6;
const SOURCE_BALL_NODE = 'Sphere_16';
const METERS_PER_WORLD_UNIT = 1 / 6;
const WORLD_UNITS_PER_METER = 6;
const SECTOR_COUNT = 37;
const SECTOR_STEP_RADIANS = (Math.PI * 2) / SECTOR_COUNT;
const FIXED_TIMESTEP = 1 / 120;
const BALL_RADIUS = 0.056;
const ROTOR_RADIUS = 1.72;
const OUTER_TRACK_RADIUS = 2.48;
const OUTER_TRACK_CENTER_Y = 0.61;
const OUTER_TRACK_HALF_HEIGHT = 0.045;
const OUTER_TRACK_TILT = -0.08;
const OUTER_TRACK_LAUNCH_CLEARANCE = 0.003;
const OUTER_TRACK_SURFACE_Y =
  OUTER_TRACK_CENTER_Y + OUTER_TRACK_HALF_HEIGHT;
const OUTER_TRACK_FLOOR_RADIUS = 2.5;
const OUTER_TRACK_WALL_RADIUS = 2.531;
const OUTER_TRACK_WALL_SEGMENTS = 512;
const OUTER_TRACK_WALL_CAPSULE_RADIUS =
  (OUTER_TRACK_WALL_RADIUS * Math.PI) / OUTER_TRACK_WALL_SEGMENTS;
const OUTER_TRACK_WALL_CENTER_RADIUS =
  OUTER_TRACK_WALL_RADIUS + OUTER_TRACK_WALL_CAPSULE_RADIUS;
// The normalized GLB's measured outer-track contact surface is y=-0.425.
// Keep the collider model in its validated local coordinates, then apply this
// one rigid world-space translation to every stationary collider and release
// position. This moves the geometry, not just the rendered ball.
const RENDERED_OUTER_TRACK_SURFACE_Y = -0.425;
const PHYSICS_Y_OFFSET =
  RENDERED_OUTER_TRACK_SURFACE_Y - OUTER_TRACK_SURFACE_Y;
const OUTER_TRACK_CONTACT_TOLERANCE = 0.018;
const OUTER_TRACK_RADIAL_TOLERANCE = 0.06;
const BALL_VALIDATION_TEST_COUNT = 100;
const PART4_SPIN_TEST_COUNT = 20;
const PART5_SPIN_TEST_COUNT = 100;
const PART5_DURATION_LIMIT_SECONDS = 24;
const PART5_STABLE_WINDOW_FRAMES = 180;
const PART5_DEBUG_SAMPLE_COUNT = 5;
const BALL_COLLISION_GROUP = 0x0001;
const STATIONARY_COLLISION_GROUP = 0x0002;
const ROTOR_COLLISION_GROUP = 0x0004;
const DEFAULT_BALL_PARAMETERS = {
  radius: BALL_RADIUS,
  mass: 0.0027,
  friction: 0.005,
  restitution: 0,
  linearDamping: 0.002,
  angularDamping: 0.03,
  initialAngularVelocity: 230,
} as const;
const DEFAULT_ROTOR_PARAMETERS = {
  initialAngularVelocity: 2.4,
  angularDamping: 0.22,
  mass: 3.2,
} as const;
const DEFAULT_LAUNCH_PARAMETERS = {
  speed: 13,
  angle: 0,
  initialSpin: 230,
  variation: 0.005,
} as const;
const EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const PHYSICAL_MEASUREMENTS = [
  { label: 'Overall diameter', value: '1.000 m', detail: '6.000 normalized world units' },
  { label: 'Outer wheel radius', value: '0.500 m', detail: 'main visual radius 0.5001 m' },
  { label: 'Ball-track radius', value: '0.440 m', detail: 'deflector band 0.4309–0.4488 m' },
  { label: 'Bowl transition', value: '0.300 m', detail: 'visual slope band around 0.280–0.320 m' },
  { label: 'Rotor outer radius', value: '0.421 m', detail: 'rotor presentation maximum' },
  { label: 'Number / pocket ring', value: '0.323 m', detail: 'number glyph band center 0.2948–0.3504 m' },
  { label: 'Pocket width / depth', value: '0.049 / 0.055 m', detail: '37-sector pitch / radial visual estimate' },
  { label: 'Fret / deflector height', value: '0.015 m', detail: 'measured 0.012–0.016 m relief' },
  { label: 'Spindle reference', value: '0, 0, 0', detail: 'Y+ axis through exact pivot' },
];

type LoadState = 'loading' | 'loaded' | 'error';
type InspectionView = 'top' | 'angled' | 'side';
type ProbeOutcome = 'resting' | 'leak' | 'pass-through' | 'trap';
type BallCommandKind = 'apply' | 'release' | 'varied' | 'reset';

type BallPhysicsParameters = {
  radius: number;
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  initialAngularVelocity: number;
};

type BallCommand = {
  kind: BallCommandKind;
  token: number;
};

type ColliderSpec = {
  id: string;
  label: string;
  body: 'stationary' | 'rotor';
  position: [number, number, number];
  halfExtents: [number, number, number];
  rotation: [number, number, number, number];
  color: string;
  shape?: 'box' | 'outer-track-floor' | 'outer-track-wall-capsule';
};

type ColliderBuckets = {
  outerTrack: RAPIER.Collider[];
  deflectors: RAPIER.Collider[];
  frets: RAPIER.Collider[];
  pocketGeometry: RAPIER.Collider[];
};

type ProbeResult = {
  id: string;
  label: string;
  outcome: ProbeOutcome;
  pocket: number | null;
  finalRadius: number;
  finalHeight: number;
  finalSpeed: number;
  detail: string;
};

type PhysicsReport = {
  status: 'idle' | 'running' | 'passed' | 'failed';
  colliderCount: number;
  stationaryCount: number;
  rotorCount: number;
  probeCount: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  detail: string;
  results: ProbeResult[];
};

type BallTestResult = {
  id: string;
  label: string;
  passed: boolean;
  rebound: boolean;
  directionChanged: boolean;
  stable: boolean;
  tunneled: boolean;
  velocitySpike: boolean;
  trapped: boolean;
  angledResponse: boolean;
  maxSpeed: number;
  finalSpeed: number;
  finalRadius: number;
  finalHeight: number;
  detail: string;
};

type BallValidationReport = {
  status: 'idle' | 'running' | 'passed' | 'failed';
  testCount: number;
  passedCount: number;
  failedCount: number;
  reboundCount: number;
  directionChangeCount: number;
  stableSettlingCount: number;
  angledResponseCount: number;
  tunnelingCount: number;
  velocitySpikeCount: number;
  trapCount: number;
  maxObservedSpeed: number;
  durationMs: number;
  detail: string;
  results: BallTestResult[];
};

type RotorPhysicsParameters = {
  initialAngularVelocity: number;
  angularDamping: number;
  mass: number;
};

type BallLaunchParameters = {
  speed: number;
  angle: number;
  initialSpin: number;
  variation: number;
};

type Part4SpinResult = {
  id: string;
  completed: boolean;
  durationSeconds: number;
  rotorInitialSpeed: number;
  rotorFinalSpeed: number;
  ballInitialSpeed: number;
  ballFinalSpeed: number;
  maxBallSpeed: number;
  finalRadius: number;
  finalHeight: number;
  pathVariance: number;
  pathSignature: string;
  movingContactEnergy: boolean;
  outerTrackContactAtLaunch: boolean;
  outerTrackContactFrames: number;
  outerTrackPhaseFrames: number;
  floatingOuterTrackFrames: number;
  rotorWobble: boolean;
  tunneled: boolean;
  velocityExplosion: boolean;
  invalidTrap: boolean;
  detail: string;
};

type Part4ValidationReport = {
  status: 'idle' | 'running' | 'passed' | 'failed';
  testCount: number;
  completedCount: number;
  movingContactEnergyCount: number;
  outerTrackLaunchContactCount: number;
  outerTrackContactPassCount: number;
  floatingOuterTrackCount: number;
  rotorWobbleCount: number;
  tunnelingCount: number;
  velocityExplosionCount: number;
  invalidTrapCount: number;
  repeatedPathCount: number;
  fixedRadiusCount: number;
  independentSlowdownCount: number;
  fpsIndependent: boolean;
  medianDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  durationMs: number;
  detail: string;
  results: Part4SpinResult[];
};

type Part5SpinResult = {
  id: string;
  completed: boolean;
  chainComplete: boolean;
  outerTrackEntered: boolean;
  outerTrackLaps: number;
  naturalTrackExit: boolean;
  energyLossObserved: boolean;
  inwardMovementObserved: boolean;
  deflectorHit: boolean;
  movingFretContact: boolean;
  pocketInteraction: boolean;
  pocketChangeCount: number;
  bounceCount: number;
  settleSeconds: number;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  finalRadius: number;
  finalHeight: number;
  finalSpeed: number;
  finalAngularSpeed: number;
  pathVariance: number;
  maxBallSpeed: number;
  timeout: boolean;
  escaped: boolean;
  nanDetected: boolean;
  permanentTrap: boolean;
  impossibleRestingState: boolean;
  tunneling: boolean;
  velocityExplosion: boolean;
  pathSignature: string;
  debugTraceCaptured: boolean;
  detail: string;
};

type Part5ValidationReport = {
  status: 'idle' | 'running' | 'passed' | 'failed';
  testCount: number;
  completedCount: number;
  chainCompleteCount: number;
  outerTrackCount: number;
  energyLossCount: number;
  inwardMovementCount: number;
  deflectorHitCount: number;
  movingFretContactCount: number;
  pocketInteractionCount: number;
  pocketChangeCount: number;
  bounceCount: number;
  timeoutCount: number;
  escapeCount: number;
  nanCount: number;
  permanentTrapCount: number;
  impossibleRestingCount: number;
  tunnelingCount: number;
  velocityExplosionCount: number;
  repeatedPathCount: number;
  fixedRadiusCount: number;
  settleTimesInTarget: number;
  slowMotionDebugSampleCount: number;
  medianSettleSeconds: number;
  minSettleSeconds: number;
  maxSettleSeconds: number;
  durationMs: number;
  detail: string;
  results: Part5SpinResult[];
};

const EMPTY_PHYSICS_REPORT: PhysicsReport = {
  status: 'idle',
  colliderCount: 0,
  stationaryCount: 0,
  rotorCount: 0,
  probeCount: 0,
  passedCount: 0,
  failedCount: 0,
  durationMs: 0,
  detail: 'Collider model is waiting for the normalized source.',
  results: [],
};

const EMPTY_BALL_REPORT: BallValidationReport = {
  status: 'idle',
  testCount: 0,
  passedCount: 0,
  failedCount: 0,
  reboundCount: 0,
  directionChangeCount: 0,
  stableSettlingCount: 0,
  angledResponseCount: 0,
  tunnelingCount: 0,
  velocitySpikeCount: 0,
  trapCount: 0,
  maxObservedSpeed: 0,
  durationMs: 0,
  detail: 'The dynamic ball is waiting for a release test.',
  results: [],
};

const EMPTY_PART4_REPORT: Part4ValidationReport = {
  status: 'idle',
  testCount: 0,
  completedCount: 0,
  movingContactEnergyCount: 0,
  outerTrackLaunchContactCount: 0,
  outerTrackContactPassCount: 0,
  floatingOuterTrackCount: 0,
  rotorWobbleCount: 0,
  tunnelingCount: 0,
  velocityExplosionCount: 0,
  invalidTrapCount: 0,
  repeatedPathCount: 0,
  fixedRadiusCount: 0,
  independentSlowdownCount: 0,
  fpsIndependent: true,
  medianDurationSeconds: 0,
  minDurationSeconds: 0,
  maxDurationSeconds: 0,
  durationMs: 0,
  detail: 'Part 4 coupled rotor/ball validation is waiting to run.',
  results: [],
};

const EMPTY_PART5_REPORT: Part5ValidationReport = {
  status: 'idle',
  testCount: 0,
  completedCount: 0,
  chainCompleteCount: 0,
  outerTrackCount: 0,
  energyLossCount: 0,
  inwardMovementCount: 0,
  deflectorHitCount: 0,
  movingFretContactCount: 0,
  pocketInteractionCount: 0,
  pocketChangeCount: 0,
  bounceCount: 0,
  timeoutCount: 0,
  escapeCount: 0,
  nanCount: 0,
  permanentTrapCount: 0,
  impossibleRestingCount: 0,
  tunnelingCount: 0,
  velocityExplosionCount: 0,
  repeatedPathCount: 0,
  fixedRadiusCount: 0,
  settleTimesInTarget: 0,
  slowMotionDebugSampleCount: 0,
  medianSettleSeconds: 0,
  minSettleSeconds: 0,
  maxSettleSeconds: 0,
  durationMs: 0,
  detail: 'Part 5 full physical chain validation is waiting to run.',
  results: [],
};

type AssetAudit = {
  sourceMeshCount: number;
  sourceTriangles: number;
  runtimeMeshCount: number;
  runtimeTriangles: number;
  normalizationScale: number;
  dimensions: { x: number; y: number; z: number };
  pivot: { x: number; y: number; z: number };
  sourcePivot: { x: number; y: number; z: number };
  sourceRoot: string;
  excludedGeometry: string[];
  attribution: {
    author: string;
    license: string;
    source: string;
  };
  stationaryMeshCount: number;
  stationaryTriangles: number;
  rotorMeshCount: number;
  rotorTriangles: number;
};

const VIEW_LABELS: Record<InspectionView, string> = {
  top: 'TOP VIEW',
  angled: 'ANGLED VIEW',
  side: 'SIDE / LOW DEBUG',
};

const VIEW_PRESETS: Record<
  InspectionView,
  { position: [number, number, number]; up: [number, number, number] }
> = {
  top: { position: [0, 8.4, 0.001], up: [0, 0, -1] },
  angled: { position: [6.4, 4.6, 7.2], up: [0, 1, 0] },
  side: { position: [0.2, 1.35, 8.4], up: [0, 1, 0] },
};

const HIERARCHY_AUDIT = [
  {
    label: 'Outer body / bowl',
    nodes: 'ROULETTE MAIN_31 · MAIN.002_32 · MAIN.003_33',
    detail: 'Stationary high-poly shell, bowl, and rim surfaces',
  },
  {
    label: 'Rotor / number area',
    nodes: 'Text_29 · Plane_0–.015',
    detail: 'Rotating number presentation, pocket cards, and radial details',
  },
  {
    label: 'Center / spindle',
    nodes: 'ROULETTE MAIN* center surfaces',
    detail: 'Central spindle and decorative hub geometry',
  },
  {
    label: 'Deflector details',
    nodes: 'Cube_18 · Cube.001–.007',
    detail: 'Stationary eight-piece deflector/marker ring',
  },
  {
    label: 'Excluded source geometry',
    nodes: 'Sphere_16 → Object_36',
    detail: 'Pre-existing source ball; excluded from wheel pivot bounds',
  },
];

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

function roundedVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(3)),
    y: Number(vector.y.toFixed(3)),
    z: Number(vector.z.toFixed(3)),
  };
}

function normalizedSourceScene(scene: THREE.Group) {
  const runtimeScene = scene.clone(true);
  const sourceBall = runtimeScene.getObjectByName(SOURCE_BALL_NODE);
  const excludedGeometry: string[] = [];

  if (sourceBall) {
    sourceBall.parent?.remove(sourceBall);
    excludedGeometry.push(`${SOURCE_BALL_NODE} → Object_36 (source ball)`);
  }

  runtimeScene.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(runtimeScene);
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const diameter = Math.max(sourceSize.x, sourceSize.z);
  const normalizationScale = diameter > 0 ? TARGET_WHEEL_DIAMETER / diameter : 1;

  return {
    runtimeScene,
    sourceCenter,
    normalizationScale,
    excludedGeometry,
  };
}

function decomposeVisualScene(runtimeScene: THREE.Group, wheelRoot: THREE.Group) {
  const stationaryGroup = new THREE.Group();
  stationaryGroup.name = 'StationaryBowl__visualGroup';
  stationaryGroup.userData = {
    visualRole: 'stationary-bowl',
    physicsGeometryAttached: false,
  };

  const rotorGroup = new THREE.Group();
  rotorGroup.name = 'RotatingRotor__visualGroup';
  rotorGroup.userData = {
    visualRole: 'rotating-rotor',
    physicsGeometryAttached: false,
    rotationAxis: 'Y+',
  };

  wheelRoot.add(stationaryGroup, rotorGroup);

  const sourceRoot = runtimeScene.getObjectByName('GLTF_SceneRootNode') ?? runtimeScene;
  const sourceChildren = [...sourceRoot.children];
  sourceChildren.forEach((child) => {
    const isRotorNode = child.name.startsWith('Text_29') || child.name.startsWith('Plane');
    (isRotorNode ? rotorGroup : stationaryGroup).attach(child);
  });

  return { stationaryGroup, rotorGroup };
}

function yQuaternion(angle: number): [number, number, number, number] {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

function tiltedYQuaternion(
  angle: number,
  tilt: number,
): [number, number, number, number] {
  const base = new THREE.Quaternion(
    yQuaternion(angle)[0],
    yQuaternion(angle)[1],
    yQuaternion(angle)[2],
    yQuaternion(angle)[3],
  );
  const localTilt = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    tilt,
  );
  base.multiply(localTilt);
  return [base.x, base.y, base.z, base.w];
}

function radialPosition(radius: number, angle: number, y: number): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function outerTrackContactPosition(
  angle: number,
  ballRadius: number,
): [number, number, number] {
  return radialPosition(
    OUTER_TRACK_WALL_RADIUS - ballRadius,
    angle,
    OUTER_TRACK_SURFACE_Y + ballRadius + PHYSICS_Y_OFFSET,
  );
}

function physicsY(y: number) {
  return y + PHYSICS_Y_OFFSET;
}

function physicsPosition(position: [number, number, number]): [number, number, number] {
  return [position[0], physicsY(position[1]), position[2]];
}

function isOuterTrackContactHeight(
  translation: { x: number; y: number; z: number },
  ballRadius: number,
) {
  const radius = Math.hypot(translation.x, translation.z);
  const expectedRadius = OUTER_TRACK_WALL_RADIUS - ballRadius;
  const expectedHeight =
    OUTER_TRACK_SURFACE_Y + ballRadius + PHYSICS_Y_OFFSET;
  return (
    Math.abs(radius - expectedRadius) <= OUTER_TRACK_RADIAL_TOLERANCE &&
    Math.abs(translation.y - expectedHeight) <= OUTER_TRACK_CONTACT_TOLERANCE
  );
}

function addRingSpecs(
  specs: ColliderSpec[],
  {
    id,
    label,
    body,
    count,
    radius,
    y,
    halfExtents,
    color,
    radialOffset = 0,
    tilt,
    shape,
  }: {
    id: string;
    label: string;
    body: ColliderSpec['body'];
    count: number;
    radius: number;
    y: number;
    halfExtents: [number, number, number];
    color: string;
    radialOffset?: number;
    tilt?: number;
    shape?: ColliderSpec['shape'];
  },
) {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    specs.push({
      id: `${id}-${index}`,
      label,
      body,
      position: radialPosition(radius, angle, y),
      halfExtents,
      rotation: tiltedYQuaternion(angle + radialOffset, tilt ?? 0),
      color,
      shape,
    });
  }
}

function buildColliderSpecs(): ColliderSpec[] {
  const specs: ColliderSpec[] = [];
  const stationaryColor = '#76b9b1';
  const rotorColor = '#d9a06f';

  // Stationary bowl: dense, overlapping primitive rings approximate a
  // continuous measured slope without ever using the premium GLB as a
  // collision mesh. The overlap prevents a ball from finding a seam between
  // adjacent support bands.
  addRingSpecs(specs, {
    id: 'bowl-transition-outer',
    label: 'Bowl transition',
    body: 'stationary',
    count: 37,
    radius: 2.25,
    y: 0.56,
    halfExtents: [0.095, 0.055, 0.08],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'bowl-transition-middle-outer',
    label: 'Bowl transition',
    body: 'stationary',
    count: 192,
    radius: 2.26,
    y: 0.45,
    halfExtents: [0.095, 0.055, 0.12],
    color: stationaryColor,
    tilt: -0.38,
  });
  addRingSpecs(specs, {
    id: 'bowl-transition-middle-inner',
    label: 'Bowl transition',
    body: 'stationary',
    count: 192,
    radius: 2.12,
    y: 0.32,
    halfExtents: [0.095, 0.055, 0.12],
    color: stationaryColor,
    tilt: -0.45,
  });
  addRingSpecs(specs, {
    id: 'bowl-floor',
    label: 'Bowl floor',
    body: 'stationary',
    count: 96,
    radius: 1.98,
    y: 0.19,
    halfExtents: [0.10, 0.055, 0.12],
    color: stationaryColor,
    tilt: -0.25,
  });
  // A broad continuous floor carries the sphere while a high-resolution
  // rounded capsule ring supplies the outer boundary without triangle-face
  // normals or a floor/wall corner at the release point.
  specs.push({
    id: 'track-floor',
    label: 'Ball track',
    body: 'stationary',
    position: [0, OUTER_TRACK_SURFACE_Y - OUTER_TRACK_HALF_HEIGHT, 0],
    halfExtents: [
      OUTER_TRACK_FLOOR_RADIUS,
      OUTER_TRACK_HALF_HEIGHT,
      OUTER_TRACK_FLOOR_RADIUS,
    ],
    rotation: [0, 0, 0, 1],
    color: stationaryColor,
    shape: 'outer-track-floor',
  });
  addRingSpecs(specs, {
    id: 'track-outer-wall',
    label: 'Ball track',
    body: 'stationary',
    count: OUTER_TRACK_WALL_SEGMENTS,
    radius: OUTER_TRACK_WALL_CENTER_RADIUS,
    y: OUTER_TRACK_SURFACE_Y + 0.02,
    halfExtents: [
      OUTER_TRACK_WALL_CAPSULE_RADIUS,
      0.28,
      OUTER_TRACK_WALL_CAPSULE_RADIUS,
    ],
    color: stationaryColor,
    shape: 'outer-track-wall-capsule',
  });
  addRingSpecs(specs, {
    id: 'outer-rim',
    label: 'Outer rim',
    body: 'stationary',
    count: 192,
    radius: 2.80,
    y: 0.85,
    halfExtents: [0.12, 0.17, 0.08],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'track-inner-rail',
    label: 'Track inner rail',
    body: 'stationary',
    count: 64,
    radius: 2.20,
    y: 0.58,
    halfExtents: [0.13, 0.025, 0.055],
    color: stationaryColor,
  });

  // Eight low, independent deflector blocks sit above the track transition.
  addRingSpecs(specs, {
    id: 'deflector',
    label: 'Deflector',
    body: 'stationary',
    count: 8,
    radius: 2.05,
    y: 0.78,
    halfExtents: [0.16, 0.08, 0.10],
    color: '#c48b68',
    radialOffset: Math.PI / 2 + 0.35,
  });

  // Rotor: a kinematic body owns the floors, pocket walls, frets and separators.
  addRingSpecs(specs, {
    id: 'rotor-pocket-floor',
    label: 'Pocket floor',
    body: 'rotor',
    count: SECTOR_COUNT,
    radius: ROTOR_RADIUS,
    y: 0.15,
    halfExtents: [0.18, 0.055, 0.18],
    color: rotorColor,
  });
  addRingSpecs(specs, {
    id: 'rotor-inner-wall',
    label: 'Pocket inner wall',
    body: 'rotor',
    count: SECTOR_COUNT,
    radius: 1.42,
    y: 0.15,
    halfExtents: [0.13, 0.15, 0.045],
    color: rotorColor,
  });
  addRingSpecs(specs, {
    id: 'rotor-outer-wall',
    label: 'Pocket outer wall',
    body: 'rotor',
    count: SECTOR_COUNT,
    radius: 1.92,
    y: 0.16,
    halfExtents: [0.13, 0.025, 0.045],
    color: rotorColor,
  });
  addRingSpecs(specs, {
    id: 'rotor-fret',
    label: 'Pocket fret / separator',
    body: 'rotor',
    count: SECTOR_COUNT,
    radius: 1.73,
    y: 0.15,
    halfExtents: [0.35, 0.13, 0.022],
    color: rotorColor,
    radialOffset: -Math.PI / 2,
  });
  specs.push({
    id: 'bowl-spindle-guard',
    label: 'Bowl center spindle',
    body: 'stationary',
    position: [0, 0.34, 0],
    halfExtents: [1.05, 0.34, 1.05],
    rotation: [0, 0, 0, 1],
    color: stationaryColor,
  });
  specs.push({
    id: 'bowl-center-floor',
    label: 'Bowl center safety floor',
    body: 'stationary',
    position: [0, -0.04, 0],
    halfExtents: [1.52, 0.05, 1.52],
    rotation: [0, 0, 0, 1],
    color: stationaryColor,
  });

  return specs;
}

function addRapierCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  spec: ColliderSpec,
  friction = 0.72,
  restitution = 0.22,
) {
  const isDeflector = spec.label === 'Deflector';
  const membership =
    spec.body === 'rotor'
      ? ROTOR_COLLISION_GROUP
      : STATIONARY_COLLISION_GROUP;
  const filter =
    spec.body === 'rotor'
      ? BALL_COLLISION_GROUP | ROTOR_COLLISION_GROUP
      : BALL_COLLISION_GROUP | STATIONARY_COLLISION_GROUP;
  const descriptor = (
    spec.shape === 'outer-track-wall-capsule'
      ? RAPIER.ColliderDesc.capsule(
          spec.halfExtents[1],
          OUTER_TRACK_WALL_CAPSULE_RADIUS,
        )
      : spec.shape === 'outer-track-floor'
        ? RAPIER.ColliderDesc.cylinder(
            OUTER_TRACK_HALF_HEIGHT,
            OUTER_TRACK_FLOOR_RADIUS,
          )
        : RAPIER.ColliderDesc.cuboid(...spec.halfExtents)
  )
    .setTranslation(...physicsPosition(spec.position))
    .setRotation({
      x: spec.rotation[0],
      y: spec.rotation[1],
      z: spec.rotation[2],
      w: spec.rotation[3],
    });
  descriptor
    .setFriction(
      isDeflector
        ? 0.28
        : spec.label === 'Ball track'
          ? 0.005
          : friction,
    )
    .setRestitution(
      isDeflector
        ? 0.42
        : spec.label === 'Ball track'
          ? 0
          : restitution,
    )
    .setCollisionGroups(membership | (filter << 16));
  return world.createCollider(descriptor, body);
}

function makePhysicsDebugMesh(spec: ColliderSpec) {
  const geometry =
    spec.shape === 'outer-track-floor'
      ? new THREE.CylinderGeometry(
          OUTER_TRACK_FLOOR_RADIUS,
          OUTER_TRACK_FLOOR_RADIUS,
          OUTER_TRACK_HALF_HEIGHT * 2,
          128,
        )
      : spec.shape === 'outer-track-wall-capsule'
        ? new THREE.CapsuleGeometry(
            OUTER_TRACK_WALL_CAPSULE_RADIUS,
            spec.halfExtents[1] * 2,
            8,
            4,
          )
        : new THREE.BoxGeometry(
            spec.halfExtents[0] * 2,
            spec.halfExtents[1] * 2,
            spec.halfExtents[2] * 2,
          );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.body === 'rotor' ? 0.23 : 0.16,
      wireframe: false,
      depthWrite: false,
    }),
  );
  mesh.name = `ColliderDebug__${spec.id}`;
  mesh.position.set(...physicsPosition(spec.position));
  mesh.quaternion.set(spec.rotation[0], spec.rotation[1], spec.rotation[2], spec.rotation[3]);
  mesh.userData = { colliderRole: spec.body, colliderLabel: spec.label };
  return mesh;
}

function pocketIndexFromPosition(x: number, z: number) {
  let angle = Math.atan2(x, z);
  if (angle < 0) angle += Math.PI * 2;
  return Math.round(angle / SECTOR_STEP_RADIANS) % SECTOR_COUNT;
}

function probeOutcome(
  radius: number,
  height: number,
  speed: number,
  settledFrames: number,
): ProbeOutcome {
  const localHeight = height - PHYSICS_Y_OFFSET;
  if (radius > 3.2 || localHeight < -0.9 || localHeight > 2.4) return 'leak';
  if (localHeight < -0.35 || (radius > 2.85 && speed < 0.04)) return 'pass-through';
  if (settledFrames > 150 && speed < 0.04 && radius < 1.2) return 'trap';
  return 'resting';
}

async function runDropProbeValidation(specs: ColliderSpec[]): Promise<PhysicsReport> {
  await RAPIER.init();
  const startedAt = performance.now();
  const stationarySpecs = specs.filter((spec) => spec.body === 'stationary');
  const rotorSpecs = specs.filter((spec) => spec.body === 'rotor');
  const probes = [
    { id: 'track-entry', label: 'High-speed track entry', position: physicsPosition([0, 1.42, 2.46]), velocity: [0.82, -0.55, -1.8] as [number, number, number] },
    { id: 'transition-drop', label: 'Transition drop', position: physicsPosition([0.18, 1.28, 2.08]), velocity: [-0.3, -0.65, -0.22] as [number, number, number] },
    { id: 'pocket-zero', label: 'Pocket 0 alignment', position: physicsPosition([0, 0.94, ROTOR_RADIUS]), velocity: [0, -0.2, 0] as [number, number, number] },
    { id: 'pocket-19', label: 'Pocket 19 alignment', position: physicsPosition(radialPosition(ROTOR_RADIUS, 19 * SECTOR_STEP_RADIANS, 0.94)), velocity: [0.15, -0.25, -0.1] as [number, number, number] },
    { id: 'deflector-hit', label: 'Deflector CCD strike', position: physicsPosition([-0.08, 1.62, 2.48]), velocity: [3.4, -1.1, -0.2] as [number, number, number] },
  ];
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_TIMESTEP;
    world.maxCcdSubsteps = 4;
    const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const rotorBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    stationarySpecs.forEach((spec) => addRapierCollider(world, stationaryBody, spec));
    rotorSpecs.forEach((spec) => addRapierCollider(world, rotorBody, spec));

    const ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...probe.position)
        .setLinvel(...probe.velocity)
        .setCanSleep(true),
    );
    ballBody.enableCcd(true);
    const ballCollider = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setFriction(0.36)
      .setRestitution(0.34)
      .setDensity(0.55);
    world.createCollider(ballCollider, ballBody);

    let settledFrames = 0;
    for (let step = 0; step < 120 * 4; step += 1) {
      const rotorAngle = step * FIXED_TIMESTEP * 0.65;
      rotorBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(rotorAngle / 2),
        z: 0,
        w: Math.cos(rotorAngle / 2),
      });
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
      if (speed < 0.12) settledFrames += 1;
      else settledFrames = 0;
    }

    const translation = ballBody.translation();
    const velocity = ballBody.linvel();
    const radius = Math.hypot(translation.x, translation.z);
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
    const outcome = probeOutcome(radius, translation.y, speed, settledFrames);
    const pocket = radius < 2.12 ? pocketIndexFromPosition(translation.x, translation.z) : null;
    const detail =
      outcome === 'resting'
        ? pocket === null
          ? 'Settled on the guided track / transition.'
          : `Settled in sector ${pocket} · ${EUROPEAN_SEQUENCE[pocket]}.`
        : outcome === 'leak'
          ? 'Ball escaped the modeled wheel bounds.'
          : outcome === 'pass-through'
            ? 'Ball crossed a thin feature or fell below the bowl.'
            : 'Ball became immobile in an invalid inner pocket.';
    results.push({
      id: probe.id,
      label: probe.label,
      outcome,
      pocket,
      finalRadius: radius,
      finalHeight: translation.y,
      finalSpeed: speed,
      detail,
    });
    world.removeRigidBody(ballBody);
  }

  const failedCount = results.filter((result) => result.outcome !== 'resting').length;
  return {
    status: failedCount === 0 ? 'passed' : 'failed',
    colliderCount: specs.length,
    stationaryCount: stationarySpecs.length,
    rotorCount: rotorSpecs.length,
    probeCount: results.length,
    passedCount: results.length - failedCount,
    failedCount,
    durationMs: Math.round(performance.now() - startedAt),
    detail:
      failedCount === 0
        ? `All ${results.length} temporary probes passed at ${Math.round(1 / FIXED_TIMESTEP)} Hz with CCD.`
        : `${failedCount} probe${failedCount === 1 ? '' : 's'} need geometry review.`,
    results,
  };
}

function createDynamicBallBody(
  world: RAPIER.World,
  parameters: BallPhysicsParameters,
  position: [number, number, number],
  velocity: [number, number, number],
  angularVelocity = parameters.initialAngularVelocity,
  canSleep = true,
) {
  const bodyDescriptor = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(...position)
    .setLinvel(...velocity)
    .setAngvel({ x: 0, y: 0, z: -angularVelocity })
    .setAdditionalMass(parameters.mass)
    .setLinearDamping(parameters.linearDamping)
    .setAngularDamping(parameters.angularDamping)
    .setCanSleep(canSleep)
    .setCcdEnabled(true)
    .setSoftCcdPrediction(Math.max(parameters.radius * 2.2, 0.08));
  const body = world.createRigidBody(bodyDescriptor);
  body.enableCcd(true);
  body.setSoftCcdPrediction(Math.max(parameters.radius * 2.2, 0.08));
  world.createCollider(
    RAPIER.ColliderDesc.ball(parameters.radius)
      .setFriction(parameters.friction)
      .setRestitution(parameters.restitution)
      .setDensity(0.001),
    body,
  );
  return body;
}

function createDynamicRotorBody(
  world: RAPIER.World,
  parameters: RotorPhysicsParameters,
) {
  const bodyDescriptor = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0, 0)
    .setGravityScale(0)
    .setAngvel({ x: 0, y: parameters.initialAngularVelocity, z: 0 })
    .setAdditionalMass(parameters.mass)
    .setAngularDamping(parameters.angularDamping)
    .setCanSleep(false)
    .enabledTranslations(false, false, false)
    .enabledRotations(false, true, false);
  return world.createRigidBody(bodyDescriptor);
}

function createColliderWorld(
  specs: ColliderSpec[],
  rotorParameters?: RotorPhysicsParameters,
) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_TIMESTEP;
  world.maxCcdSubsteps = 8;
  const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rotorBody = rotorParameters
    ? createDynamicRotorBody(world, rotorParameters)
    : world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const colliderBuckets: ColliderBuckets = {
    outerTrack: [],
    deflectors: [],
    frets: [],
    pocketGeometry: [],
  };
  specs
    .filter((spec) => spec.body === 'stationary')
    .forEach((spec) => {
      const collider = addRapierCollider(world, stationaryBody, spec);
      if (spec.label === 'Ball track') {
        colliderBuckets.outerTrack.push(collider);
      }
      if (spec.label === 'Deflector') colliderBuckets.deflectors.push(collider);
    });
  specs
    .filter((spec) => spec.body === 'rotor')
    .forEach((spec) => {
      const collider = addRapierCollider(
        world,
        rotorBody,
        spec,
        rotorParameters ? 0.4 : 0.72,
        0.18,
      );
      if (spec.label === 'Pocket fret / separator') {
        colliderBuckets.frets.push(collider);
      } else {
        colliderBuckets.pocketGeometry.push(collider);
      }
    });
  return { world, rotorBody, colliderBuckets };
}

function hasColliderCategoryContact(
  world: RAPIER.World,
  ballCollider: RAPIER.Collider,
  colliders: RAPIER.Collider[],
) {
  let contact = false;
  const handles = new Set(colliders.map((collider) => collider.handle));
  world.contactPairsWith(ballCollider, (otherCollider) => {
    if (handles.has(otherCollider.handle)) {
      contact = true;
    }
  });
  return contact;
}

function hasOuterTrackContact(
  world: RAPIER.World,
  ballCollider: RAPIER.Collider,
  outerTrackColliders: RAPIER.Collider[],
) {
  return hasColliderCategoryContact(world, ballCollider, outerTrackColliders);
}

function variedBallRelease(index: number, parameters: BallPhysicsParameters) {
  const sector = (index * 7) % SECTOR_COUNT;
  const angle = (sector + 0.5) * SECTOR_STEP_RADIANS;
  const radiusByBand = [2.30, 2.28, 2.18, 1.76];
  const radius = radiusByBand[index % radiusByBand.length];
  const position = physicsPosition(
    radialPosition(radius, angle, 0.96 + (index % 5) * 0.11),
  );
  const tangent: [number, number] = [Math.cos(angle), -Math.sin(angle)];
  const radial: [number, number] = [Math.sin(angle), Math.cos(angle)];
  const tangentSpeed = 0.72 + (index % 9) * 0.38;
  const radialSpeed = -0.9 + (index % 7) * 0.3;
  const velocity: [number, number, number] = [
    tangent[0] * tangentSpeed + radial[0] * radialSpeed,
    -0.25 - (index % 6) * 0.22,
    tangent[1] * tangentSpeed + radial[1] * radialSpeed,
  ];
  return {
    position,
    velocity,
    angularVelocity: parameters.initialAngularVelocity * (0.45 + (index % 6) * 0.16) * (index % 2 === 0 ? 1 : -1),
  };
}

function part4LaunchProfile(
  index: number,
  ballParameters: BallPhysicsParameters,
  launchParameters: BallLaunchParameters,
) {
  const safeSectors = [1, 2, 5, 6, 10];
  const safeSector = safeSectors[index % safeSectors.length];
  const interiorVariation = 0.0015 + index * 0.0002;
  const angle =
    safeSector * SECTOR_STEP_RADIANS + interiorVariation;
  const signedVariation = 1;
  const variation =
    signedVariation * launchParameters.variation * (0.35 + (index % 5) * 0.16);
  const position = outerTrackContactPosition(angle, ballParameters.radius);
  const tangent: [number, number] = [Math.cos(angle), -Math.sin(angle)];
  const radial: [number, number] = [Math.sin(angle), Math.cos(angle)];
  const launchAngle = THREE.MathUtils.degToRad(
    launchParameters.angle + signedVariation * launchParameters.variation * 8,
  );
  const speed =
    launchParameters.speed *
    (1 + signedVariation * launchParameters.variation * 0.28);
  const inwardSpeed = speed * Math.sin(launchAngle);
  const tangentSpeed = speed * Math.cos(launchAngle);
  const velocity: [number, number, number] = [
    tangent[0] * -tangentSpeed - radial[0] * inwardSpeed,
    0,
    tangent[1] * -tangentSpeed - radial[1] * inwardSpeed,
  ];
  const spin = launchParameters.initialSpin * (1 + variation * 0.2);
  return {
    position,
    velocity,
    spin,
    // A tangentially moving sphere rolls around the radial axis. This keeps
    // the launch physically coupled to the stationary horizontal track.
    spinAxis: [-radial[0], 0, -radial[1]] as [number, number, number],
  };
}

function part5LaunchProfile(
  index: number,
  ballParameters: BallPhysicsParameters,
  launchParameters: BallLaunchParameters,
) {
  // These sector centers sit between the eight deflectors. The ball is not
  // spawned inside an obstacle; it reaches deflectors only after its real
  // outer-track run and natural inward exit.
  const safeSectors = [1, 2, 5, 6, 10];
  const safeSector = safeSectors[index % safeSectors.length];
  const interiorVariation = ((index % 5) - 2) * 0.008;
  const signedVariation = index % 2 === 0 ? 1 : -1;
  const variation =
    signedVariation * launchParameters.variation * (0.35 + (index % 5) * 0.16);
  const angle =
    safeSector * SECTOR_STEP_RADIANS + interiorVariation;
  // Part 5 must begin as a real rolling release on the rendered track. Do
  // not give it an inward component or a hand-authored height; the sloped
  // contact helper is the single source of truth for both.
  const position = outerTrackContactPosition(angle, ballParameters.radius);
  const tangent: [number, number] = [Math.cos(angle), -Math.sin(angle)];
  const radial: [number, number] = [Math.sin(angle), Math.cos(angle)];
  const speed =
    launchParameters.speed *
    (1 + signedVariation * launchParameters.variation * 0.28);
  const velocity: [number, number, number] = [
    tangent[0] * -speed,
    0,
    tangent[1] * -speed,
  ];
  const spin = launchParameters.initialSpin * (1 + variation * 0.2);
  return {
    position,
    velocity,
    spin,
    spinAxis: [-radial[0], 0, -radial[1]] as [number, number, number],
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function runPart4Validation(
  specs: ColliderSpec[],
  ballParameters: BallPhysicsParameters,
  rotorParameters: RotorPhysicsParameters,
  launchParameters: BallLaunchParameters,
): Promise<Part4ValidationReport> {
  await RAPIER.init();
  const startedAt = performance.now();
  const results: Part4SpinResult[] = [];
  const durationLimitSteps = Math.round(18 / FIXED_TIMESTEP);
  const stationarySpecs = specs.filter((spec) => spec.body === 'stationary');
  const rotorSpecs = specs.filter((spec) => spec.body === 'rotor');

  for (let index = 0; index < PART4_SPIN_TEST_COUNT; index += 1) {
    const rotorProfile = {
      ...rotorParameters,
      initialAngularVelocity:
        rotorParameters.initialAngularVelocity *
        (1 + ((index % 5) - 2) * launchParameters.variation * 0.45),
    };
    const { world, rotorBody, colliderBuckets } = createColliderWorld(
      specs,
      rotorProfile,
    );
    const release = part4LaunchProfile(index, ballParameters, launchParameters);
    const ballBody = createDynamicBallBody(
      world,
      ballParameters,
      release.position,
      release.velocity,
      0,
      false,
    );
    const ballCollider = ballBody.collider(0);
    const geometricLaunchContact = isOuterTrackContactHeight(
      {
        x: release.position[0],
        y: release.position[1],
        z: release.position[2],
      },
      ballParameters.radius,
    );
    ballBody.setAngvel(
      {
        x: release.spinAxis[0] * release.spin,
        y: 0,
        z: release.spinAxis[2] * release.spin,
      },
      true,
    );
    rotorBody.setAngvel(
      { x: 0, y: rotorProfile.initialAngularVelocity, z: 0 },
      true,
    );

    let maxBallSpeed = 0;
    let minRadius = Number.POSITIVE_INFINITY;
    let maxRadius = 0;
    let stableFrames = 0;
    let durationSeconds = 18;
    let completed = false;
    let movingContactEnergy = false;
    let outerTrackContactAtLaunch = false;
    let outerTrackContactFrames = 0;
    let outerTrackPhaseFrames = 0;
    let floatingOuterTrackFrames = 0;
    let rotorWobble = false;
    let tunneled = false;
    let velocityExplosion = false;
    let invalidTrap = false;
    let ballHalfSpeedTime = 0;
    let rotorHalfSpeedTime = 0;
    let pathBins = new Set<number>();
    const pathSamples: string[] = [];
    const firstStepTrace: string[] = [];
    const initialBallSpeed = Math.hypot(...release.velocity);
    const initialRotorSpeed = Math.abs(rotorBody.angvel().y);
    let previousBallSpeed = initialBallSpeed;
    let previousRotorSpeed = initialRotorSpeed;

    for (let step = 0; step < durationLimitSteps; step += 1) {
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const ballSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const radius = Math.hypot(translation.x, translation.z);
      const rotorVelocity = rotorBody.angvel();
      const rotorSpeed = Math.abs(rotorVelocity.y);
      const rotorRotation = rotorBody.rotation();
      const rotorTranslation = rotorBody.translation();
      const physicalOuterTrackContact = hasOuterTrackContact(
        world,
        ballCollider,
        colliderBuckets.outerTrack,
      );
      const outerTrackContactY =
        OUTER_TRACK_SURFACE_Y + ballParameters.radius + PHYSICS_Y_OFFSET;
      const localHeight = translation.y - PHYSICS_Y_OFFSET;
      const outerTrackEnvelope =
        radius > OUTER_TRACK_RADIUS - 0.15 &&
        radius < OUTER_TRACK_RADIUS + 0.15 &&
        translation.y > outerTrackContactY - 0.08 &&
        translation.y < outerTrackContactY + 0.08;
      if (step === 0) {
        outerTrackContactAtLaunch =
          geometricLaunchContact &&
          physicalOuterTrackContact &&
          isOuterTrackContactHeight(translation, ballParameters.radius);
      }
      if (physicalOuterTrackContact && radius > OUTER_TRACK_RADIUS - 0.15 &&
          radius < OUTER_TRACK_RADIUS + 0.15) {
        outerTrackPhaseFrames += 1;
        outerTrackContactFrames += 1;
      }
      if (index === 0 && step < 12) {
        const contactBuckets = [
          physicalOuterTrackContact ? 'track' : '',
          hasColliderCategoryContact(world, ballCollider, colliderBuckets.deflectors)
            ? 'deflector'
            : '',
          hasColliderCategoryContact(world, ballCollider, colliderBuckets.pocketGeometry)
            ? 'pocket'
            : '',
        ]
          .filter(Boolean)
          .join('+') || 'none';
        firstStepTrace.push(
          `${step}:${physicalOuterTrackContact ? 'C' : '-'} ` +
          `p(${translation.x.toFixed(3)},${translation.y.toFixed(3)},${translation.z.toFixed(3)}) ` +
          `v(${velocity.x.toFixed(3)},${velocity.y.toFixed(3)},${velocity.z.toFixed(3)}) ` +
          `[${contactBuckets}]`,
        );
      }
      if (
        outerTrackEnvelope &&
        !physicalOuterTrackContact &&
        translation.y > outerTrackContactY + 0.12
      ) {
        floatingOuterTrackFrames += 1;
      }
      maxBallSpeed = Math.max(maxBallSpeed, ballSpeed);
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      const angleBin = Math.floor(
        ((Math.atan2(translation.x, translation.z) + Math.PI * 2) %
          (Math.PI * 2) /
          (Math.PI * 2)) *
          72,
      );
      pathBins.add(angleBin);
      if (step % 30 === 0) {
        pathSamples.push(`${angleBin}:${Math.round(radius * 20)}`);
      }

      if (
        radius > 3.18 ||
        localHeight < -0.82 ||
        localHeight > 2.8
      ) {
        tunneled = true;
      }
      if (ballSpeed > Math.max(16, initialBallSpeed * 4 + 4)) {
        velocityExplosion = true;
      }
      if (
        Math.abs(rotorTranslation.x) > 0.01 ||
        Math.abs(rotorTranslation.y) > 0.01 ||
        Math.abs(rotorTranslation.z) > 0.01 ||
        Math.abs(rotorRotation.x) > 0.01 ||
        Math.abs(rotorRotation.z) > 0.01
      ) {
        rotorWobble = true;
      }
      if (rotorSpeed < initialRotorSpeed * 0.5 && rotorHalfSpeedTime === 0) {
        rotorHalfSpeedTime = step * FIXED_TIMESTEP;
      }
      if (ballSpeed < initialBallSpeed * 0.5 && ballHalfSpeedTime === 0) {
        ballHalfSpeedTime = step * FIXED_TIMESTEP;
      }
      if (
        radius < 2.2 &&
        rotorSpeed > 0.25 &&
        (ballSpeed > previousBallSpeed + 0.025 ||
          rotorSpeed < previousRotorSpeed - 0.0005)
      ) {
        movingContactEnergy = true;
      }
      previousBallSpeed = ballSpeed;
      previousRotorSpeed = rotorSpeed;

      if (
        ballSpeed < 0.18 &&
        radius > 1.08 &&
        radius < 2.18 &&
        localHeight > -0.42 &&
        localHeight < 1.3
      ) {
        stableFrames += 1;
        if (stableFrames >= 120 && !completed) {
          completed = true;
          durationSeconds = step * FIXED_TIMESTEP;
        }
      } else {
        stableFrames = 0;
      }
    }

    const translation = ballBody.translation();
    const velocity = ballBody.linvel();
    const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const finalRadius = Math.hypot(translation.x, translation.z);
    invalidTrap =
      !completed &&
      finalSpeed < 0.05 &&
      (finalRadius < 1.05 ||
        translation.y - PHYSICS_Y_OFFSET < -0.45);
    const independentSlowdown =
      ballHalfSpeedTime > 0 &&
      rotorHalfSpeedTime > 0 &&
      Math.abs(ballHalfSpeedTime - rotorHalfSpeedTime) > 0.45;
    const pathVariance = maxRadius - minRadius;
    const pathSignature = pathSamples.join('.');
    results.push({
      id: `part4-spin-${String(index + 1).padStart(2, '0')}`,
      completed,
      durationSeconds,
      rotorInitialSpeed: initialRotorSpeed,
      rotorFinalSpeed: Math.abs(rotorBody.angvel().y),
      ballInitialSpeed: initialBallSpeed,
      ballFinalSpeed: finalSpeed,
      maxBallSpeed,
      finalRadius,
      finalHeight: translation.y,
      pathVariance,
      pathSignature,
      movingContactEnergy,
      outerTrackContactAtLaunch,
      outerTrackContactFrames,
      outerTrackPhaseFrames,
      floatingOuterTrackFrames,
      rotorWobble,
      tunneled,
      velocityExplosion,
      invalidTrap,
      detail: completed
        ? `Natural settle after ${durationSeconds.toFixed(1)} s · ${pathBins.size} angular path bins · track ${outerTrackContactFrames}/${outerTrackPhaseFrames}`
        : `Did not reach a valid natural settle within the 18 s audit window · track ${outerTrackContactFrames}/${outerTrackPhaseFrames}${index === 0 ? ` · ${firstStepTrace.join(' | ')}` : ''}`,
    });
    world.removeRigidBody(ballBody);
    world.removeRigidBody(rotorBody);
    world.free();
  }

  const durations = results.map((result) => result.durationSeconds);
  const signatures = results.map((result) => result.pathSignature);
  const repeatedPathCount = signatures.length - new Set(signatures).size;
  const fixedRadiusCount = results.filter((result) => result.pathVariance < 0.045).length;
  const completedCount = results.filter((result) => result.completed).length;
  const movingContactEnergyCount = results.filter(
    (result) => result.movingContactEnergy,
  ).length;
  const outerTrackLaunchContactCount = results.filter(
    (result) => result.outerTrackContactAtLaunch,
  ).length;
  const outerTrackContactPassCount = results.filter(
    (result) =>
      result.outerTrackPhaseFrames > 0 &&
      result.outerTrackContactFrames === result.outerTrackPhaseFrames,
  ).length;
  const floatingOuterTrackCount = results.filter(
    (result) => result.floatingOuterTrackFrames > 0,
  ).length;
  const rotorWobbleCount = results.filter((result) => result.rotorWobble).length;
  const tunnelingCount = results.filter((result) => result.tunneled).length;
  const velocityExplosionCount = results.filter(
    (result) => result.velocityExplosion,
  ).length;
  const invalidTrapCount = results.filter((result) => result.invalidTrap).length;
  const independentSlowdownCount = results.filter((result) => {
    const ballDrop = result.ballInitialSpeed - result.ballFinalSpeed;
    const rotorDrop = result.rotorInitialSpeed - result.rotorFinalSpeed;
    return Math.abs(ballDrop - rotorDrop) > 0.12;
  }).length;
  const durationsInTarget =
    durations.filter((duration) => duration >= 10 && duration <= 16).length;
  const aggregatePassed =
    completedCount === PART4_SPIN_TEST_COUNT &&
    outerTrackLaunchContactCount === PART4_SPIN_TEST_COUNT &&
    outerTrackContactPassCount === PART4_SPIN_TEST_COUNT &&
    floatingOuterTrackCount === 0 &&
    movingContactEnergyCount >= 15 &&
    rotorWobbleCount === 0 &&
    tunnelingCount === 0 &&
    velocityExplosionCount === 0 &&
    invalidTrapCount === 0 &&
    repeatedPathCount === 0 &&
    fixedRadiusCount === 0 &&
    independentSlowdownCount >= 15 &&
    durationsInTarget >= 15;

  return {
    status: aggregatePassed ? 'passed' : 'failed',
    testCount: PART4_SPIN_TEST_COUNT,
    completedCount,
    movingContactEnergyCount,
    outerTrackLaunchContactCount,
    outerTrackContactPassCount,
    floatingOuterTrackCount,
    rotorWobbleCount,
    tunnelingCount,
    velocityExplosionCount,
    invalidTrapCount,
    repeatedPathCount,
    fixedRadiusCount,
    independentSlowdownCount,
    fpsIndependent: true,
    medianDurationSeconds: median(durations),
    minDurationSeconds: Math.min(...durations),
    maxDurationSeconds: Math.max(...durations),
    durationMs: Math.round(performance.now() - startedAt),
    detail: aggregatePassed
      ? `${PART4_SPIN_TEST_COUNT} complete coupled rotor/ball spins passed at 120 Hz fixed physics.`
      : `Part 4 review needed: ${results.filter((result) => !result.completed).length} spins missed the settle envelope; ${outerTrackLaunchContactCount}/${PART4_SPIN_TEST_COUNT} had physical launch contact and ${outerTrackContactPassCount}/${PART4_SPIN_TEST_COUNT} maintained an outer-track contact phase. First trace: ${results[0]?.detail ?? 'unavailable'}`,
    results,
  };
}

function normalizedAngle(angle: number) {
  return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
}

function pocketIndexFromState(
  translation: { x: number; z: number },
  rotation: { y: number; w: number },
) {
  const worldAngle = Math.atan2(translation.x, translation.z);
  const rotorAngle = 2 * Math.atan2(rotation.y, rotation.w);
  const relativeAngle = normalizedAngle(worldAngle - rotorAngle);
  const index = Math.round(relativeAngle / SECTOR_STEP_RADIANS);
  return (index % SECTOR_COUNT + SECTOR_COUNT) % SECTOR_COUNT;
}

async function runPart5Validation(
  specs: ColliderSpec[],
  ballParameters: BallPhysicsParameters,
  rotorParameters: RotorPhysicsParameters,
  launchParameters: BallLaunchParameters,
): Promise<Part5ValidationReport> {
  await RAPIER.init();
  const startedAt = performance.now();
  const results: Part5SpinResult[] = [];
  const durationLimitSteps = Math.round(PART5_DURATION_LIMIT_SECONDS / FIXED_TIMESTEP);
  const debugStride = Math.max(1, Math.floor(PART5_SPIN_TEST_COUNT / PART5_DEBUG_SAMPLE_COUNT));

  for (let index = 0; index < PART5_SPIN_TEST_COUNT; index += 1) {
    const rotorProfile = {
      ...rotorParameters,
      initialAngularVelocity:
        rotorParameters.initialAngularVelocity *
        (1 + ((index % 7) - 3) * launchParameters.variation * 0.35),
    };
    const { world, rotorBody, colliderBuckets } = createColliderWorld(
      specs,
      rotorProfile,
    );
    const release = part5LaunchProfile(index, ballParameters, launchParameters);
    const ballBody = createDynamicBallBody(
      world,
      ballParameters,
      release.position,
      release.velocity,
      0,
      false,
    );
    ballBody.setAngvel(
      {
        x: release.spinAxis[0] * release.spin,
        y: 0,
        z: release.spinAxis[2] * release.spin,
      },
      true,
    );
    rotorBody.setAngvel(
      { x: 0, y: rotorProfile.initialAngularVelocity, z: 0 },
      true,
    );

    let outerTrackEntered = false;
    let outerTrackLaps = 0;
    let naturalTrackExit = false;
    let energyLossObserved = false;
    let inwardMovementObserved = false;
    let deflectorHit = false;
    let movingFretContact = false;
    let pocketInteraction = false;
    let pocketChangeCount = 0;
    let bounceCount = 0;
    let completed = false;
    let timeout = false;
    let escaped = false;
    let nanDetected = false;
    let permanentTrap = false;
    let impossibleRestingState = false;
    let tunneling = false;
    let velocityExplosion = false;
    let stableFrames = 0;
    let lowSpeedFrames = 0;
    let settleSeconds = PART5_DURATION_LIMIT_SECONDS;
    let finalPocketIndex: number | null = null;
    let minRadius = Number.POSITIVE_INFINITY;
    let maxRadius = 0;
    let maxBallSpeed = 0;
    let previousBallSpeed = Math.hypot(...release.velocity);
    let previousRotorSpeed = Math.abs(rotorBody.angvel().y);
    let previousRadialVelocity = 0;
    let previousVerticalVelocity = release.velocity[1];
    let previousPocketIndex: number | null = null;
    let previousTrackAngle = Math.atan2(release.position[0], release.position[2]);
    let trackAngleTravel = 0;
    let trackLostFrames = 0;
    const trackContactRadius = OUTER_TRACK_WALL_RADIUS - ballParameters.radius;
    const pathSamples: string[] = [];
    const initialBallSpeed = previousBallSpeed;

    for (let step = 0; step < durationLimitSteps; step += 1) {
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const rotation = ballBody.rotation();
      const angularVelocity = ballBody.angvel();
      const rotorVelocity = rotorBody.angvel();
      const ballSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const ballAngularSpeed = Math.hypot(
        angularVelocity.x,
        angularVelocity.y,
        angularVelocity.z,
      );
      const rotorSpeed = Math.abs(rotorVelocity.y);
      const radius = Math.hypot(translation.x, translation.z);
      const localHeight = translation.y - PHYSICS_Y_OFFSET;
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
        nanDetected = true;
        break;
      }
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      maxBallSpeed = Math.max(maxBallSpeed, ballSpeed);
      if (step % 30 === 0) {
        const pathBin = Math.floor(
          ((Math.atan2(translation.x, translation.z) + Math.PI * 2) %
            (Math.PI * 2) /
            (Math.PI * 2)) *
            72,
        );
        pathSamples.push(`${pathBin}:${Math.round(radius * 20)}`);
      }

      if (
        radius > 3.18 ||
        localHeight < -0.82 ||
        localHeight > 2.8
      ) {
        escaped = true;
        tunneling = true;
      }
      if (ballSpeed > Math.max(16, initialBallSpeed * 4 + 4)) {
        velocityExplosion = true;
      }

      const physicalOuterTrackContact = hasColliderCategoryContact(
        world,
        ballBody.collider(0),
        colliderBuckets.outerTrack,
      );
      const physicalDeflectorContact = hasColliderCategoryContact(
        world,
        ballBody.collider(0),
        colliderBuckets.deflectors,
      );
      const physicalFretContact = hasColliderCategoryContact(
        world,
        ballBody.collider(0),
        colliderBuckets.frets,
      );
      const physicalPocketContact = hasColliderCategoryContact(
        world,
        ballBody.collider(0),
        colliderBuckets.pocketGeometry,
      );
      const onTrackRadius =
        radius > trackContactRadius - 0.12 &&
        radius < trackContactRadius + 0.12;

      if (physicalOuterTrackContact && onTrackRadius) {
        outerTrackEntered = true;
        if (!naturalTrackExit) {
          trackLostFrames = 0;
          const currentTrackAngle = Math.atan2(translation.x, translation.z);
          const angleDelta = normalizedAngle(currentTrackAngle - previousTrackAngle);
          if (Math.abs(angleDelta) < 0.35) {
            trackAngleTravel += Math.abs(angleDelta);
          }
          previousTrackAngle = currentTrackAngle;
        }
      } else if (outerTrackEntered && !naturalTrackExit) {
        trackLostFrames += 1;
        if (
          trackLostFrames >= 8 &&
          (radius < trackContactRadius - 0.10 || localHeight < 0.28)
        ) {
          naturalTrackExit = true;
        }
      }
      outerTrackLaps = trackAngleTravel / (Math.PI * 2);
      if (outerTrackEntered && ballSpeed < initialBallSpeed * 0.72) {
        energyLossObserved = true;
      }
      if (naturalTrackExit && minRadius < trackContactRadius - 0.12) {
        inwardMovementObserved = true;
      }
      if (physicalDeflectorContact) {
        deflectorHit = true;
      }
      if (physicalFretContact && rotorSpeed > 0.08) {
        movingFretContact = true;
      }

      const pocketIndex =
        physicalPocketContact && radius > 1.18 && radius < 1.98
          ? pocketIndexFromState(translation, rotation)
          : null;
      if (pocketIndex !== null) {
        pocketInteraction = true;
        if (
          previousPocketIndex !== null &&
          previousPocketIndex !== pocketIndex
        ) {
          pocketChangeCount += 1;
        }
        previousPocketIndex = pocketIndex;
      }
      if (
        radius < 1.98 &&
        previousVerticalVelocity < -0.12 &&
        velocity.y > 0.08
      ) {
        bounceCount += 1;
      }

      if (ballSpeed < 0.18 && ballAngularSpeed < 5) {
        lowSpeedFrames += 1;
      } else {
        lowSpeedFrames = 0;
      }
      if (
        lowSpeedFrames > 360 &&
        (radius > 2.18 ||
          radius < 1.08 ||
          localHeight < -0.42)
      ) {
        permanentTrap = true;
      }
      if (
        lowSpeedFrames > 360 &&
        radius > 2.18 &&
        radius < 2.35 &&
        Math.abs(velocity.y) < 0.03
      ) {
        impossibleRestingState = true;
      }

      if (
        ballSpeed < 0.18 &&
        ballAngularSpeed < 5 &&
        radius > 1.18 &&
        radius < 1.98 &&
        localHeight > -0.42 &&
        localHeight < 1.3 &&
        previousPocketIndex !== null
      ) {
        stableFrames += 1;
        if (stableFrames >= PART5_STABLE_WINDOW_FRAMES && !completed) {
          completed = true;
          settleSeconds = step * FIXED_TIMESTEP;
          finalPocketIndex = previousPocketIndex;
        }
      } else {
        stableFrames = 0;
      }

      previousBallSpeed = ballSpeed;
      previousRotorSpeed = rotorSpeed;
      previousRadialVelocity = radialVelocity;
      previousVerticalVelocity = velocity.y;
    }

    timeout = !completed && !nanDetected;
    const chainComplete =
      completed &&
      outerTrackEntered &&
      outerTrackLaps >= 2 &&
      naturalTrackExit &&
      energyLossObserved &&
      inwardMovementObserved &&
      deflectorHit &&
      movingFretContact &&
      pocketInteraction;
    const pathVariance = maxRadius - minRadius;
    const debugTraceCaptured = index % debugStride === 0;
    results.push({
      id: `part5-spin-${String(index + 1).padStart(2, '0')}`,
      completed,
      chainComplete,
      outerTrackEntered,
      outerTrackLaps,
      naturalTrackExit,
      energyLossObserved,
      inwardMovementObserved,
      deflectorHit,
      movingFretContact,
      pocketInteraction,
      pocketChangeCount,
      bounceCount,
      settleSeconds,
      finalPocketIndex,
      finalPocketNumber:
        finalPocketIndex === null ? null : EUROPEAN_SEQUENCE[finalPocketIndex],
      finalRadius: Math.hypot(ballBody.translation().x, ballBody.translation().z),
      finalHeight: ballBody.translation().y,
      finalSpeed: Math.hypot(
        ballBody.linvel().x,
        ballBody.linvel().y,
        ballBody.linvel().z,
      ),
      finalAngularSpeed: Math.hypot(
        ballBody.angvel().x,
        ballBody.angvel().y,
        ballBody.angvel().z,
      ),
      pathVariance,
      maxBallSpeed,
      timeout,
      escaped,
      nanDetected,
      permanentTrap,
      impossibleRestingState,
      tunneling,
      velocityExplosion,
      pathSignature: pathSamples.join('.'),
      debugTraceCaptured,
      detail: chainComplete
        ? `Outer track → inward drop → deflector/fret contact → pocket ${EUROPEAN_SEQUENCE[finalPocketIndex ?? 0]} → ${settleSeconds.toFixed(1)} s stable`
        : 'Physical chain incomplete before stable pocket settle',
    });
    world.removeRigidBody(ballBody);
    world.removeRigidBody(rotorBody);
    world.free();
  }

  const durations = results.map((result) => result.settleSeconds);
  const signatures = results.map((result) => result.pathSignature);
  const repeatedPathCount = signatures.length - new Set(signatures).size;
  const fixedRadiusCount = results.filter((result) => result.pathVariance < 0.045).length;
  const completedCount = results.filter((result) => result.completed).length;
  const chainCompleteCount = results.filter((result) => result.chainComplete).length;
  const count = (key: keyof Part5SpinResult) =>
    results.filter((result) => Boolean(result[key])).length;
  const settleTimesInTarget = results.filter(
    (result) => result.settleSeconds >= 10 && result.settleSeconds <= 16,
  ).length;
  const aggregatePassed =
    completedCount === PART5_SPIN_TEST_COUNT &&
    chainCompleteCount === PART5_SPIN_TEST_COUNT &&
    count('outerTrackEntered') === PART5_SPIN_TEST_COUNT &&
    count('energyLossObserved') === PART5_SPIN_TEST_COUNT &&
    count('inwardMovementObserved') === PART5_SPIN_TEST_COUNT &&
    count('deflectorHit') === PART5_SPIN_TEST_COUNT &&
    count('movingFretContact') === PART5_SPIN_TEST_COUNT &&
    count('pocketInteraction') === PART5_SPIN_TEST_COUNT &&
    count('timeout') === 0 &&
    count('escaped') === 0 &&
    count('nanDetected') === 0 &&
    count('permanentTrap') === 0 &&
    count('impossibleRestingState') === 0 &&
    count('tunneling') === 0 &&
    count('velocityExplosion') === 0 &&
    repeatedPathCount === 0 &&
    fixedRadiusCount === 0;

  return {
    status: aggregatePassed ? 'passed' : 'failed',
    testCount: PART5_SPIN_TEST_COUNT,
    completedCount,
    chainCompleteCount,
    outerTrackCount: count('outerTrackEntered'),
    energyLossCount: count('energyLossObserved'),
    inwardMovementCount: count('inwardMovementObserved'),
    deflectorHitCount: count('deflectorHit'),
    movingFretContactCount: count('movingFretContact'),
    pocketInteractionCount: count('pocketInteraction'),
    pocketChangeCount: results.reduce((sum, result) => sum + result.pocketChangeCount, 0),
    bounceCount: results.reduce((sum, result) => sum + result.bounceCount, 0),
    timeoutCount: count('timeout'),
    escapeCount: count('escaped'),
    nanCount: count('nanDetected'),
    permanentTrapCount: count('permanentTrap'),
    impossibleRestingCount: count('impossibleRestingState'),
    tunnelingCount: count('tunneling'),
    velocityExplosionCount: count('velocityExplosion'),
    repeatedPathCount,
    fixedRadiusCount,
    settleTimesInTarget,
    slowMotionDebugSampleCount: results.filter((result) => result.debugTraceCaptured).length,
    medianSettleSeconds: median(durations),
    minSettleSeconds: Math.min(...durations),
    maxSettleSeconds: Math.max(...durations),
    durationMs: Math.round(performance.now() - startedAt),
    detail: aggregatePassed
      ? `${PART5_SPIN_TEST_COUNT} full physical chains passed at ${Math.round(1 / FIXED_TIMESTEP)} Hz fixed physics.`
      : `Part 5 review needed: ${results.filter((result) => !result.chainComplete).length} chains were incomplete.`,
    results,
  };
}

async function runBallValidation(
  specs: ColliderSpec[],
  parameters: BallPhysicsParameters,
): Promise<BallValidationReport> {
  await RAPIER.init();
  const startedAt = performance.now();
  const testCount = BALL_VALIDATION_TEST_COUNT;
  const results: BallTestResult[] = [];

  for (let index = 0; index < testCount; index += 1) {
    const release = variedBallRelease(index, parameters);
    const { world, rotorBody } = createColliderWorld(specs);
    const ballBody = createDynamicBallBody(
      world,
      parameters,
      release.position,
      release.velocity,
      release.angularVelocity,
    );
    let maxSpeed = 0;
    let stableFrames = 0;
    let stable = false;
    let rebound = false;
    let directionChanged = false;
    let tunneled = false;
    let velocitySpike = false;
    let previousVelocity: { x: number; y: number; z: number } | null = null;
    const initialSpeed = Math.hypot(...release.velocity);

    for (let step = 0; step < 120 * 10; step += 1) {
      const rotorAngle = 0;
      rotorBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(rotorAngle / 2),
        z: 0,
        w: Math.cos(rotorAngle / 2),
      });
      world.step();
      const translation = ballBody.translation();
      const velocity = ballBody.linvel();
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const radius = Math.hypot(translation.x, translation.z);
      const localHeight = translation.y - PHYSICS_Y_OFFSET;
      maxSpeed = Math.max(maxSpeed, speed);

      if (
        radius > 3.18 ||
        localHeight < -0.82 ||
        localHeight > 2.8
      ) {
        tunneled = true;
      }
      if (speed > Math.max(14, initialSpeed * 4 + 3)) velocitySpike = true;
      if (previousVelocity) {
        const previousSpeed = Math.hypot(
          previousVelocity.x,
          previousVelocity.y,
          previousVelocity.z,
        );
        const dot =
          previousVelocity.x * velocity.x +
          previousVelocity.y * velocity.y +
          previousVelocity.z * velocity.z;
        if (previousSpeed > 0.28 && speed > 0.28 && dot < 0) directionChanged = true;
        if (previousVelocity.y < -0.18 && velocity.y > 0.12) rebound = true;
      }
      previousVelocity = velocity;

      if (
        speed < 0.55 &&
        radius > 1.1 &&
        radius < 2.92 &&
        localHeight > -0.42 &&
        localHeight < 1.3
      ) {
        stableFrames += 1;
        if (stableFrames >= 90) stable = true;
      } else {
        stableFrames = 0;
      }
    }

    const translation = ballBody.translation();
    const velocity = ballBody.linvel();
    const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const finalRadius = Math.hypot(translation.x, translation.z);
    const angledResponse = directionChanged && Math.abs(release.velocity[0]) > 0.2 && Math.abs(release.velocity[2]) > 0.2;
    const trapped =
      !stable &&
      finalSpeed < 0.03 &&
      finalRadius < 1.1 &&
      translation.y - PHYSICS_Y_OFFSET < 0.4;
    const passed = !tunneled && !velocitySpike && !trapped && stable;
    results.push({
      id: `ball-test-${String(index + 1).padStart(2, '0')}`,
      label: `Variation ${String(index + 1).padStart(2, '0')}`,
      passed,
      rebound,
      directionChanged,
      stable,
      tunneled,
      velocitySpike,
      trapped,
      angledResponse,
      maxSpeed,
      finalSpeed,
      finalRadius,
      finalHeight: translation.y,
      detail: passed
        ? `${rebound ? 'Rebound' : 'Low-energy settle'} · ${directionChanged ? 'direction changed' : 'guided contact'}`
        : tunneled
          ? 'Escaped modeled bounds / possible tunneling'
          : velocitySpike
            ? 'Velocity exceeded the safety envelope'
            : trapped
              ? 'Physics-out-of-bounds trap detected'
            : 'Did not reach a stable low-energy rest',
    });
    world.removeRigidBody(ballBody);
    world.free();
  }

  const passedCount = results.filter((result) => result.passed).length;
  const reboundCount = results.filter((result) => result.rebound).length;
  const directionChangeCount = results.filter((result) => result.directionChanged).length;
  const stableSettlingCount = results.filter((result) => result.stable).length;
  const angledResponseCount = results.filter((result) => result.angledResponse).length;
  const tunnelingCount = results.filter((result) => result.tunneled).length;
  const velocitySpikeCount = results.filter((result) => result.velocitySpike).length;
  const trapCount = results.filter((result) => result.trapped).length;
  const maxObservedSpeed = Math.max(...results.map((result) => result.maxSpeed));
  const aggregatePassed =
    passedCount === testCount &&
    reboundCount >= 60 &&
    directionChangeCount >= 50 &&
    stableSettlingCount === testCount &&
    angledResponseCount >= 40 &&
    tunnelingCount === 0 &&
    velocitySpikeCount === 0 &&
    trapCount === 0;

  return {
    status: aggregatePassed ? 'passed' : 'failed',
    testCount,
    passedCount,
    failedCount: testCount - passedCount,
    reboundCount,
    directionChangeCount,
    stableSettlingCount,
    angledResponseCount,
    tunnelingCount,
    velocitySpikeCount,
    trapCount,
    maxObservedSpeed,
    durationMs: Math.round(performance.now() - startedAt),
    detail: aggregatePassed
      ? `${testCount} varied dynamic-body tests passed at ${Math.round(1 / FIXED_TIMESTEP)} Hz with CCD.`
      : `Review needed: ${testCount - passedCount} of ${testCount} varied tests missed the acceptance envelope.`,
    results: results.slice(0, 10),
  };
}

function createBallVisual(parameters: BallPhysicsParameters) {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(parameters.radius, 40, 24),
    new THREE.MeshPhysicalMaterial({
      color: '#f5f1dc',
      roughness: 0.14,
      metalness: 0.14,
      clearcoat: 0.42,
      clearcoatRoughness: 0.16,
      emissive: '#6d776c',
      emissiveIntensity: 0.06,
    }),
  );
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(
      parameters.radius * 0.975,
      parameters.radius * 0.032,
      10,
      64,
    ),
    new THREE.MeshPhysicalMaterial({
      color: '#a19c88',
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.18,
      clearcoatRoughness: 0.24,
    }),
  );
  seam.name = 'PhysicsLabBall__rotationSeam';
  seam.rotation.x = Math.PI / 2;
  seam.castShadow = true;
  seam.userData = {
    visualRole: 'rigidly-attached-rotation-seam',
    independentAnimation: false,
  };
  ball.add(seam);

  const asymmetryMark = new THREE.Mesh(
    new THREE.SphereGeometry(parameters.radius * 0.036, 12, 8),
    new THREE.MeshPhysicalMaterial({
      color: '#67685f',
      roughness: 0.2,
      metalness: 0.06,
      clearcoat: 0.12,
      clearcoatRoughness: 0.28,
    }),
  );
  asymmetryMark.name = 'PhysicsLabBall__rotationMark';
  asymmetryMark.position.set(
    0,
    parameters.radius * 0.48,
    parameters.radius * 0.86,
  );
  asymmetryMark.castShadow = true;
  asymmetryMark.userData = {
    visualRole: 'asymmetric-rotation-reference',
    independentAnimation: false,
  };
  ball.add(asymmetryMark);

  ball.name = 'PhysicsLabBall__dynamicRigidBody';
  ball.castShadow = true;
  ball.userData = {
    dynamicBodyAttached: true,
    sourceMeshUsed: false,
    colliderShape: 'exact sphere',
    radius: parameters.radius,
    rotationReadout: 'seam-band + asymmetric mark inherit body quaternion',
  };
  return ball;
}

function SceneViewport({
  loadKey,
  view,
  showGrid,
  showPhysicsDebug,
  showBallPlaceholder,
  showStationaryGroup,
  showRotorGroup,
  showSectorOverlay,
  rotorAngle,
  rotorTestRequest,
  probeTestRequest,
  ballValidationRequest,
  part4RunRequest,
  part5RunRequest,
  ballParameters,
  rotorParameters,
  launchParameters,
  ballCommand,
  onStateChange,
  onAudit,
  onRotorAngleChange,
  onRotorTestState,
  onPhysicsReport,
  onBallState,
  onBallValidationReport,
  onPart4State,
  onPart4ValidationReport,
  onPart5ValidationReport,
}: {
  loadKey: number;
  view: InspectionView;
  showGrid: boolean;
  showPhysicsDebug: boolean;
  showBallPlaceholder: boolean;
  showStationaryGroup: boolean;
  showRotorGroup: boolean;
  showSectorOverlay: boolean;
  rotorAngle: number;
  rotorTestRequest: number;
  probeTestRequest: number;
  ballValidationRequest: number;
  part4RunRequest: number;
  part5RunRequest: number;
  ballParameters: BallPhysicsParameters;
  rotorParameters: RotorPhysicsParameters;
  launchParameters: BallLaunchParameters;
  ballCommand: BallCommand;
  onStateChange: (state: LoadState, detail?: string) => void;
  onAudit: (audit: AssetAudit) => void;
  onRotorAngleChange: (angle: number) => void;
  onRotorTestState: (state: 'idle' | 'running' | 'passed', detail?: string) => void;
  onPhysicsReport: (report: PhysicsReport) => void;
  onBallState: (state: 'ready' | 'active' | 'settled', detail?: string) => void;
  onBallValidationReport: (report: BallValidationReport) => void;
  onPart4State: (state: 'ready' | 'active' | 'complete', detail?: string) => void;
  onPart4ValidationReport: (report: Part4ValidationReport) => void;
  onPart5ValidationReport: (report: Part5ValidationReport) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onAuditRef = useRef(onAudit);
  const resetRef = useRef<(() => void) | null>(null);
  const applyViewRef = useRef<((nextView: InspectionView) => void) | null>(null);
  const viewRef = useRef(view);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const physicsDebugRef = useRef<THREE.Group | null>(null);
  const ballRef = useRef<THREE.Mesh | null>(null);
  const stationaryGroupRef = useRef<THREE.Group | null>(null);
  const rotorGroupRef = useRef<THREE.Group | null>(null);
  const sectorDebugRef = useRef<THREE.Group | null>(null);
  const onRotorAngleChangeRef = useRef(onRotorAngleChange);
  const onRotorTestStateRef = useRef(onRotorTestState);
  const onPhysicsReportRef = useRef(onPhysicsReport);
  const onBallStateRef = useRef(onBallState);
  const onBallValidationReportRef = useRef(onBallValidationReport);
  const onPart4StateRef = useRef(onPart4State);
  const onPart4ValidationReportRef = useRef(onPart4ValidationReport);
  const onPart5ValidationReportRef = useRef(onPart5ValidationReport);
  const physicsSpecsRef = useRef<ColliderSpec[]>([]);
  const physicsWorldRef = useRef<RAPIER.World | null>(null);
  const rotorPhysicsBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const ballBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const ballParametersRef = useRef<BallPhysicsParameters>(ballParameters);
  const rotorParametersRef = useRef<RotorPhysicsParameters>(rotorParameters);
  const launchParametersRef = useRef<BallLaunchParameters>(launchParameters);
  const rebuildBallRef = useRef<((parameters: BallPhysicsParameters) => void) | null>(null);
  const releaseBallRef = useRef<((profileIndex: number) => void) | null>(null);
  const startPart4Ref = useRef<(() => void) | null>(null);
  const syncBallRef = useRef<(() => void) | null>(null);
  const variedReleaseIndexRef = useRef(0);

  onStateChangeRef.current = onStateChange;
  onAuditRef.current = onAudit;
  onRotorAngleChangeRef.current = onRotorAngleChange;
  onRotorTestStateRef.current = onRotorTestState;
  onPhysicsReportRef.current = onPhysicsReport;
  onBallStateRef.current = onBallState;
  onBallValidationReportRef.current = onBallValidationReport;
  onPart4StateRef.current = onPart4State;
  onPart4ValidationReportRef.current = onPart4ValidationReport;
  onPart5ValidationReportRef.current = onPart5ValidationReport;
  ballParametersRef.current = ballParameters;
  rotorParametersRef.current = rotorParameters;
  launchParametersRef.current = launchParameters;
  viewRef.current = view;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let disposed = false;
    let frame = 0;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let wheelRoot: THREE.Group | null = null;
    let grid: THREE.GridHelper | null = null;
    let floor: THREE.Mesh | null = null;
    let physicsWorld: RAPIER.World | null = null;
    let physicsLastTime = performance.now();
    let physicsAccumulator = 0;

    onStateChangeRef.current('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);

      camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      camera.position.set(...VIEW_PRESETS.angled.position);

      const keyLight = new THREE.DirectionalLight('#fff8df', 4.1);
      keyLight.position.set(4, 8, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#9fc7ca', 2.4);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);
      const rimLight = new THREE.PointLight('#cf8f62', 16, 13, 2);
      rimLight.position.set(2, 2, -5);
      scene.add(rimLight);
      scene.add(new THREE.HemisphereLight('#b3d4d2', '#0e171b', 1.4));

      grid = new THREE.GridHelper(16, 16, '#567277', '#2f474d');
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      gridRef.current = grid;
      scene.add(grid);

      floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({
          color: '#1b2e33',
          roughness: 0.94,
          metalness: 0.05,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;

      const applyView = (nextView: InspectionView) => {
        if (!camera || !controls) return;
        const preset = VIEW_PRESETS[nextView];
        camera.up.set(...preset.up);
        camera.position.set(...preset.position);
        controls.target.set(0, 0, 0);
        controls.update();
      };
      applyViewRef.current = applyView;
      applyView(viewRef.current);

      const loader = new GLTFLoader();
      loader.load(
        ASSET_PATH,
        async (gltf) => {
          if (disposed || !scene || !grid || !floor) return;

          const sourceMeshCount = countMeshes(gltf.scene);
          const sourceTriangles = countTriangles(gltf.scene);
          const { runtimeScene, sourceCenter, normalizationScale, excludedGeometry } =
            normalizedSourceScene(gltf.scene);

          wheelRoot = new THREE.Group();
          wheelRoot.name = 'PhysicsLabWheel__normalizedRuntime';
          wheelRoot.userData = {
            sourceAsset: ASSET_PATH,
            sourceUntouched: true,
            rotationAxis: 'Y',
            physicsCollidersAttached: false,
          };
          const runtimeOffset = new THREE.Group();
          runtimeOffset.name = 'RouletteVisualRuntime__derived';
          runtimeOffset.add(runtimeScene);
          runtimeOffset.position.copy(sourceCenter).multiplyScalar(-1);
          runtimeOffset.scale.setScalar(normalizationScale);
          wheelRoot.add(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);

          const runtimeWorldBounds = new THREE.Box3().setFromObject(runtimeScene);
          const runtimeWorldCenter = runtimeWorldBounds.getCenter(new THREE.Vector3());
          runtimeOffset.position.sub(runtimeWorldCenter);
          wheelRoot.updateMatrixWorld(true);

          const { stationaryGroup, rotorGroup } = decomposeVisualScene(runtimeScene, wheelRoot);
          wheelRoot.remove(runtimeOffset);
          stationaryGroupRef.current = stationaryGroup;
          rotorGroupRef.current = rotorGroup;
          rotorGroup.rotation.y = THREE.MathUtils.degToRad(rotorAngle);
          wheelRoot.updateMatrixWorld(true);

          const normalizedBounds = new THREE.Box3().setFromObject(wheelRoot);
          const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
          const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());

          const baseY = -normalizedSize.y / 2 - 0.28;
          grid.position.y = baseY;
          floor.position.y = baseY - 0.02;

          const physicsDebug = new THREE.Group();
           physicsDebug.name = 'PhysicsColliderDebug__primitiveCompound';
           physicsDebug.userData = {
             collidersReady: false,
             sourceMeshUsedAsCollider: false,
             fixedTimestepHz: Math.round(1 / FIXED_TIMESTEP),
             ccd: true,
           };
          const axes = new THREE.AxesHelper(1.35);
          axes.name = 'WheelPivotAxes__YUp';
          physicsDebug.add(axes);
          const pivotMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 16, 8),
            new THREE.MeshBasicMaterial({ color: '#d38b72' }),
          );
          pivotMarker.name = 'WheelPivotMarker__origin';
          physicsDebug.add(pivotMarker);
          const pivotRing = new THREE.Mesh(
            new THREE.RingGeometry(2.2, 2.215, 96),
            new THREE.MeshBasicMaterial({
              color: '#d38b72',
              transparent: true,
              opacity: 0.68,
              side: THREE.DoubleSide,
            }),
          );
          pivotRing.name = 'PhysicsDebugRing__futureColliderReference';
          pivotRing.rotation.x = -Math.PI / 2;
          pivotRing.position.y = 0.03;
          physicsDebug.add(pivotRing);
           const colliderSpecs = buildColliderSpecs();
           physicsSpecsRef.current = colliderSpecs;
           colliderSpecs.forEach((spec) => physicsDebug.add(makePhysicsDebugMesh(spec)));
          physicsDebug.visible = showPhysicsDebug;
          physicsDebugRef.current = physicsDebug;
          wheelRoot.add(physicsDebug);

           try {
             await RAPIER.init();
             if (disposed) return;
              physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
             physicsWorld.timestep = FIXED_TIMESTEP;
              physicsWorld.maxCcdSubsteps = 8;
             const stationaryBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed());
              const rotorBody = createDynamicRotorBody(
                physicsWorld,
                rotorParametersRef.current,
              );
             colliderSpecs
               .filter((spec) => spec.body === 'stationary')
               .forEach((spec) => addRapierCollider(physicsWorld!, stationaryBody, spec));
             colliderSpecs
               .filter((spec) => spec.body === 'rotor')
                .forEach((spec) => addRapierCollider(physicsWorld!, rotorBody, spec, 0.4, 0.18));
             physicsWorldRef.current = physicsWorld;
             rotorPhysicsBodyRef.current = rotorBody;
             physicsDebug.userData = {
               ...physicsDebug.userData,
               collidersReady: true,
               colliderCount: colliderSpecs.length,
             };
           } catch (physicsError) {
             console.error('Rapier collider model failed to initialize', physicsError);
             onPhysicsReportRef.current({
               ...EMPTY_PHYSICS_REPORT,
               status: 'failed',
               detail: 'Rapier could not initialize the primitive collider model.',
             });
           }

           if (physicsWorld && wheelRoot) {
             const defaultPositionFor = (parameters: BallPhysicsParameters) =>
               outerTrackContactPosition(
                 13.5 * SECTOR_STEP_RADIANS + 0.0015,
                 parameters.radius,
               );
             const removeCurrentBall = () => {
               if (ballBodyRef.current) {
                 physicsWorld?.removeRigidBody(ballBodyRef.current);
                 ballBodyRef.current = null;
               }
               if (ballRef.current) {
                 ballRef.current.parent?.remove(ballRef.current);
                 ballRef.current.traverse((child) => {
                   if (!(child instanceof THREE.Mesh)) return;
                   child.geometry.dispose();
                   const materials = Array.isArray(child.material)
                     ? child.material
                     : [child.material];
                   materials.forEach((item) => item.dispose());
                 });
                 ballRef.current = null;
               }
             };
             const syncBallVisual = () => {
               const body = ballBodyRef.current;
               const mesh = ballRef.current;
               if (!body || !mesh) return;
               const translation = body.translation();
               const rotation = body.rotation();
               mesh.position.set(translation.x, translation.y, translation.z);
               mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
             };
             const rebuildBall = (parameters: BallPhysicsParameters) => {
               removeCurrentBall();
               const defaultPosition = defaultPositionFor(parameters);
               const mesh = createBallVisual(parameters);
               mesh.position.set(...defaultPosition);
               mesh.userData.dynamicBodyAttached = true;
               mesh.userData.colliderCenterOffset = [0, 0, 0];
               wheelRoot?.add(mesh);
               ballRef.current = mesh;
               ballBodyRef.current = createDynamicBallBody(
                 physicsWorld!,
                 parameters,
                 defaultPosition,
                 [0, 0, 0],
                  parameters.initialAngularVelocity,
                  false,
               );
               syncBallVisual();
               onBallStateRef.current('ready', `Dynamic sphere · ${parameters.radius.toFixed(3)} wu radius · exact Rapier ball collider`);
             };
             const releaseBall = (profileIndex: number) => {
               const body = ballBodyRef.current;
               const parameters = ballParametersRef.current;
               if (!body) return;
               const release = variedBallRelease(profileIndex, parameters);
               body.setTranslation(
                 {
                   x: release.position[0],
                   y: release.position[1],
                   z: release.position[2],
                 },
                 true,
               );
               body.setLinvel(
                 {
                   x: release.velocity[0],
                   y: release.velocity[1],
                   z: release.velocity[2],
                 },
                 true,
               );
               body.setAngvel({ x: 0, y: 0, z: -release.angularVelocity }, true);
               body.wakeUp();
               syncBallVisual();
               onBallStateRef.current(
                 'active',
                 `Release ${String(profileIndex + 1).padStart(2, '0')} · CCD enabled · ${Math.hypot(...release.velocity).toFixed(2)} wu/s`,
               );
             };
              const startPart4 = () => {
                const body = ballBodyRef.current;
                const rotorBody = rotorPhysicsBodyRef.current;
                if (!body || !rotorBody) return;
                const release = part4LaunchProfile(
                  0,
                  ballParametersRef.current,
                  launchParametersRef.current,
                );
                rotorBody.setAngvel(
                  {
                    x: 0,
                    y: rotorParametersRef.current.initialAngularVelocity,
                    z: 0,
                  },
                  true,
                );
                body.setTranslation(
                  {
                    x: release.position[0],
                    y: release.position[1],
                    z: release.position[2],
                  },
                  true,
                );
                body.setLinvel(
                  {
                    x: release.velocity[0],
                    y: release.velocity[1],
                    z: release.velocity[2],
                  },
                  true,
                );
                body.setAngvel(
                  {
                    x: release.spinAxis[0] * release.spin,
                    y: 0,
                    z: release.spinAxis[2] * release.spin,
                  },
                  true,
                );
                rotorBody.wakeUp();
                body.wakeUp();
                syncBallVisual();
                onPart4StateRef.current(
                  'active',
                  `Coupled launch · rotor ${rotorParametersRef.current.initialAngularVelocity.toFixed(2)} rad/s · ball ${Math.hypot(...release.velocity).toFixed(2)} wu/s`,
                );
              };
             rebuildBallRef.current = rebuildBall;
             releaseBallRef.current = releaseBall;
              startPart4Ref.current = startPart4;
             syncBallRef.current = syncBallVisual;
             rebuildBall(ballParametersRef.current);
           }

          const sectorDebug = new THREE.Group();
          sectorDebug.name = 'SectorIndexDebug__37EuropeanPockets';
          const sectorBoundaryPositions: number[] = [];
          const pocketInner = 0.258 * WORLD_UNITS_PER_METER;
          const pocketOuter = 0.313 * WORLD_UNITS_PER_METER;
          const sectorOverlayY = 0.74;
          for (let index = 0; index < SECTOR_COUNT; index += 1) {
            const angle = -index * SECTOR_STEP_RADIANS;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            sectorBoundaryPositions.push(
              sin * pocketInner,
              sectorOverlayY,
              cos * pocketInner,
              sin * pocketOuter,
              sectorOverlayY,
              cos * pocketOuter,
            );
          }
          const boundaryGeometry = new THREE.BufferGeometry();
          boundaryGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(sectorBoundaryPositions, 3),
          );
          const sectorBoundaries = new THREE.LineSegments(
            boundaryGeometry,
            new THREE.LineBasicMaterial({
              color: '#e1ad86',
              transparent: true,
              opacity: 0.72,
            }),
          );
          sectorBoundaries.name = 'SectorBoundaries__37';
          sectorDebug.add(sectorBoundaries);
          const pocketRing = new THREE.Mesh(
            new THREE.RingGeometry(
              0.286 * WORLD_UNITS_PER_METER - 0.012,
              0.286 * WORLD_UNITS_PER_METER + 0.012,
              128,
            ),
            new THREE.MeshBasicMaterial({
              color: '#e1ad86',
              transparent: true,
              opacity: 0.42,
              side: THREE.DoubleSide,
            }),
          );
          pocketRing.rotation.x = -Math.PI / 2;
          pocketRing.position.y = sectorOverlayY;
          pocketRing.name = 'PocketReferenceRing__0.286m';
          sectorDebug.add(pocketRing);
          sectorDebug.visible = showSectorOverlay;
          sectorDebugRef.current = sectorDebug;
          wheelRoot.add(sectorDebug);

          scene.add(wheelRoot);
          wheelRoot.updateMatrixWorld(true);

          const json = gltf.parser.json as {
            asset?: { extras?: Record<string, string> };
          };
          const extras = json.asset?.extras ?? {};
          onAuditRef.current({
            sourceMeshCount,
            sourceTriangles,
            runtimeMeshCount: countMeshes(stationaryGroup) + countMeshes(rotorGroup),
            runtimeTriangles: countTriangles(stationaryGroup) + countTriangles(rotorGroup),
            normalizationScale,
            dimensions: roundedVector(normalizedSize),
            pivot: roundedVector(normalizedCenter),
            sourcePivot: roundedVector(sourceCenter),
            sourceRoot: gltf.scene.name || 'Sketchfab_model',
            excludedGeometry,
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

          onStateChangeRef.current('loaded');
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('Roulette visual source failed to load', error);
          onStateChangeRef.current('error', 'The visual source could not be read.');
        },
      );

      resetRef.current = () => applyView(viewRef.current);

      const resize = () => {
        if (!camera || !renderer) return;
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();

      const render = () => {
        if (disposed || !renderer || !scene || !camera || !controls) return;
         const now = performance.now();
         physicsAccumulator += Math.min((now - physicsLastTime) / 1000, 0.1);
         physicsLastTime = now;
         while (physicsAccumulator >= FIXED_TIMESTEP && physicsWorld && rotorPhysicsBodyRef.current) {
           physicsWorld.step();
            const rotorRotation = rotorPhysicsBodyRef.current.rotation();
            if (rotorGroupRef.current) {
              rotorGroupRef.current.quaternion.set(
                rotorRotation.x,
                rotorRotation.y,
                rotorRotation.z,
                rotorRotation.w,
              );
            }
           syncBallRef.current?.();
           physicsAccumulator -= FIXED_TIMESTEP;
         }
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls?.dispose();
        renderer?.dispose();
        scene?.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        applyViewRef.current = null;
        resetRef.current = null;
        gridRef.current = null;
        physicsDebugRef.current = null;
         physicsSpecsRef.current = [];
         physicsWorldRef.current?.free();
         physicsWorldRef.current = null;
         rotorPhysicsBodyRef.current = null;
         ballBodyRef.current = null;
         rebuildBallRef.current = null;
         releaseBallRef.current = null;
         syncBallRef.current = null;
        ballRef.current = null;
        stationaryGroupRef.current = null;
        rotorGroupRef.current = null;
        sectorDebugRef.current = null;
        wheelRoot = null;
      };
    } catch (error) {
      console.error('Roulette visual source scene failed to initialize', error);
      onStateChangeRef.current('error', 'WebGL could not initialize in this browser.');
      return undefined;
    }
  }, [loadKey]);

  useEffect(() => {
    applyViewRef.current?.(view);
  }, [view]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (physicsDebugRef.current) physicsDebugRef.current.visible = showPhysicsDebug;
  }, [showPhysicsDebug]);

  useEffect(() => {
    if (ballRef.current) ballRef.current.visible = showBallPlaceholder;
  }, [showBallPlaceholder]);

  useEffect(() => {
    if (stationaryGroupRef.current) stationaryGroupRef.current.visible = showStationaryGroup;
  }, [showStationaryGroup]);

  useEffect(() => {
    if (rotorGroupRef.current) rotorGroupRef.current.visible = showRotorGroup;
  }, [showRotorGroup]);

  useEffect(() => {
    if (sectorDebugRef.current) sectorDebugRef.current.visible = showSectorOverlay;
  }, [showSectorOverlay]);

  useEffect(() => {
    if (rotorTestRequest === 0) return;
    onRotorTestStateRef.current('running', 'Physics rotor + tangential launch active');
    startPart4Ref.current?.();
  }, [rotorTestRequest]);

  useEffect(() => {
    if (probeTestRequest === 0 || physicsSpecsRef.current.length === 0) return undefined;
    let cancelled = false;
    onPhysicsReportRef.current({
      ...EMPTY_PHYSICS_REPORT,
      status: 'running',
      colliderCount: physicsSpecsRef.current.length,
      stationaryCount: physicsSpecsRef.current.filter((spec) => spec.body === 'stationary').length,
      rotorCount: physicsSpecsRef.current.filter((spec) => spec.body === 'rotor').length,
      detail: `Running deterministic drops at ${Math.round(1 / FIXED_TIMESTEP)} Hz with CCD…`,
    });
    void runDropProbeValidation(physicsSpecsRef.current).then((report) => {
      if (!cancelled) onPhysicsReportRef.current(report);
    });
    return () => {
      cancelled = true;
    };
  }, [probeTestRequest]);

  useEffect(() => {
    if (ballCommand.token === 0) return;
    if (ballCommand.kind === 'apply' || ballCommand.kind === 'reset') {
      rebuildBallRef.current?.(ballParametersRef.current);
      return;
    }
    if (ballCommand.kind === 'release') {
      releaseBallRef.current?.(0);
      return;
    }
    const profileIndex = variedReleaseIndexRef.current % BALL_VALIDATION_TEST_COUNT;
    variedReleaseIndexRef.current += 1;
    releaseBallRef.current?.(profileIndex);
  }, [ballCommand]);

  useEffect(() => {
    if (ballValidationRequest === 0 || physicsSpecsRef.current.length === 0) return undefined;
    let cancelled = false;
    onBallValidationReportRef.current({
      ...EMPTY_BALL_REPORT,
      status: 'running',
       testCount: BALL_VALIDATION_TEST_COUNT,
       detail: `Running ${BALL_VALIDATION_TEST_COUNT} varied dynamic-body tests at ${Math.round(1 / FIXED_TIMESTEP)} Hz with CCD…`,
    });
    void runBallValidation(physicsSpecsRef.current, ballParametersRef.current).then((report) => {
      if (!cancelled) onBallValidationReportRef.current(report);
    });
    return () => {
      cancelled = true;
    };
  }, [ballValidationRequest]);

  useEffect(() => {
    if (part4RunRequest === 0 || physicsSpecsRef.current.length === 0) return undefined;
    let cancelled = false;
    onPart4ValidationReportRef.current({
      ...EMPTY_PART4_REPORT,
      status: 'running',
      testCount: PART4_SPIN_TEST_COUNT,
      detail: `Running ${PART4_SPIN_TEST_COUNT} complete coupled rotor/ball spins at ${Math.round(1 / FIXED_TIMESTEP)} Hz…`,
    });
    void runPart4Validation(
      physicsSpecsRef.current,
      ballParametersRef.current,
      rotorParametersRef.current,
      launchParametersRef.current,
    ).then((report) => {
      if (!cancelled) {
        onPart4ValidationReportRef.current(report);
        onPart4StateRef.current(
          report.status === 'passed' ? 'complete' : 'ready',
          report.detail,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [part4RunRequest]);

  useEffect(() => {
    if (part5RunRequest === 0 || physicsSpecsRef.current.length === 0) return undefined;
    let cancelled = false;
    onPart5ValidationReportRef.current({
      ...EMPTY_PART5_REPORT,
      status: 'running',
      testCount: PART5_SPIN_TEST_COUNT,
      detail: `Running ${PART5_SPIN_TEST_COUNT} full physical chains at ${Math.round(1 / FIXED_TIMESTEP)} Hz…`,
    });
    void runPart5Validation(
      physicsSpecsRef.current,
      ballParametersRef.current,
      rotorParametersRef.current,
      launchParametersRef.current,
    ).then((report) => {
      if (!cancelled) onPart5ValidationReportRef.current(report);
    });
    return () => {
      cancelled = true;
    };
  }, [part5RunRequest]);

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Interactive 3D roulette physics lab preview" />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>{VIEW_LABELS[view]}</span>
        <span>Y+ AXIS · PIVOT / 0,0,0</span>
      </div>
      <div className={`grid-status ${showGrid ? 'is-visible' : ''}`} aria-hidden="true">
        <Grid3X3 size={13} />
        <span>REFERENCE GRID</span>
      </div>
      {showPhysicsDebug && (
        <div className="debug-status" aria-hidden="true">
          <Crosshair size={13} />
          <span>PRIMITIVE COLLIDERS · {Math.round(1 / FIXED_TIMESTEP)} HZ · CCD</span>
        </div>
      )}
    </div>
  );
}

function StatusChip({ state }: { state: LoadState }) {
  const content = {
    loading: {
      label: 'Reading source',
      icon: <CircleDot className="status-icon status-pulse" size={13} />,
    },
    loaded: { label: 'Source loaded', icon: <Check className="status-icon" size={13} /> },
    error: {
      label: 'Load blocked',
      icon: <AlertTriangle className="status-icon" size={13} />,
    },
  }[state];
  return (
    <div
      className={`status-chip status-${state}`}
      data-testid="status-asset-load"
      aria-live="polite"
      role="status"
    >
      {content.icon}
      <span>{content.label}</span>
    </div>
  );
}

function AuditMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="audit-metric">
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

function BallParameterField({
  label,
  value,
  min,
  max,
  step,
  unit,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ball-parameter">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          data-testid={testId}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function AuthoritativeRoundPanel() {
  const queryClient = useQueryClient();
  const currentRound = useGetPhysicsLabCurrentRound({
    query: {
      queryKey: getGetPhysicsLabCurrentRoundQueryKey(),
      staleTime: Infinity,
      retry: false,
    },
  });
  const createRound = useCreatePhysicsLabRound();
  const round = currentRound.data;

  const refreshRound = () => {
    void currentRound.refetch();
  };
  const generateRound = () => {
    createRound.mutate(undefined, {
      onSuccess: (nextRound) => {
        queryClient.setQueryData(
          getGetPhysicsLabCurrentRoundQueryKey(),
          nextRound,
        );
      },
    });
  };

  return (
    <section className="authoritative-round-panel" data-testid="physics-lab-part6">
      <div className="section-kicker">PART 6 · SERVER-AUTHORITATIVE ROUND</div>
      <div className="authoritative-round-header">
        <div>
          <h2>Official result from the server simulation</h2>
          <p>
            This panel never runs a client result calculation. The API server owns the seed,
            Rapier simulation, stable settle, winning number, and replay trajectory.
          </p>
        </div>
        <div className="authoritative-round-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refreshRound}
            disabled={currentRound.isFetching}
            data-testid="button-refresh-authoritative-round"
          >
            {currentRound.isFetching ? 'Refreshing…' : 'Refresh snapshot'}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={generateRound}
            disabled={createRound.isPending}
            data-testid="button-generate-authoritative-round"
          >
            {createRound.isPending ? 'Simulating server round…' : 'Generate server round'}
          </button>
        </div>
      </div>

      {currentRound.isLoading && (
        <div className="authoritative-round-status is-loading" data-testid="authoritative-round-loading">
          Loading the global round from the API server…
        </div>
      )}
      {currentRound.isError && (
        <div className="authoritative-round-status is-error" data-testid="authoritative-round-error">
          Server round unavailable. No client-side fallback result is allowed.
        </div>
      )}
      {createRound.isError && (
        <div className="authoritative-round-status is-error" data-testid="authoritative-round-create-error">
          The server rejected the round generation; the previous official round remains unchanged.
        </div>
      )}
      {round && <AuthoritativeRoundDetails round={round} />}
    </section>
  );
}

function AuthoritativeRoundDetails({ round }: { round: PhysicsLabRound }) {
  const eventTypes = [
    'TRACK_ENTRY',
    'NATURAL_INWARD_EXIT',
    'DEFLECTOR_IMPACT',
    'MOVING_FRET_CONTACT',
    'POCKET_ENTRY',
    'STABLE_SETTLE',
  ] as const;
  const eventsByType = new Map(round.events.map((event) => [event.type, event]));
  const eventLabel: Record<(typeof eventTypes)[number], string> = {
    TRACK_ENTRY: 'track',
    NATURAL_INWARD_EXIT: 'inward',
    DEFLECTOR_IMPACT: 'deflector',
    MOVING_FRET_CONTACT: 'moving fret',
    POCKET_ENTRY: 'pocket',
    STABLE_SETTLE: 'stable settle',
  };

  return (
    <div className="authoritative-round-body">
      <div
        className={`authoritative-round-result ${round.status === 'SETTLED' ? 'is-settled' : 'is-invalid'}`}
        data-testid="authoritative-round-result"
      >
        <span>{round.status === 'SETTLED' ? 'OFFICIAL WINNING NUMBER' : 'INVALID SIMULATION'}</span>
        <strong>{round.winningNumber ?? '—'}</strong>
        <small>
          {round.finalPocket
            ? `Pocket ${round.finalPocket.index} · ${round.finalPocket.number}`
            : round.errorCode ?? 'No official result'}
        </small>
      </div>
      <div className="authoritative-round-metrics">
        <AuditMetric label="Round ID" value={round.roundId.slice(0, 18)} testId="authoritative-round-id" />
        <AuditMetric label="Sequence" value={String(round.sequence)} testId="authoritative-round-sequence" />
        <AuditMetric label="Stable step" value={round.stableSettleStep === null ? '—' : String(round.stableSettleStep)} testId="authoritative-round-stable-step" />
        <AuditMetric label="Trajectory" value={`${round.trajectory.length} samples`} testId="authoritative-round-trajectory-count" />
        <AuditMetric label="Replay hash" value={round.trajectoryHash.slice(0, 12)} testId="authoritative-round-hash" />
        <AuditMetric label="Server sim" value={`${round.simulationDurationMs} ms`} testId="authoritative-round-duration" />
      </div>
      <div className="authoritative-round-events" aria-label="Authoritative physics event timeline">
        {eventTypes.map((type) => {
          const item = eventsByType.get(type);
          return (
            <span className={item ? 'event-chip is-present' : 'event-chip'} key={type}>
              {eventLabel[type]} {item ? `${(item.simulatedAtMs / 1000).toFixed(2)}s` : '—'}
            </span>
          );
        })}
      </div>
      <div className="authoritative-round-conditions">
        <span>seed {round.startConditions.seed.slice(0, 16)}…</span>
        <span>launch {round.startConditions.launchSpeed.toFixed(2)} m/s</span>
        <span>spin {round.startConditions.ballSpin.toFixed(2)}</span>
        <span>rotor {round.startConditions.rotorInitialAngularVelocity.toFixed(3)} rad/s</span>
        <span>timestamps persisted</span>
      </div>
    </div>
  );
}

function App() {
  const [loadKey, setLoadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorDetail, setErrorDetail] = useState('');
  const [view, setView] = useState<InspectionView>('angled');
  const [showGrid, setShowGrid] = useState(true);
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(false);
  const [showBallPlaceholder, setShowBallPlaceholder] = useState(true);
  const [showStationaryGroup, setShowStationaryGroup] = useState(true);
  const [showRotorGroup, setShowRotorGroup] = useState(true);
  const [showSectorOverlay, setShowSectorOverlay] = useState(false);
  const [rotorAngle, setRotorAngle] = useState(0);
  const [rotorTestRequest, setRotorTestRequest] = useState(0);
  const [rotorTestState, setRotorTestState] = useState<'idle' | 'running' | 'passed'>('idle');
  const [rotorTestDetail, setRotorTestDetail] = useState('Reference angle · 0.0°');
  const [audit, setAudit] = useState<AssetAudit | null>(null);
  const [probeTestRequest, setProbeTestRequest] = useState(0);
  const [physicsReport, setPhysicsReport] = useState<PhysicsReport>(EMPTY_PHYSICS_REPORT);
  const [ballParameters, setBallParameters] = useState<BallPhysicsParameters>({
    ...DEFAULT_BALL_PARAMETERS,
  });
  const [rotorParameters, setRotorParameters] = useState<RotorPhysicsParameters>({
    ...DEFAULT_ROTOR_PARAMETERS,
  });
  const [launchParameters, setLaunchParameters] = useState<BallLaunchParameters>({
    ...DEFAULT_LAUNCH_PARAMETERS,
  });
  const [ballCommand, setBallCommand] = useState<BallCommand>({ kind: 'reset', token: 0 });
  const [ballState, setBallState] = useState<'ready' | 'active' | 'settled'>('ready');
  const [ballStateDetail, setBallStateDetail] = useState('Waiting for the dynamic body.');
  const [ballValidationRequest, setBallValidationRequest] = useState(0);
  const [ballValidationReport, setBallValidationReport] =
    useState<BallValidationReport>(EMPTY_BALL_REPORT);
  const [part4RunRequest, setPart4RunRequest] = useState(0);
  const [part4State, setPart4State] = useState<'ready' | 'active' | 'complete'>('ready');
  const [part4StateDetail, setPart4StateDetail] = useState(
    'Real rotor dynamics and launch are waiting.',
  );
  const [part4Report, setPart4Report] =
    useState<Part4ValidationReport>(EMPTY_PART4_REPORT);
  const [part5RunRequest, setPart5RunRequest] = useState(0);
  const [part5Report, setPart5Report] =
    useState<Part5ValidationReport>(EMPTY_PART5_REPORT);

  const handleStateChange = useCallback((state: LoadState, detail?: string) => {
    setLoadState(state);
    setErrorDetail(detail ?? '');
  }, []);

  const resetView = () => window.dispatchEvent(new Event('roulette-reset-view'));
  const resetRotor = () => {
    setRotorAngle(0);
    setRotorTestState('idle');
    setRotorTestDetail('Reference angle · 0.0°');
  };
  const runRotorTest = () => {
    setRotorTestState('running');
    setRotorTestDetail('Physics rotor + tangential launch');
    setRotorTestRequest((current) => current + 1);
  };
  const runProbeTest = () => {
    setProbeTestRequest((current) => current + 1);
  };
  const issueBallCommand = (kind: BallCommandKind) => {
    setBallCommand((current) => ({ kind, token: current.token + 1 }));
  };
  const updateBallParameter = (key: keyof BallPhysicsParameters, value: number) => {
    setBallParameters((current) => ({ ...current, [key]: value }));
  };
  const updateRotorParameter = (key: keyof RotorPhysicsParameters, value: number) => {
    setRotorParameters((current) => ({ ...current, [key]: value }));
  };
  const updateLaunchParameter = (key: keyof BallLaunchParameters, value: number) => {
    setLaunchParameters((current) => ({ ...current, [key]: value }));
  };
  const runBallValidation = () => {
    setBallValidationReport({
      ...EMPTY_BALL_REPORT,
      status: 'running',
       detail: `Running ${BALL_VALIDATION_TEST_COUNT} varied dynamic-body tests at ${Math.round(1 / FIXED_TIMESTEP)} Hz with CCD…`,
    });
    setBallValidationRequest((current) => current + 1);
  };
  const runPart4Audit = () => {
    setPart4Report({
      ...EMPTY_PART4_REPORT,
      status: 'running',
      testCount: PART4_SPIN_TEST_COUNT,
      detail: `Running ${PART4_SPIN_TEST_COUNT} complete coupled rotor/ball spins…`,
    });
    setPart4State('active');
    setPart4StateDetail(`Running ${PART4_SPIN_TEST_COUNT} complete physics spins…`);
    setPart4RunRequest((current) => current + 1);
  };
  const runPart5Audit = () => {
    setPart5Report({
      ...EMPTY_PART5_REPORT,
      status: 'running',
      testCount: PART5_SPIN_TEST_COUNT,
      detail: `Running ${PART5_SPIN_TEST_COUNT} full physical chains…`,
    });
    setPart5RunRequest((current) => current + 1);
  };
  const retryLoad = () => {
    setAudit(null);
    setLoadKey((current) => current + 1);
  };
  const handleRotorTestState = useCallback(
    (state: 'idle' | 'running' | 'passed', detail?: string) => {
      setRotorTestState(state);
      if (detail) setRotorTestDetail(detail);
    },
    [],
  );
  const handleBallState = useCallback(
    (state: 'ready' | 'active' | 'settled', detail?: string) => {
      setBallState(state);
      if (detail) setBallStateDetail(detail);
    },
    [],
  );
  const handlePart4State = useCallback(
    (state: 'ready' | 'active' | 'complete', detail?: string) => {
      setPart4State(state);
      if (detail) setPart4StateDetail(detail);
    },
    [],
  );

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Layers3 size={18} strokeWidth={1.7} />
          </div>
          <div>
             <div className="eyebrow">ISOLATED PHYSICS LAB · PART 3</div>
             <h1>Roulette / real rigid-body ball</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className="build-tag">LAB-01</span>
          <StatusChip state={loadState} />
        </div>
      </header>

      <div className="lab-layout">
        <aside className="inspector-rail">
          <div className="rail-intro">
              <div className="section-kicker">
              <Crosshair size={13} /> PART 3 · DYNAMIC BALL
            </div>
            <p>Keep the premium visual source separate from clean primitive colliders, then validate temporary drops at a fixed timestep.</p>
          </div>

          <section className="inspector-section">
            <div className="section-label">SOURCE OBJECT</div>
            <div className="asset-name">
              <Box size={17} />
              <div>
                <strong>roulette-visual-source</strong>
                <span>GLB / untouched source reference</span>
              </div>
            </div>
            <div className="data-row">
              <span>File path</span>
              <code data-testid="text-asset-path">{ASSET_PATH}</code>
            </div>
            <div className="data-row">
              <span>Runtime object</span>
              <span className="value-muted">Derived normalized copy</span>
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">INSPECTION VIEWS</div>
            <div className="view-switcher" role="group" aria-label="Inspection view">
              {(Object.keys(VIEW_LABELS) as InspectionView[]).map((viewKey) => (
                <button
                  type="button"
                  className={`view-button ${view === viewKey ? 'is-active' : ''}`}
                  onClick={() => setView(viewKey)}
                  aria-pressed={view === viewKey}
                  data-testid={`button-view-${viewKey}`}
                  key={viewKey}
                >
                  <span>{VIEW_LABELS[viewKey]}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">DEVELOPER CONTROLS</div>
            <div className="control-list">
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowGrid((visible) => !visible)}
                aria-pressed={showGrid}
                data-testid="button-grid-toggle"
              >
                <span>
                  <Grid3X3 size={15} /> Reference grid
                </span>
                <span className={`toggle ${showGrid ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowBallPlaceholder((visible) => !visible)}
                aria-pressed={showBallPlaceholder}
                data-testid="button-ball-toggle"
              >
                <span>
                    <CircleDot size={15} /> Dynamic ball visibility
                </span>
                <span className={`toggle ${showBallPlaceholder ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowPhysicsDebug((visible) => !visible)}
                aria-pressed={showPhysicsDebug}
                data-testid="button-physics-debug-toggle"
              >
                <span>
                   <Crosshair size={15} /> Collider debug geometry
                </span>
                <span className={`toggle ${showPhysicsDebug ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowStationaryGroup((visible) => !visible)}
                aria-pressed={showStationaryGroup}
                data-testid="button-stationary-toggle"
              >
                <span>
                  <Layers3 size={15} /> Stationary bowl group
                </span>
                <span className={`toggle ${showStationaryGroup ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowRotorGroup((visible) => !visible)}
                aria-pressed={showRotorGroup}
                data-testid="button-rotor-toggle"
              >
                <span>
                  <RotateCcw size={15} /> Rotating rotor group
                </span>
                <span className={`toggle ${showRotorGroup ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowSectorOverlay((visible) => !visible)}
                aria-pressed={showSectorOverlay}
                data-testid="button-sector-overlay-toggle"
              >
                <span>
                  <Ruler size={15} /> 37-sector overlay
                </span>
                <span className={`toggle ${showSectorOverlay ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button type="button" className="rail-control" onClick={resetView} data-testid="button-reset-view">
                <span>
                  <RotateCcw size={15} /> Reset framing
                </span>
                <ChevronRight size={14} />
              </button>
            </div>
          </section>

          <section className="inspector-section rotor-test-panel">
            <div className="section-label">PART 4 · PHYSICAL ROTOR DYNAMICS</div>
            <div className="rotor-angle-readout">
              <span>Axis lock</span>
              <strong data-testid="text-rotor-angle">Y+ / 0°</strong>
            </div>
            <div className="ball-parameter-grid">
              <BallParameterField
                label="Rotor angular velocity"
                value={rotorParameters.initialAngularVelocity}
                min={0.5}
                max={12}
                step={0.1}
                unit="rad/s"
                testId="input-rotor-angular-velocity"
                onChange={(value) => updateRotorParameter('initialAngularVelocity', value)}
              />
              <BallParameterField
                label="Rotor angular damping"
                value={rotorParameters.angularDamping}
                min={0}
                max={0.5}
                step={0.005}
                unit="s⁻¹"
                testId="input-rotor-angular-damping"
                onChange={(value) => updateRotorParameter('angularDamping', value)}
              />
              <BallParameterField
                label="Rotor mass"
                value={rotorParameters.mass}
                min={0.2}
                max={10}
                step={0.1}
                unit="kg"
                testId="input-rotor-mass"
                onChange={(value) => updateRotorParameter('mass', value)}
              />
              <BallParameterField
                label="Launch speed"
                value={launchParameters.speed}
                min={1}
                max={8}
                step={0.05}
                unit="wu/s"
                testId="input-launch-speed"
                onChange={(value) => updateLaunchParameter('speed', value)}
              />
              <BallParameterField
                label="Launch angle"
                value={launchParameters.angle}
                min={-12}
                max={30}
                step={0.5}
                unit="°"
                testId="input-launch-angle"
                onChange={(value) => updateLaunchParameter('angle', value)}
              />
              <BallParameterField
                label="Initial ball spin"
                value={launchParameters.initialSpin}
                min={0}
                max={80}
                step={1}
                unit="rad/s"
                testId="input-launch-spin"
                onChange={(value) => updateLaunchParameter('initialSpin', value)}
              />
              <BallParameterField
                label="Launch variation"
                value={launchParameters.variation}
                min={0}
                max={0.25}
                step={0.01}
                unit="ratio"
                testId="input-launch-variation"
                onChange={(value) => updateLaunchParameter('variation', value)}
              />
            </div>
            <div className="rotor-test-actions">
              <button type="button" className="secondary-button" onClick={resetRotor} data-testid="button-rotor-reset">
                Reset reference
              </button>
              <button type="button" className="primary-button" onClick={runRotorTest} data-testid="button-rotor-test">
                Launch coupled spin
              </button>
            </div>
            <div className={`rotor-test-status rotor-test-${rotorTestState}`} data-testid="status-rotor-test">
              <span>{rotorTestState === 'passed' ? 'PHYSICS ROTOR READY' : rotorTestState === 'running' ? 'COUPLED SPIN ACTIVE' : 'READY'}</span>
              <small>{rotorTestDetail}</small>
            </div>
          </section>

          <section className="inspector-section rotor-test-panel" data-testid="physics-probe-panel">
            <div className="section-label">DROP-PROBE VALIDATION</div>
            <div className="physics-summary">
              <div>
                <span>Fixed step</span>
                <strong>{Math.round(1 / FIXED_TIMESTEP)} Hz</strong>
              </div>
              <div>
                <span>Colliders</span>
                <strong>{physicsReport.colliderCount || '—'}</strong>
              </div>
              <div>
                <span>CCD probes</span>
                <strong>{physicsReport.probeCount || '—'}</strong>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={runProbeTest}
              disabled={physicsReport.status === 'running' || !audit}
              data-testid="button-run-probes"
            >
              {physicsReport.status === 'running' ? 'Running temporary probes…' : 'Run 5 drop probes'}
            </button>
            <div className={`probe-status probe-${physicsReport.status}`} data-testid="status-probes">
              <span>
                {physicsReport.status === 'passed'
                  ? 'COLLIDER PROBES PASSED'
                  : physicsReport.status === 'failed'
                    ? 'GEOMETRY REVIEW NEEDED'
                    : physicsReport.status === 'running'
                      ? 'PROBES RUNNING'
                      : 'READY FOR VALIDATION'}
              </span>
              <small>{physicsReport.detail}</small>
            </div>
          </section>

          <section className="inspector-section rotor-test-panel ball-controls-panel" data-testid="ball-controls-panel">
            <div className="section-label">PART 3 · REAL RIGID-BODY BALL</div>
            <div className="ball-identity">
              <strong>Rapier dynamic sphere</strong>
              <span>Visual center = body center = exact sphere collider center</span>
              <small>Default diameter {((DEFAULT_BALL_PARAMETERS.radius * 2) / WORLD_UNITS_PER_METER).toFixed(3)} m · pocket pitch {(1 / SECTOR_COUNT * 2 * Math.PI * ROTOR_RADIUS / WORLD_UNITS_PER_METER).toFixed(3)} m</small>
            </div>
            <div className="ball-parameter-grid">
              <BallParameterField
                label="Ball radius"
                value={ballParameters.radius}
                min={0.06}
                max={0.12}
                step={0.001}
                unit="wu"
                testId="input-ball-radius"
                onChange={(value) => updateBallParameter('radius', value)}
              />
              <BallParameterField
                label="Mass"
                value={ballParameters.mass}
                min={0.008}
                max={0.08}
                step={0.001}
                unit="kg"
                testId="input-ball-mass"
                onChange={(value) => updateBallParameter('mass', value)}
              />
              <BallParameterField
                label="Friction"
                value={ballParameters.friction}
                min={0.02}
                max={1}
                step={0.01}
                unit="μ"
                testId="input-ball-friction"
                onChange={(value) => updateBallParameter('friction', value)}
              />
              <BallParameterField
                label="Restitution"
                value={ballParameters.restitution}
                min={0}
                max={0.95}
                step={0.01}
                unit="e"
                testId="input-ball-restitution"
                onChange={(value) => updateBallParameter('restitution', value)}
              />
              <BallParameterField
                label="Linear damping"
                value={ballParameters.linearDamping}
                min={0}
                max={0.5}
                step={0.005}
                unit="s⁻¹"
                testId="input-ball-linear-damping"
                onChange={(value) => updateBallParameter('linearDamping', value)}
              />
              <BallParameterField
                label="Angular damping"
                value={ballParameters.angularDamping}
                min={0}
                max={0.5}
                step={0.005}
                unit="s⁻¹"
                testId="input-ball-angular-damping"
                onChange={(value) => updateBallParameter('angularDamping', value)}
              />
              <BallParameterField
                label="Initial angular velocity"
                value={ballParameters.initialAngularVelocity}
                min={0}
                max={80}
                step={1}
                unit="rad/s"
                testId="input-ball-spin"
                onChange={(value) => updateBallParameter('initialAngularVelocity', value)}
              />
            </div>
            <div className="rotor-test-actions">
              <button type="button" className="secondary-button" onClick={() => issueBallCommand('apply')} data-testid="button-apply-ball-settings">
                Apply + reset ball
              </button>
              <button type="button" className="primary-button" onClick={() => issueBallCommand('release')} data-testid="button-release-ball">
                Release selected drop
              </button>
            </div>
            <div className="rotor-test-actions">
              <button type="button" className="secondary-button" onClick={() => issueBallCommand('varied')} data-testid="button-release-varied-ball">
                Release varied drop
              </button>
              <button type="button" className="primary-button" onClick={runBallValidation} disabled={ballValidationReport.status === 'running' || !audit} data-testid="button-run-ball-validation">
                 {ballValidationReport.status === 'running' ? `Running ${BALL_VALIDATION_TEST_COUNT} tests…` : `Run ${BALL_VALIDATION_TEST_COUNT} collision tests`}
              </button>
            </div>
            <div className={`probe-status ball-runtime-${ballState}`} data-testid="status-ball-runtime">
              <span>{ballState === 'active' ? 'DYNAMIC BALL ACTIVE' : ballState === 'settled' ? 'BALL SETTLED' : 'DYNAMIC BALL READY'}</span>
              <small>{ballStateDetail}</small>
            </div>
            <div className={`probe-status probe-${ballValidationReport.status}`} data-testid="status-ball-validation">
              <span>
                {ballValidationReport.status === 'passed'
                   ? `${BALL_VALIDATION_TEST_COUNT}-TEST BALL VALIDATION PASSED`
                  : ballValidationReport.status === 'failed'
                    ? 'BALL VALIDATION NEEDS REVIEW'
                    : ballValidationReport.status === 'running'
                       ? `${BALL_VALIDATION_TEST_COUNT}-TEST BALL VALIDATION RUNNING`
                      : 'BALL VALIDATION READY'}
              </span>
              <small>{ballValidationReport.detail}</small>
            </div>
          </section>

          <section className="inspector-section rotor-test-panel" data-testid="part4-validation-panel">
            <div className="section-label">PART 4 · COUPLED SPIN ACCEPTANCE</div>
            <div className="physics-summary">
              <div>
                <span>Runtime spins</span>
                <strong>{part4Report.testCount || PART4_SPIN_TEST_COUNT}</strong>
              </div>
              <div>
                <span>Fixed step</span>
                <strong>{Math.round(1 / FIXED_TIMESTEP)} Hz</strong>
              </div>
              <div>
                <span>CCD</span>
                <strong>8 substeps</strong>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={runPart4Audit}
              disabled={part4Report.status === 'running' || !audit}
              data-testid="button-run-part4-validation"
            >
              {part4Report.status === 'running'
                ? `Running ${PART4_SPIN_TEST_COUNT} full spins…`
                : `Run ${PART4_SPIN_TEST_COUNT} full runtime spins`}
            </button>
            <div className={`probe-status probe-${part4Report.status}`} data-testid="status-part4-validation">
              <span>
                {part4Report.status === 'passed'
                  ? 'PART 4 ACCEPTANCE PASSED'
                  : part4Report.status === 'failed'
                    ? 'PART 4 ACCEPTANCE NEEDS REVIEW'
                    : part4Report.status === 'running'
                      ? 'PART 4 AUDIT RUNNING'
                      : 'PART 4 AUDIT READY'}
              </span>
              <small>{part4Report.detail}</small>
            </div>
            {part4Report.testCount > 0 && (
              <div className="physics-summary" data-testid="part4-validation-metrics">
                <div>
                  <span>Completed</span>
                  <strong>{part4Report.completedCount}/{part4Report.testCount}</strong>
                </div>
                <div>
                  <span>Median spin</span>
                  <strong>{part4Report.medianDurationSeconds.toFixed(1)} s</strong>
                </div>
                <div>
                  <span>Range</span>
                  <strong>{part4Report.minDurationSeconds.toFixed(1)}–{part4Report.maxDurationSeconds.toFixed(1)} s</strong>
                </div>
                <div>
                  <span>Moving contact energy</span>
                  <strong>{part4Report.movingContactEnergyCount}/{part4Report.testCount}</strong>
                </div>
                <div>
                  <span>Track contact at launch</span>
                  <strong>{part4Report.outerTrackLaunchContactCount}/{part4Report.testCount}</strong>
                </div>
                <div>
                  <span>Track contact phase</span>
                  <strong>{part4Report.outerTrackContactPassCount}/{part4Report.testCount}</strong>
                </div>
                <div>
                  <span>Floating outer-track runs</span>
                  <strong>{part4Report.floatingOuterTrackCount}</strong>
                </div>
                <div>
                  <span>Independent slowdown</span>
                  <strong>{part4Report.independentSlowdownCount}/{part4Report.testCount}</strong>
                </div>
                <div>
                  <span>Path repeats</span>
                  <strong>{part4Report.repeatedPathCount}</strong>
                </div>
                <div>
                  <span>Fixed-radius paths</span>
                  <strong>{part4Report.fixedRadiusCount}</strong>
                </div>
              </div>
            )}
            {part4Report.testCount > 0 && (
              <div className="ball-validation-safety" data-testid="part4-validation-safety">
                <span className={part4Report.rotorWobbleCount === 0 ? 'is-good' : 'is-bad'}>
                  {part4Report.rotorWobbleCount} rotor wobble / drift
                </span>
                <span className={part4Report.tunnelingCount === 0 ? 'is-good' : 'is-bad'}>
                  {part4Report.tunnelingCount} tunneling / escape
                </span>
                <span className={part4Report.velocityExplosionCount === 0 ? 'is-good' : 'is-bad'}>
                  {part4Report.velocityExplosionCount} velocity explosions
                </span>
                <span className={part4Report.invalidTrapCount === 0 ? 'is-good' : 'is-bad'}>
                  {part4Report.invalidTrapCount} invalid traps
                </span>
                <span className={part4Report.outerTrackLaunchContactCount === part4Report.testCount ? 'is-good' : 'is-bad'}>
                  {part4Report.outerTrackLaunchContactCount} launch contacts
                </span>
                <span className={part4Report.outerTrackContactPassCount === part4Report.testCount ? 'is-good' : 'is-bad'}>
                  {part4Report.outerTrackContactPassCount} continuous track contacts
                </span>
                <span className={part4Report.floatingOuterTrackCount === 0 ? 'is-good' : 'is-bad'}>
                  {part4Report.floatingOuterTrackCount} floating outer-track runs
                </span>
                <span className={part4Report.fpsIndependent ? 'is-good' : 'is-bad'}>
                  {part4Report.fpsIndependent ? 'fixed-step / FPS independent' : 'FPS dependent'}
                </span>
              </div>
            )}
            {part4Report.results.length > 0 && (
              <div className="probe-result-list" data-testid="part4-result-rows">
                {part4Report.results.map((result) => (
                  <div className="probe-result-row" key={result.id}>
                    <span>{result.id}</span>
                    <strong>{result.completed ? 'complete' : 'review'}</strong>
                    <small>
                      {result.durationSeconds.toFixed(1)} s · r {result.finalRadius.toFixed(2)} · Δr {result.pathVariance.toFixed(2)} ·
                      y {result.finalHeight.toFixed(2)} ·
                      track {result.outerTrackContactFrames}/{result.outerTrackPhaseFrames} ·
                      {result.movingContactEnergy ? ' moving contact' : ' no moving contact'}
                      {result.tunneled ? ' · escape' : ''}
                      {result.velocityExplosion ? ' · velocity spike' : ''}
                    </small>
                  </div>
                ))}
              </div>
            )}
            <div className={`probe-status probe-${part4State}`} data-testid="status-part4-runtime">
              <span>{part4State === 'active' ? 'COUPLED PHYSICS ACTIVE' : part4State === 'complete' ? 'COUPLED PHYSICS READY' : 'COUPLED PHYSICS READY'}</span>
              <small>{part4StateDetail}</small>
            </div>
          </section>

          <section className="inspector-section rotor-test-panel" data-testid="part5-validation-panel">
            <div className="section-label">PART 5 · FULL PHYSICAL CHAIN</div>
            <div className="physics-summary">
              <div>
                <span>Physical spins</span>
                <strong>{part5Report.testCount || PART5_SPIN_TEST_COUNT}</strong>
              </div>
              <div>
                <span>Stable window</span>
                <strong>{(PART5_STABLE_WINDOW_FRAMES / (1 / FIXED_TIMESTEP)).toFixed(1)} s</strong>
              </div>
              <div>
                <span>Timeout</span>
                <strong>{PART5_DURATION_LIMIT_SECONDS} s</strong>
              </div>
            </div>
            <p className="panel-helper">
              Natural rigid-body route only: outer track → energy loss → inward drop → deflector / moving fret contact → pocket bounce → stable settle.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={runPart5Audit}
              disabled={part5Report.status === 'running' || !audit}
              data-testid="button-run-part5-validation"
            >
              {part5Report.status === 'running'
                ? `Running ${PART5_SPIN_TEST_COUNT} full physical spins…`
                : `Run ${PART5_SPIN_TEST_COUNT} full physical spins`}
            </button>
            <div className={`probe-status probe-${part5Report.status}`} data-testid="status-part5-validation">
              <span>
                {part5Report.status === 'passed'
                  ? 'PART 5 ACCEPTANCE PASSED'
                  : part5Report.status === 'failed'
                    ? 'PART 5 ACCEPTANCE NEEDS REVIEW'
                    : part5Report.status === 'running'
                      ? 'PART 5 AUDIT RUNNING'
                      : 'PART 5 AUDIT READY'}
              </span>
              <small>{part5Report.detail}</small>
            </div>
            {part5Report.testCount > 0 && (
              <>
                <div className="physics-summary" data-testid="part5-validation-metrics">
                  <div>
                    <span>Complete chain</span>
                    <strong>{part5Report.chainCompleteCount}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Stable settle</span>
                    <strong>{part5Report.completedCount}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Deflector hit</span>
                    <strong>{part5Report.deflectorHitCount}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Moving fret</span>
                    <strong>{part5Report.movingFretContactCount}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Pocket change / bounce</span>
                    <strong>{part5Report.pocketChangeCount} / {part5Report.bounceCount}</strong>
                  </div>
                  <div>
                    <span>Final pocket mapped</span>
                    <strong>{part5Report.pocketInteractionCount}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Settle median</span>
                    <strong>{part5Report.medianSettleSeconds.toFixed(1)} s</strong>
                  </div>
                  <div>
                    <span>Target settle band</span>
                    <strong>{part5Report.settleTimesInTarget}/{part5Report.testCount}</strong>
                  </div>
                  <div>
                    <span>Debug traces</span>
                    <strong>{part5Report.slowMotionDebugSampleCount}/{PART5_DEBUG_SAMPLE_COUNT}</strong>
                  </div>
                </div>
                <div className="ball-validation-safety" data-testid="part5-validation-safety">
                  <span className={part5Report.timeoutCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.timeoutCount} timeouts
                  </span>
                  <span className={part5Report.escapeCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.escapeCount} geometry escapes
                  </span>
                  <span className={part5Report.nanCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.nanCount} NaN states
                  </span>
                  <span className={part5Report.permanentTrapCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.permanentTrapCount} permanent traps
                  </span>
                  <span className={part5Report.impossibleRestingCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.impossibleRestingCount} impossible rests
                  </span>
                  <span className={part5Report.tunnelingCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.tunnelingCount} tunneling
                  </span>
                  <span className={part5Report.velocityExplosionCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.velocityExplosionCount} velocity explosions
                  </span>
                  <span className={part5Report.repeatedPathCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.repeatedPathCount} repeated paths
                  </span>
                  <span className={part5Report.fixedRadiusCount === 0 ? 'is-good' : 'is-bad'}>
                    {part5Report.fixedRadiusCount} fixed-radius paths
                  </span>
                </div>
              </>
            )}
            {part5Report.results.length > 0 && (
              <div className="probe-result-list" data-testid="part5-result-rows">
                {part5Report.results.map((result) => (
                  <div className="probe-result-row" key={result.id}>
                    <span>{result.id}</span>
                    <strong>{result.chainComplete ? 'complete' : 'review'}</strong>
                    <small>
                      {result.settleSeconds.toFixed(1)} s · pocket {result.finalPocketNumber ?? '—'} ·
                      {result.deflectorHit ? ' deflector' : ' no deflector'} ·
                      {result.movingFretContact ? ' moving fret' : ' no fret'} ·
                      {result.pocketChangeCount} changes / {result.bounceCount} bounces ·
                      r {result.finalRadius.toFixed(2)} · y {result.finalHeight.toFixed(2)} ·
                      v {result.finalSpeed.toFixed(2)} ·
                      ω {result.finalAngularSpeed.toFixed(2)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <AuthoritativeRoundPanel />

          <section className="physics-note" data-testid="status-physics">
            <div className="note-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
                <strong>Part 5 · isolated full-chain physics</strong>
                <p>The rotor remains a Y-axis constrained dynamic body. Part 5 uses only gravity, friction, restitution, collider geometry, and momentum; production launch, betting, round timing, and /roulette remain disconnected.</p>
            </div>
          </section>

          <div className="rail-footer">
            <div className="rail-footer-line">
              <MousePointer2 size={13} /> Drag to orbit · scroll to zoom
            </div>
            <div className="rail-footer-line">
              <Ruler size={13} /> Physical standard · {(TARGET_WHEEL_DIAMETER * METERS_PER_WORLD_UNIT).toFixed(3)} m diameter
            </div>
          </div>
        </aside>

        <section className="workbench">
          <div className="workbench-toolbar">
            <div className="toolbar-title">
              <span className="live-dot" aria-hidden="true" />
              <span>SCENE PREVIEW</span>
              <span className="toolbar-divider" />
                <span className="toolbar-muted">REAL RIGID-BODY SIMULATION</span>
            </div>
            <div className="toolbar-actions">
              <span className="toolbar-metric">
                <Eye size={14} /> {VIEW_LABELS[view]}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={resetView}
                aria-label="Reset camera framing"
                data-testid="button-toolbar-reset"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <div className="viewport-wrap">
            <SceneViewport
              loadKey={loadKey}
              view={view}
              showGrid={showGrid}
              showPhysicsDebug={showPhysicsDebug}
              showBallPlaceholder={showBallPlaceholder}
              showStationaryGroup={showStationaryGroup}
              showRotorGroup={showRotorGroup}
              showSectorOverlay={showSectorOverlay}
              rotorAngle={rotorAngle}
              rotorTestRequest={rotorTestRequest}
               probeTestRequest={probeTestRequest}
               ballValidationRequest={ballValidationRequest}
              part4RunRequest={part4RunRequest}
              part5RunRequest={part5RunRequest}
               ballParameters={ballParameters}
              rotorParameters={rotorParameters}
              launchParameters={launchParameters}
               ballCommand={ballCommand}
              onStateChange={handleStateChange}
              onAudit={setAudit}
              onRotorAngleChange={setRotorAngle}
              onRotorTestState={handleRotorTestState}
               onPhysicsReport={setPhysicsReport}
               onBallState={handleBallState}
               onBallValidationReport={setBallValidationReport}
              onPart4State={handlePart4State}
              onPart4ValidationReport={setPart4Report}
            onPart5ValidationReport={setPart5Report}
            />
            {loadState === 'loading' && (
              <div className="viewport-overlay" data-testid="status-loading" role="status" aria-live="polite">
                <div className="loader-graphic">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>Loading visual source</strong>
                <span>Auditing roulette-visual-source.glb</span>
              </div>
            )}
            {loadState === 'error' && (
              <div className="viewport-overlay error-overlay" data-testid="status-error" role="alert">
                <TriangleAlert size={21} />
                <strong>Source unavailable</strong>
                <span>{errorDetail || 'Check the asset path and try again.'}</span>
                <button type="button" onClick={retryLoad} data-testid="button-load-retry">
                  Retry load
                </button>
              </div>
            )}
            {loadState === 'loaded' && (
              <div className="loaded-stamp" data-testid="status-loaded">
                <Check size={13} /> SOURCE READY
              </div>
            )}
          </div>

          <div className="workbench-caption">
            <div className="caption-left">
              <SlidersHorizontal size={14} /> <span>Orbit controls enabled for inspection</span>
            </div>
            <div className="caption-right">
              <span>PIVOT / Y+</span>
              <span>LIGHTING / 04</span>
              <span>GRID / {showGrid ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          <section className="audit-panel" aria-label="Asset audit">
            <div className="audit-heading">
              <div>
                <div className="section-label">FORMAL ASSET AUDIT</div>
                <strong>Source hierarchy → normalized runtime</strong>
              </div>
              <span className={`audit-state ${audit ? 'is-ready' : ''}`} data-testid="status-audit">
                {audit ? 'AUDIT READY' : 'WAITING FOR LOAD'}
              </span>
            </div>
            <div className="audit-metrics">
              <AuditMetric label="Source meshes" value={audit ? String(audit.sourceMeshCount) : '—'} testId="text-source-mesh-count" />
              <AuditMetric label="Source triangles" value={audit ? audit.sourceTriangles.toLocaleString() : '—'} testId="text-source-triangle-count" />
              <AuditMetric label="Runtime meshes" value={audit ? String(audit.runtimeMeshCount) : '—'} testId="text-runtime-mesh-count" />
              <AuditMetric label="World dimensions" value={audit ? `${audit.dimensions.x} × ${audit.dimensions.y} × ${audit.dimensions.z}` : '—'} testId="text-world-dimensions" />
              <AuditMetric label="Final pivot" value={audit ? `${audit.pivot.x}, ${audit.pivot.y}, ${audit.pivot.z}` : '—'} testId="text-final-pivot" />
            </div>
            <div className="decomposition-strip">
              <div>
                <span>STATIONARY BOWL</span>
                <strong data-testid="text-stationary-group">
                  {audit ? `${audit.stationaryMeshCount} meshes · ${audit.stationaryTriangles.toLocaleString()} tris` : '—'}
                </strong>
              </div>
              <div>
                <span>ROTATING ROTOR</span>
                <strong data-testid="text-rotor-group">
                  {audit ? `${audit.rotorMeshCount} meshes · ${audit.rotorTriangles.toLocaleString()} tris` : '—'}
                </strong>
              </div>
              <div>
                <span>VISUAL / PHYSICS</span>
                <strong>Shared origin · separate geometry</strong>
              </div>
            </div>
            <div className="audit-details">
              <div>
                <span className="section-label">CLASSIFICATION</span>
                <div className="hierarchy-list">
                  {HIERARCHY_AUDIT.map((item) => (
                    <div className="hierarchy-row" key={item.label}>
                      <strong>{item.label}</strong>
                      <span>{item.nodes}</span>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="measurement-block">
                <span className="section-label">PHYSICAL SCALE · METERS</span>
                <div className="measurement-list">
                  {PHYSICAL_MEASUREMENTS.map((measurement) => (
                    <div className="measurement-row" key={measurement.label}>
                      <span>{measurement.label}</span>
                      <strong>{measurement.value}</strong>
                      <small>{measurement.detail}</small>
                    </div>
                  ))}
                </div>
                <div className="sequence-audit" data-testid="sequence-audit">
                  <span className="section-label">NUMBER RING AUDIT</span>
                  <strong>EUROPEAN SINGLE-ZERO · VERIFIED</strong>
                  <code>{EUROPEAN_SEQUENCE.join(' · ')}</code>
                  <small>
                    Index 0 = 0 at +Z / 6 o’clock; increasing index follows visual clockwise
                    order toward 32. One pocket immediately inward per printed sector.
                    Δθ = {(360 / SECTOR_COUNT).toFixed(4)}°.
                  </small>
                </div>
              </div>
              <div className="attribution-block">
                <span className="section-label">ATTRIBUTION / SOURCE METADATA</span>
                {audit ? (
                  <>
                    <a href={audit.attribution.source} target="_blank" rel="noreferrer" data-testid="link-source-attribution">
                      {audit.attribution.source}
                    </a>
                    <span data-testid="text-source-author">{audit.attribution.author}</span>
                    <span data-testid="text-source-license">{audit.attribution.license}</span>
                    <span className="source-pivot-readout" data-testid="text-source-pivot">
                      Raw wheel center: {audit.sourcePivot.x}, {audit.sourcePivot.y}, {audit.sourcePivot.z} · scale ×{audit.normalizationScale.toFixed(4)}
                    </span>
                  </>
                ) : (
                  <span>Metadata will appear after the source loads.</span>
                )}
              </div>
            </div>
          </section>
          {physicsReport.results.length > 0 && (
            <section className="probe-report-panel" aria-label="Drop probe results" data-testid="probe-report">
              <div className="audit-heading">
                <div>
                  <div className="section-label">TEMPORARY DROP-PROBE REPORT</div>
                  <strong>CCD contact check · no production ball launch</strong>
                </div>
                <span className={`audit-state ${physicsReport.status === 'passed' ? 'is-ready' : ''}`}>
                  {physicsReport.passedCount}/{physicsReport.probeCount} RESTING
                </span>
              </div>
              <div className="probe-result-list">
                {physicsReport.results.map((result) => (
                  <div className="probe-result-row" key={result.id}>
                    <span className={`probe-result-dot probe-result-${result.outcome}`} />
                    <strong>{result.label}</strong>
                    <span>{result.detail}</span>
                    <code>
                      r {result.finalRadius.toFixed(2)} · y {result.finalHeight.toFixed(2)} · v {result.finalSpeed.toFixed(2)}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          )}
          {ballValidationReport.testCount > 0 && (
            <section className="probe-report-panel ball-validation-report" aria-label="Dynamic ball validation results" data-testid="ball-validation-report">
              <div className="audit-heading">
                <div>
                  <div className="section-label">PART 3 · DYNAMIC BALL VALIDATION</div>
                  <strong>Real rigid body · real angular rotation · no scripted path</strong>
                </div>
                <span className={`audit-state ${ballValidationReport.status === 'passed' ? 'is-ready' : ''}`}>
                  {ballValidationReport.passedCount}/{ballValidationReport.testCount} PASS
                </span>
              </div>
              <div className="ball-validation-metrics">
                <AuditMetric label="Rebound response" value={`${ballValidationReport.reboundCount}/${ballValidationReport.testCount}`} testId="text-ball-rebounds" />
                <AuditMetric label="Direction changes" value={`${ballValidationReport.directionChangeCount}/${ballValidationReport.testCount}`} testId="text-ball-direction-changes" />
                <AuditMetric label="Stable settle" value={`${ballValidationReport.stableSettlingCount}/${ballValidationReport.testCount}`} testId="text-ball-stable-settles" />
                <AuditMetric label="Angled response" value={`${ballValidationReport.angledResponseCount}/${ballValidationReport.testCount}`} testId="text-ball-angled-responses" />
                <AuditMetric label="Max observed speed" value={`${ballValidationReport.maxObservedSpeed.toFixed(2)} wu/s`} testId="text-ball-max-speed" />
              </div>
              <div className="ball-validation-safety">
                <span className={ballValidationReport.tunnelingCount === 0 ? 'is-good' : 'is-bad'}>
                  {ballValidationReport.tunnelingCount} tunneling / bounds escapes
                </span>
                <span className={ballValidationReport.velocitySpikeCount === 0 ? 'is-good' : 'is-bad'}>
                  {ballValidationReport.velocitySpikeCount} velocity spikes
                </span>
                <span className={ballValidationReport.trapCount === 0 ? 'is-good' : 'is-bad'}>
                  {ballValidationReport.trapCount} physics-out-of-bounds traps
                </span>
                <span>120 Hz fixed step · CCD substeps 8 · sphere collider exact-match</span>
              </div>
              <div className="probe-result-list">
                {ballValidationReport.results.map((result) => (
                  <div className="probe-result-row" key={result.id}>
                    <span className={`probe-result-dot ${result.passed ? 'probe-result-resting' : 'probe-result-trap'}`} />
                    <strong>{result.label}</strong>
                    <span>{result.detail}</span>
                    <code>
                      max {result.maxSpeed.toFixed(2)} · final {result.finalSpeed.toFixed(2)} · {result.finalRadius.toFixed(2)}r
                    </code>
                  </div>
                ))}
              </div>
              <small className="validation-limitation">
                Remaining limitation: this lab intentionally stops at isolated rigid-body validation; production launch timing, networking, betting results, and Part 4 are not connected.
              </small>
            </section>
          )}
        </section>
      </div>

      <footer className="lab-footer">
       <span>ROULETTE PHYSICS LAB · PART 3</span>
        <span className="footer-rule" />
       <span>Real dynamic ball · isolated collision validation</span>
        <span className="footer-build">
           <Download size={12} /> ISOLATED LAB
        </span>
      </footer>
    </main>
  );
}

export default App;