import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
const BALL_RADIUS = 0.13;
const ROTOR_RADIUS = 1.72;
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

type ColliderSpec = {
  id: string;
  label: string;
  body: 'stationary' | 'rotor';
  position: [number, number, number];
  halfExtents: [number, number, number];
  rotation: [number, number, number, number];
  color: string;
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

function radialPosition(radius: number, angle: number, y: number): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
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
      rotation: yQuaternion(angle + radialOffset),
      color,
    });
  }
}

function buildColliderSpecs(): ColliderSpec[] {
  const specs: ColliderSpec[] = [];
  const stationaryColor = '#76b9b1';
  const rotorColor = '#d9a06f';

  // Stationary bowl: segmented primitive rings approximate the measured slope
  // without ever using the premium GLB as a collision mesh.
  addRingSpecs(specs, {
    id: 'bowl-transition-outer',
    label: 'Bowl transition',
    body: 'stationary',
    count: 48,
    radius: 2.30,
    y: 0.48,
    halfExtents: [0.15, 0.045, 0.10],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'bowl-transition-inner',
    label: 'Bowl transition',
    body: 'stationary',
    count: 48,
    radius: 2.05,
    y: 0.28,
    halfExtents: [0.14, 0.045, 0.10],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'bowl-floor',
    label: 'Bowl floor',
    body: 'stationary',
    count: 48,
    radius: 1.86,
    y: 0.10,
    halfExtents: [0.13, 0.045, 0.12],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'track-floor',
    label: 'Ball track',
    body: 'stationary',
    count: 64,
    radius: 2.48,
    y: 0.61,
    halfExtents: [0.13, 0.045, 0.17],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'outer-rim',
    label: 'Outer rim',
    body: 'stationary',
    count: 64,
    radius: 2.76,
    y: 0.79,
    halfExtents: [0.13, 0.16, 0.07],
    color: stationaryColor,
  });
  addRingSpecs(specs, {
    id: 'track-inner-rail',
    label: 'Track inner rail',
    body: 'stationary',
    count: 64,
    radius: 2.20,
    y: 0.66,
    halfExtents: [0.13, 0.075, 0.055],
    color: stationaryColor,
  });

  // Eight low, independent deflector blocks sit above the track transition.
  addRingSpecs(specs, {
    id: 'deflector',
    label: 'Deflector',
    body: 'stationary',
    count: 8,
    radius: 2.33,
    y: 0.84,
    halfExtents: [0.20, 0.075, 0.055],
    color: '#c48b68',
    radialOffset: Math.PI / 2,
  });

  // Rotor: a kinematic body owns the floors, pocket walls, frets and separators.
  addRingSpecs(specs, {
    id: 'rotor-pocket-floor',
    label: 'Pocket floor',
    body: 'rotor',
    count: SECTOR_COUNT,
    radius: ROTOR_RADIUS,
    y: 0.02,
    halfExtents: [0.13, 0.055, 0.16],
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
    radius: 2.03,
    y: 0.16,
    halfExtents: [0.13, 0.15, 0.045],
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

  return specs;
}

function addRapierCollider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  spec: ColliderSpec,
) {
  const descriptor = RAPIER.ColliderDesc.cuboid(...spec.halfExtents)
    .setTranslation(...spec.position)
    .setRotation({
      x: spec.rotation[0],
      y: spec.rotation[1],
      z: spec.rotation[2],
      w: spec.rotation[3],
    })
    .setFriction(0.72)
    .setRestitution(0.22);
  return world.createCollider(descriptor, body);
}

function makePhysicsDebugMesh(spec: ColliderSpec) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      spec.halfExtents[0] * 2,
      spec.halfExtents[1] * 2,
      spec.halfExtents[2] * 2,
    ),
    new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.body === 'rotor' ? 0.23 : 0.16,
      wireframe: false,
      depthWrite: false,
    }),
  );
  mesh.name = `ColliderDebug__${spec.id}`;
  mesh.position.set(...spec.position);
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
  if (radius > 3.2 || height < -0.9 || height > 2.4) return 'leak';
  if (height < -0.35 || (radius > 2.85 && speed < 0.04)) return 'pass-through';
  if (settledFrames > 150 && speed < 0.04 && radius < 1.2) return 'trap';
  return 'resting';
}

async function runDropProbeValidation(specs: ColliderSpec[]): Promise<PhysicsReport> {
  await RAPIER.init();
  const startedAt = performance.now();
  const stationarySpecs = specs.filter((spec) => spec.body === 'stationary');
  const rotorSpecs = specs.filter((spec) => spec.body === 'rotor');
  const probes = [
    { id: 'track-entry', label: 'High-speed track entry', position: [0, 1.42, 2.46] as [number, number, number], velocity: [0.82, -0.55, -1.8] as [number, number, number] },
    { id: 'transition-drop', label: 'Transition drop', position: [0.18, 1.28, 2.08] as [number, number, number], velocity: [-0.3, -0.65, -0.22] as [number, number, number] },
    { id: 'pocket-zero', label: 'Pocket 0 alignment', position: [0, 0.94, ROTOR_RADIUS] as [number, number, number], velocity: [0, -0.2, 0] as [number, number, number] },
    { id: 'pocket-19', label: 'Pocket 19 alignment', position: radialPosition(ROTOR_RADIUS, 19 * SECTOR_STEP_RADIANS, 0.94), velocity: [0.15, -0.25, -0.1] as [number, number, number] },
    { id: 'deflector-hit', label: 'Deflector CCD strike', position: [-0.08, 1.62, 2.48] as [number, number, number], velocity: [3.4, -1.1, -0.2] as [number, number, number] },
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
  onStateChange,
  onAudit,
  onRotorAngleChange,
  onRotorTestState,
  onPhysicsReport,
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
  onStateChange: (state: LoadState, detail?: string) => void;
  onAudit: (audit: AssetAudit) => void;
  onRotorAngleChange: (angle: number) => void;
  onRotorTestState: (state: 'idle' | 'running' | 'passed', detail?: string) => void;
  onPhysicsReport: (report: PhysicsReport) => void;
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
  const physicsSpecsRef = useRef<ColliderSpec[]>([]);
  const physicsWorldRef = useRef<RAPIER.World | null>(null);
  const rotorPhysicsBodyRef = useRef<RAPIER.RigidBody | null>(null);

  onStateChangeRef.current = onStateChange;
  onAuditRef.current = onAudit;
  onRotorAngleChangeRef.current = onRotorAngleChange;
  onRotorTestStateRef.current = onRotorTestState;
  onPhysicsReportRef.current = onPhysicsReport;
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

          const ballPlaceholder = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 24, 16),
            new THREE.MeshStandardMaterial({
              color: '#f5f1dc',
              roughness: 0.18,
              metalness: 0.12,
              emissive: '#6d776c',
              emissiveIntensity: 0.08,
            }),
          );
          ballPlaceholder.name = 'PhysicsLabBall__placeholder';
          ballPlaceholder.position.set(0, 0.72, 2.24);
          ballPlaceholder.castShadow = true;
          ballPlaceholder.userData = { dynamicBodyAttached: false };
          ballRef.current = ballPlaceholder;
          wheelRoot.add(ballPlaceholder);

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
             physicsWorld.maxCcdSubsteps = 4;
             const stationaryBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed());
             const rotorBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
             colliderSpecs
               .filter((spec) => spec.body === 'stationary')
               .forEach((spec) => addRapierCollider(physicsWorld!, stationaryBody, spec));
             colliderSpecs
               .filter((spec) => spec.body === 'rotor')
               .forEach((spec) => addRapierCollider(physicsWorld!, rotorBody, spec));
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
           const rotation = rotorGroupRef.current?.rotation.y ?? 0;
           rotorPhysicsBodyRef.current.setNextKinematicRotation({
             x: 0,
             y: Math.sin(rotation / 2),
             z: 0,
             w: Math.cos(rotation / 2),
           });
           physicsWorld.step();
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
    if (rotorGroupRef.current) {
      rotorGroupRef.current.rotation.y = THREE.MathUtils.degToRad(rotorAngle);
    }
  }, [rotorAngle]);

  useEffect(() => {
    const rotorGroup = rotorGroupRef.current;
    if (!rotorGroup || rotorTestRequest === 0) return undefined;

    let frame = 0;
    let cancelled = false;
    const cycles = 3;
    const duration = 2100;
    const startTime = performance.now();
    const referenceAngle = 0;
    onRotorTestStateRef.current('running', `${cycles} × 360° diagnostic rotation`);

    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const easedProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      rotorGroup.rotation.y = referenceAngle - easedProgress * Math.PI * 2 * cycles;
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      rotorGroup.rotation.y = referenceAngle;
      onRotorAngleChangeRef.current(0);
      onRotorTestStateRef.current('passed', '3 × 360° complete · pivot remained locked');
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
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
    setRotorTestDetail('3 × 360° diagnostic rotation');
    setRotorTestRequest((current) => current + 1);
  };
  const runProbeTest = () => {
    setProbeTestRequest((current) => current + 1);
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

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Layers3 size={18} strokeWidth={1.7} />
          </div>
          <div>
             <div className="eyebrow">ISOLATED PHYSICS LAB · PART 2</div>
             <h1>Roulette / primitive collision geometry</h1>
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
              <Crosshair size={13} /> PART 2 · COLLISION MODEL
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
                  <CircleDot size={15} /> Ball placeholder
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
            <div className="section-label">ROTOR PIVOT TEST</div>
            <div className="rotor-angle-readout">
              <span>Reference angle</span>
              <strong data-testid="text-rotor-angle">{rotorAngle.toFixed(1)}°</strong>
            </div>
            <input
              className="rotor-angle-slider"
              type="range"
              min="-180"
              max="180"
              step="1"
              value={rotorAngle}
              onChange={(event) => setRotorAngle(Number(event.target.value))}
              aria-label="Rotor reference angle"
              data-testid="input-rotor-angle"
            />
            <div className="rotor-test-actions">
              <button type="button" className="secondary-button" onClick={resetRotor} data-testid="button-rotor-reset">
                Reset rotor
              </button>
              <button type="button" className="primary-button" onClick={runRotorTest} data-testid="button-rotor-test">
                Run 3 × 360°
              </button>
            </div>
            <div className={`rotor-test-status rotor-test-${rotorTestState}`} data-testid="status-rotor-test">
              <span>{rotorTestState === 'passed' ? 'PIVOT TEST PASSED' : rotorTestState === 'running' ? 'TEST RUNNING' : 'READY'}</span>
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

          <section className="physics-note" data-testid="status-physics">
            <div className="note-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
                <strong>Part 2 · isolated primitive physics</strong>
                <p>Stationary bowl and kinematic rotor use separate low-complexity colliders. Drop probes are temporary only; final launch and production round logic remain disconnected.</p>
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
               <span className="toolbar-muted">PROBE-ONLY SIMULATION</span>
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
              onStateChange={handleStateChange}
              onAudit={setAudit}
              onRotorAngleChange={setRotorAngle}
              onRotorTestState={handleRotorTestState}
               onPhysicsReport={setPhysicsReport}
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
        </section>
      </div>

      <footer className="lab-footer">
       <span>ROULETTE PHYSICS LAB · PART 2</span>
        <span className="footer-rule" />
       <span>Primitive colliders · temporary CCD probes</span>
        <span className="footer-build">
           <Download size={12} /> ISOLATED LAB
        </span>
      </footer>
    </main>
  );
}

export default App;