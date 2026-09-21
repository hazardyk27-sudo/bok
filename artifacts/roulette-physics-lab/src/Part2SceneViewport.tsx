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
const PROFILE_SEGMENTS = 64;
const PROFILE_SHELL_THICKNESS = 0.08;

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

type Part2SceneViewportProps = {
  loadKey: number;
  validationMode?: 'part2' | 'part3';
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
    id: 'gentle-tangential',
    label: 'Gentle tangential glide',
    angle: 0.37,
    radius: DROP_RADIUS,
    speed: 0.55,
    durationSeconds: 1.8,
  },
  {
    id: 'moderate-tangential',
    label: 'Moderate CCD continuity',
    angle: 1.11,
    radius: DROP_RADIUS,
    speed: 1.35,
    durationSeconds: 1.8,
  },
] as const;

function part3SpawnPosition(probe: (typeof PART3_PROBES)[number]) {
  return radialPosition(
    probe.radius,
    probe.angle,
    profileHeight(probe.radius) + BALL_RADIUS + 0.002,
  );
}

function part3InitialVelocity(probe: (typeof PART3_PROBES)[number]): VectorReadout {
  return {
    x: Number((Math.cos(probe.angle) * probe.speed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(probe.angle) * probe.speed).toFixed(4)),
  };
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
    let physicsBallCollider: RAPIER.Collider | null = null;
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
    let part3Results: Part3ProbeResult[] = [];
    let part3Finished = false;

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

    const startPart3Probe = (index: number) => {
      const probe = PART3_PROBES[index];
      if (!probe || !ballBody || !ballMesh) return;
      const position = part3SpawnPosition(probe);
      const velocity = part3InitialVelocity(probe);
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
      publishPart3Report(
        'running',
        `Running probe ${index + 1}/${PART3_PROBES.length}: ${probe.label}.`,
      );
    };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

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
          runtimeScene.updateMatrixWorld(true);
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
          wheelRoot.remove(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          scene.add(wheelRoot);

          const sourceMeshCount = countMeshes(runtimeScene);
          const sourceTriangles = countTriangles(runtimeScene);
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

          const initialPosition =
            validationMode === 'part3'
              ? part3SpawnPosition(PART3_PROBES[0])
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
              .setLinearDamping(0.04)
              .setAngularDamping(0.08)
              .setCcdEnabled(true)
              .setSoftCcdPrediction(BALL_RADIUS * 2.5),
          );
          ballBody.enableCcd(true);
          ballBody.setSoftCcdPrediction(BALL_RADIUS * 2.5);
          ccdEnabled = true;
          physicsBallCollider = world.createCollider(
            RAPIER.ColliderDesc.ball(BALL_RADIUS)
              .setFriction(0.42)
              .setRestitution(0.02)
              .setDensity(0.001),
            ballBody,
          );
          ballBody.setTranslation({ x: initialPosition[0], y: initialPosition[1], z: initialPosition[2] }, true);
          ballMesh.position.set(...initialPosition);
          if (validationMode === 'part3') {
            startPart3Probe(0);
            callbacksRef.current.onStateChange('loaded', 'PART 3 static-collider ball probes running');
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
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();
      const resetView = () => applyView(viewRef.current);
      window.addEventListener('roulette-reset-view', resetView);

      const completePart3Probe = (position: RAPIER.Vector, velocity: RAPIER.Vector) => {
        const probe = PART3_PROBES[part3ProbeIndex];
        const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
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
        const passed =
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
            ? finalSpeed < 0.08
              ? 'Contact remained stable and the ball naturally settled.'
              : 'Contact remained stable while the ball continued naturally across the bowl.'
            : 'Probe failed the stable static-bowl contact envelope.',
        };
        part3Results = [...part3Results, result];
        if (!passed || part3ProbeIndex === PART3_PROBES.length - 1) {
          part3Finished = true;
          publishPart3Report(
            part3Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'passed'
              : 'failed',
            part3Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'Both deterministic static-bowl motion probes passed.'
              : 'A deterministic static-bowl motion probe failed.',
          );
        } else {
          startPart3Probe(part3ProbeIndex + 1);
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
            const radius = Math.hypot(position.x, position.z);
            const surfaceY =
              radius >= BOWL_PROFILE[0][0]
                ? profileHeight(radius)
                : COLLIDER_PROFILE.innerFloorTop;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, surfaceY - bottom);
            const separation = Math.max(0, bottom - surfaceY);
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
            if (part3Elapsed >= probe.durationSeconds) {
              completePart3Probe(position, velocity);
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
        void physicsBallCollider;
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
          <span>CCD {part3Report.ccdEnabled ? 'enabled' : 'disabled'} · 120 Hz · max 2 deterministic probes</span>
          {part3Report.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · spawn r {result.spawnRadius.toFixed(4)} / y {result.spawnHeight.toFixed(4)} ·
              v {result.initialVelocity.x.toFixed(4)}, {result.initialVelocity.y.toFixed(4)}, {result.initialVelocity.z.toFixed(4)} ·
              peak {result.peakSpeed.toFixed(4)} · r {result.minRadius.toFixed(4)}–{result.maxRadius.toFixed(4)} ·
              pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)}
            </span>
          ))}
          {part3Report.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: contact {result.stableContact ? 'stable' : 'unstable'} · volume escape {result.leftValidVolume ? 'yes' : 'no'} ·
              tunneling {result.tunneling ? 'yes' : 'no'} · velocity spike {result.velocityExplosion ? 'yes' : 'no'} ·
              sync {result.maxVisualBodySyncError.toFixed(6)} · {result.detail}
            </span>
          ))}
        </>
      ) : (
        'Waiting for PART 3 static-bowl probes.'
      )}
    </div>
  );

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Part 2 roulette collider alignment preview" />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>{validationMode === 'part3' ? 'PART 3 · DYNAMIC BALL VALIDATION' : 'PART 2 · ZERO-VELOCITY CONTACT'}</span>
        <span>ANGLE {THREE.MathUtils.radToDeg(angleReadout).toFixed(2)}° · PIVOT [0, 0, 0] · Y+</span>
        <span>
          {validationMode === 'part3'
            ? `PROBES ${part3Report?.status.toUpperCase() ?? 'WAITING'} · STATIC COLLIDER · CCD`
            : `DROP ${dropReport?.status.toUpperCase() ?? 'WAITING'} · CCD · 120 HZ`}
        </span>
      </div>
      {validationMode === 'part3' ? renderPart3Report() : (
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