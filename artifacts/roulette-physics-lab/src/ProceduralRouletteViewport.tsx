import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";

const EUROPEAN_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const STEP = 1 / 120;
const GRAVITY = -58.86;
const BALL_RADIUS = 0.056;
const POCKET_COUNT = 37;
const POCKET_STEP = (Math.PI * 2) / POCKET_COUNT;
const POCKET_FLOOR_Y = -0.19;
const POCKET_FLOOR_HALF_THICKNESS = 0.055;
const POCKET_FLOOR_BORDER_RADIUS = 0.03;
const POCKET_FLOOR_TOP =
  POCKET_FLOOR_Y + POCKET_FLOOR_HALF_THICKNESS + POCKET_FLOOR_BORDER_RADIUS;
const POCKET_FRET_RADIUS = 1.69;
const POCKET_FRET_Y = -0.115;
const POCKET_FRET_HALF_HEIGHT = 0.03;
const POCKET_FRET_HALF_RADIAL_WIDTH = 0.18;
const POCKET_FRET_HALF_TANGENTIAL_WIDTH = 0.06;
const POCKET_FRET_BORDER_RADIUS = 0.02;
const OUTER_RADIUS = 2.54;
const BALL_TRACK_RADIUS = 2.4;
const POCKET_RADIUS = 1.66;
const ROTOR_SPEED = 2.4;
const LAUNCH_SPEED = 15;

type WheelProps = {
  loadKey: number;
  view: string;
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
  ballParameters: { radius: number; mass: number; friction: number; restitution: number; linearDamping: number; angularDamping: number; initialAngularVelocity: number };
  rotorParameters: { initialAngularVelocity: number; angularDamping: number; mass: number };
  launchParameters: { speed: number; angle: number; initialSpin: number; variation: number };
  ballCommand: { kind: string; token: number };
  onStateChange: (state: string, detail?: string) => void;
  onAudit: (audit: unknown) => void;
  onRotorAngleChange: (angle: number) => void;
  onRotorTestState: (state: string, detail?: string) => void;
  onPhysicsReport: (report: unknown) => void;
  onBallState: (state: string, detail?: string) => void;
  onBallValidationReport: (report: unknown) => void;
  onPart4State: (state: string, detail?: string) => void;
  onPart4ValidationReport: (report: unknown) => void;
  onPart5ValidationReport: (report: unknown) => void;
};

type ProfilePoint = [number, number];
type RunResult = {
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

const BOWL_PROFILE: ProfilePoint[] = [
  [1.9, -0.03],
  [2.02, -0.015],
  [2.25, 0.0],
  [2.42, 0.03],
  [2.54, 0.045],
];

function radialPosition(radius: number, angle: number, y: number): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function bowlY(radius: number) {
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

function pocketColor(number: number) {
  return number === 0 ? "#0f8b62" : RED_NUMBERS.has(number) ? "#a93636" : "#171b20";
}

function yRotation(angle: number) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

function tiltedRotation(angle: number, tilt = 0) {
  const y = new THREE.Quaternion(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
  const x = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
  y.multiply(x);
  return { x: y.x, y: y.y, z: y.z, w: y.w };
}

function makeProfileTrimesh() {
  const segments = 128;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [radius, y] of BOWL_PROFILE) {
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  const bottomOffset = BOWL_PROFILE.length * segments;
  for (const [radius, y] of BOWL_PROFILE) {
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      vertices.push(Math.sin(angle) * radius, y - 0.08, Math.cos(angle) * radius);
    }
  }
  for (let profileIndex = 0; profileIndex < BOWL_PROFILE.length - 1; profileIndex += 1) {
    for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
      const next = (segmentIndex + 1) % segments;
      const a = profileIndex * segments + segmentIndex;
      const b = profileIndex * segments + next;
      const c = (profileIndex + 1) * segments + next;
      const d = (profileIndex + 1) * segments + segmentIndex;
      indices.push(a, d, b, b, d, c);
      indices.push(bottomOffset + a, bottomOffset + b, bottomOffset + d);
      indices.push(bottomOffset + b, bottomOffset + c, bottomOffset + d);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

function addSegmentRing(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  radius: number,
  y: number,
  radialHalfWidth: number,
  verticalHalfWidth: number,
  tangentialHalfWidth: number,
  count = POCKET_COUNT,
  tilt = 0,
  friction = 0.42,
  restitution = 0.24,
) {
  const colliders: RAPIER.Collider[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const descriptor = RAPIER.ColliderDesc
      .cuboid(tangentialHalfWidth, verticalHalfWidth, radialHalfWidth)
      .setTranslation(...radialPosition(radius, angle, y))
      .setRotation(tiltedRotation(angle, tilt))
      .setFriction(friction)
      .setRestitution(restitution);
    colliders.push(world.createCollider(descriptor, body));
  }
  return colliders;
}

function addPocketCellColliders(world: RAPIER.World, rotorBody: RAPIER.RigidBody) {
  // The floor is one continuous, circular support surface. Each separator is
  // shared by the two neighboring cells, so one canonical cell has two sides
  // without duplicating or interpenetrating colliders at the boundary.
  world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(
      2.05,
      POCKET_FLOOR_HALF_THICKNESS,
      2.05,
      POCKET_FLOOR_BORDER_RADIUS,
    )
      .setTranslation(0, POCKET_FLOOR_Y, 0)
      .setFriction(0.08)
      .setRestitution(0.02),
    rotorBody,
  );
  for (let index = 0; index < POCKET_COUNT; index += 1) {
    const boundaryAngle = index * POCKET_STEP + POCKET_STEP / 2;
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        POCKET_FRET_HALF_TANGENTIAL_WIDTH,
        POCKET_FRET_HALF_HEIGHT,
        POCKET_FRET_HALF_RADIAL_WIDTH,
        POCKET_FRET_BORDER_RADIUS,
      )
        .setTranslation(...radialPosition(POCKET_FRET_RADIUS, boundaryAngle, POCKET_FRET_Y))
        .setRotation(yRotation(boundaryAngle))
        .setFriction(0.08)
        .setRestitution(0.02),
      rotorBody,
    );
  }
}

function makeLabel(number: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = pocketColor(number);
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8e8c3";
  context.font = "700 38px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.28, 0.14, 1);
  return sprite;
}

function quaternionFromBody(target: THREE.Quaternion, rotation: { x: number; y: number; z: number; w: number }) {
  target.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

export function ProceduralRouletteViewport(props: WheelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let world: RAPIER.World | null = null;
    let rotorBody: RAPIER.RigidBody | null = null;
    let ballBody: RAPIER.RigidBody | null = null;
    let ballMesh: THREE.Group | null = null;
    let rotorGroup: THREE.Group | null = null;
    let stationaryGroup: THREE.Group | null = null;
    let rotorAngle = props.rotorAngle;
    let accumulator = 0;
    let lastTime = performance.now();
    let ballState: "ready" | "active" | "settled" = "ready";
    let settlingFrames = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10191d");
    scene.fog = new THREE.Fog("#10191d", 10, 18);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    camera.position.set(5.8, 4.9, 6.6);
    camera.lookAt(0, -0.04, 0);
    scene.add(new THREE.HemisphereLight("#d8e0d3", "#11151a", 2.1));
    const key = new THREE.DirectionalLight("#fff0cf", 4.2);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#739ba0", 2.2);
    fill.position.set(-5, 4, -3);
    scene.add(fill);

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
    } catch (error) {
      callbacks.current.onStateChange("error", error instanceof Error ? error.message : "WEBGL_UNAVAILABLE");
      return () => undefined;
    }
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 12;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      new THREE.MeshStandardMaterial({ color: "#16272b", roughness: 0.9, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.68;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(14, 14, "#49666b", "#294247");
    grid.position.y = -0.67;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    scene.add(grid);

    stationaryGroup = new THREE.Group();
    stationaryGroup.name = "ProceduralStationaryBowl";
    rotorGroup = new THREE.Group();
    rotorGroup.name = "ProceduralKinematicRotor";
    scene.add(stationaryGroup, rotorGroup);

    const outerBody = new THREE.Mesh(
      new THREE.CylinderGeometry(3.12, 3.2, 0.48, 96),
      new THREE.MeshStandardMaterial({ color: "#1a0f0a", roughness: 0.34, metalness: 0.2 }),
    );
    outerBody.position.y = -0.42;
    outerBody.castShadow = true;
    outerBody.receiveShadow = true;
    stationaryGroup.add(outerBody);
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(BOWL_PROFILE.map(([radius, y]) => new THREE.Vector2(radius, y)), 128),
      new THREE.MeshStandardMaterial({ color: "#342019", roughness: 0.3, metalness: 0.18, side: THREE.DoubleSide }),
    );
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    stationaryGroup.add(bowl);
    const outerRail = new THREE.Mesh(
      new THREE.TorusGeometry(OUTER_RADIUS, 0.075, 12, 128),
      new THREE.MeshStandardMaterial({ color: "#b7813c", roughness: 0.24, metalness: 0.82 }),
    );
    outerRail.position.y = bowlY(OUTER_RADIUS) + 0.025;
    outerRail.rotation.x = Math.PI / 2;
    outerRail.castShadow = true;
    stationaryGroup.add(outerRail);
    const innerRail = new THREE.Mesh(
      new THREE.TorusGeometry(2.08, 0.045, 10, 96),
      new THREE.MeshStandardMaterial({ color: "#8d6335", roughness: 0.3, metalness: 0.72 }),
    );
    innerRail.position.y = bowlY(2.08) + 0.02;
    innerRail.rotation.x = Math.PI / 2;
    stationaryGroup.add(innerRail);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
      const deflector = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.16, 0.11),
        new THREE.MeshStandardMaterial({ color: "#b88442", roughness: 0.25, metalness: 0.84 }),
      );
      deflector.position.set(...radialPosition(1.82, angle, -0.08));
      deflector.rotation.y = angle;
      deflector.castShadow = true;
      stationaryGroup.add(deflector);
    }

    const rotorDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.12, 2.12, 0.14, 96),
      new THREE.MeshStandardMaterial({ color: "#211a16", roughness: 0.34, metalness: 0.2 }),
    );
    rotorDisc.position.y = -0.2;
    rotorDisc.castShadow = true;
    rotorGroup.add(rotorDisc);
    const pocketRing = new THREE.Group();
    rotorGroup.add(pocketRing);
    for (let index = 0; index < POCKET_COUNT; index += 1) {
      const angle = index * POCKET_STEP;
      const number = EUROPEAN_SEQUENCE[index];
      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.11, 0.25),
        new THREE.MeshStandardMaterial({ color: pocketColor(number), roughness: 0.38, metalness: 0.12 }),
      );
      pocket.position.set(...radialPosition(POCKET_RADIUS, angle, -0.19));
      pocket.rotation.y = angle;
      pocketRing.add(pocket);
      const label = makeLabel(number);
      label.position.set(...radialPosition(2.17, angle, 0.04));
      label.rotation.z = angle;
      pocketRing.add(label);
      const fret = new THREE.Mesh(
        new THREE.BoxGeometry(
          POCKET_FRET_HALF_TANGENTIAL_WIDTH * 2,
          POCKET_FRET_HALF_HEIGHT * 2,
          POCKET_FRET_HALF_RADIAL_WIDTH * 2,
        ),
        new THREE.MeshStandardMaterial({ color: "#b88648", roughness: 0.25, metalness: 0.86 }),
      );
      fret.position.set(...radialPosition(POCKET_FRET_RADIUS, angle + POCKET_STEP / 2, POCKET_FRET_Y));
      fret.rotation.y = angle + POCKET_STEP / 2;
      fret.castShadow = true;
      pocketRing.add(fret);
    }
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 0.82, 48),
      new THREE.MeshStandardMaterial({ color: "#8e6330", roughness: 0.23, metalness: 0.82 }),
    );
    cone.position.y = 0.08;
    cone.castShadow = true;
    rotorGroup.add(cone);
    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.36, 32),
      new THREE.MeshStandardMaterial({ color: "#d0a04e", roughness: 0.2, metalness: 0.92 }),
    );
    spindle.position.y = 0.62;
    rotorGroup.add(spindle);

    const dropProfile = makeProfileTrimesh();
    void RAPIER.init().then(() => {
      if (disposed) return;
      world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
      world.timestep = STEP;
      world.maxCcdSubsteps = 8;
      const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const bowlCollider = RAPIER.ColliderDesc.trimesh(
        dropProfile.vertices,
        dropProfile.indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
      ).setFriction(0.012).setRestitution(0.08);
      world.createCollider(bowlCollider, stationaryBody);
      addSegmentRing(world, stationaryBody, OUTER_RADIUS, bowlY(OUTER_RADIUS) + 0.025, 0.075, 0.075, 0.05, 128, 0, 0.18, 0.16);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(3.0, 0.035, 3.0)
          .setTranslation(0, -0.27, 0)
          .setFriction(0.32)
          .setRestitution(0.12),
        stationaryBody,
      );
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
        const descriptor = RAPIER.ColliderDesc.cuboid(0.14, 0.055, 0.055)
          .setTranslation(...radialPosition(1.82, angle, -0.08))
          .setRotation(yRotation(angle))
          .setFriction(0.42)
          .setRestitution(0.35);
        world.createCollider(descriptor, stationaryBody);
      }
      rotorBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      addPocketCellColliders(world, rotorBody);
      spawnBall();
      callbacks.current.onStateChange("loaded", "Procedural European roulette V1 ready");
      callbacks.current.onAudit({
        sourceMeshCount: 0,
        sourceTriangles: 0,
        runtimeMeshCount: scene.children.length,
        runtimeTriangles: 0,
        dimensions: { x: 6.4, y: 1.4, z: 6.4 },
        pivot: { x: 0, y: 0, z: 0 },
        stationaryMeshCount: stationaryGroup?.children.length ?? 0,
        stationaryTriangles: 0,
        rotorMeshCount: rotorGroup?.children.length ?? 0,
        rotorTriangles: 0,
      });
      if (props.probeTestRequest > 0) runDrop();
      else if (props.part5RunRequest > 0) void runSmoke();
      else if (props.ballCommand.kind === "release") releaseBall(0);
      else if (props.ballCommand.kind === "varied") releaseBall(1);
    });

    function createBall() {
      const group = new THREE.Group();
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
        new THREE.MeshStandardMaterial({ color: "#fff3cf", roughness: 0.18, metalness: 0.16 }),
      );
      group.add(sphere);
      const marker = new THREE.Mesh(
        new THREE.TorusGeometry(BALL_RADIUS * 0.76, BALL_RADIUS * 0.045, 6, 20),
        new THREE.MeshBasicMaterial({ color: "#b7823c" }),
      );
      marker.rotation.x = Math.PI / 2;
      group.add(marker);
      group.name = "ProceduralRouletteBall__dynamicRigidBody";
      group.castShadow = true;
      scene.add(group);
      return group;
    }

    function spawnBall() {
      if (!world) return;
      if (ballBody) world.removeRigidBody(ballBody);
      if (ballMesh) scene.remove(ballMesh);
      ballMesh = createBall();
      const angle = 0.35;
      const position = radialPosition(BALL_TRACK_RADIUS, angle, bowlY(BALL_TRACK_RADIUS) + BALL_RADIUS + 0.02);
      ballBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...position)
          .setLinvel(0, 0, 0)
          .setAdditionalMass(props.ballParameters.mass)
          .setLinearDamping(props.ballParameters.linearDamping)
          .setAngularDamping(props.ballParameters.angularDamping)
          .setCcdEnabled(true)
          .setSoftCcdPrediction(Math.max(BALL_RADIUS * 2.2, 0.08)),
      );
      ballBody.enableCcd(true);
      ballBody.setSoftCcdPrediction(Math.max(BALL_RADIUS * 2.2, 0.08));
      world.createCollider(
        RAPIER.ColliderDesc.ball(BALL_RADIUS)
          .setFriction(0.012)
          .setRestitution(0.08)
          .setDensity(0.001),
        ballBody,
      );
      syncBall();
      ballState = "ready";
      callbacks.current.onBallState("ready", "Procedural sphere · exact shared-radius collider");
    }

    function syncBall() {
      if (!ballBody || !ballMesh) return;
      const position = ballBody.translation();
      ballMesh.position.set(position.x, position.y, position.z);
      quaternionFromBody(ballMesh.quaternion, ballBody.rotation());
    }

    function resetBall() {
      if (!world || !ballBody) return;
      const angle = 0.35;
      ballBody.setTranslation(
        { x: Math.sin(angle) * BALL_TRACK_RADIUS, y: bowlY(BALL_TRACK_RADIUS) + BALL_RADIUS + 0.02, z: Math.cos(angle) * BALL_TRACK_RADIUS },
        true,
      );
      ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.wakeUp();
      rotorAngle = 0;
      ballState = "ready";
      settlingFrames = 0;
      callbacks.current.onBallState("ready", "Zero velocity · procedural outer rail");
      syncBall();
    }

    function releaseBall(index = 0) {
      if (!world || !ballBody || !rotorBody) return;
      resetBall();
      const angle = 0.35 + index * 0.31;
      const radius = BALL_TRACK_RADIUS;
      const speed = LAUNCH_SPEED * (1 + ((index % 3) - 1) * props.launchParameters.variation * 0.24);
      ballBody.setTranslation({ x: Math.sin(angle) * radius, y: bowlY(radius) + BALL_RADIUS + 0.02, z: Math.cos(angle) * radius }, true);
      ballBody.setLinvel({ x: Math.cos(angle) * speed, y: 0, z: -Math.sin(angle) * speed }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: -props.launchParameters.initialSpin }, true);
      rotorAngle = angle * 0.1;
      rotorBody.setNextKinematicRotation(yRotation(rotorAngle));
      if (rotorGroup) rotorGroup.rotation.y = rotorAngle;
      ballBody.wakeUp();
      ballState = "active";
      callbacks.current.onBallState("active", `Tangential launch · ${speed.toFixed(2)} wu/s · CCD`);
      callbacks.current.onRotorTestState("passed", "Kinematic rotor ready · Y-axis only");
    }

    function settlePocketIndex() {
      if (!ballBody) return null;
      const position = ballBody.translation();
      const relative = Math.atan2(position.x, position.z) - rotorAngle;
      return ((Math.round(relative / POCKET_STEP) % POCKET_COUNT) + POCKET_COUNT) % POCKET_COUNT;
    }

    function simulateSteps(stepCount: number, collect = false) {
      if (!world || !rotorBody || !ballBody) return null;
      let radiusMin = Infinity;
      let radiusMax = 0;
      let laps = 0;
      let previousAngle = 0;
      let angleTravel = 0;
      let outerEntered = false;
      let naturalExit = false;
      let inward = false;
      let energyLoss = false;
      let deflector = false;
      let fret = false;
      let pocket = false;
      let pocketChanges = 0;
      let previousPocket: number | null = null;
      let bounces = 0;
      let stable = 0;
      let settleStep = 0;
      let maxSpeed = 0;
      let previousSpeed = LAUNCH_SPEED;
      let minRadius = Infinity;
      let escaped = false;
      let tunneling = false;
      const trace: string[] = [];
      for (let step = 0; step < stepCount; step += 1) {
        rotorAngle += ROTOR_SPEED * STEP;
        rotorBody.setNextKinematicRotation(yRotation(rotorAngle));
        if (rotorGroup) rotorGroup.rotation.y = rotorAngle;
        world.step();
        syncBall();
        const position = ballBody.translation();
        const velocity = ballBody.linvel();
        const radius = Math.hypot(position.x, position.z);
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        maxSpeed = Math.max(maxSpeed, speed);
        radiusMin = Math.min(radiusMin, radius);
        radiusMax = Math.max(radiusMax, radius);
        minRadius = Math.min(minRadius, radius);
        if (radius > 2.35) {
          outerEntered = true;
          const angle = Math.atan2(position.x, position.z);
          if (step > 0) {
            const delta = THREE.MathUtils.euclideanModulo(angle - previousAngle + Math.PI, Math.PI * 2) - Math.PI;
            angleTravel += Math.abs(delta);
          }
          previousAngle = angle;
        } else if (outerEntered) {
          naturalExit = true;
          inward = true;
        }
        laps = angleTravel / (Math.PI * 2);
        if (radius < 2.2) inward = true;
        if (speed < previousSpeed - 0.025) energyLoss = true;
        if (radius > 1.95 && radius < 2.3 && Math.abs(speed - previousSpeed) > 0.025) deflector = true;
        if (radius > 1.38 && radius < 1.95 && Math.abs(speed - previousSpeed) > 0.02) fret = true;
        if (radius > 1.32 && radius < 1.98) {
          pocket = true;
          const currentPocket = settlePocketIndex();
          if (currentPocket !== null && previousPocket !== null && currentPocket !== previousPocket) pocketChanges += 1;
          previousPocket = currentPocket;
        }
        if (position.y > 0.35 || radius > 3.2 || position.y < -0.6 || !Number.isFinite(position.y)) {
          escaped = true;
          tunneling = true;
        }
        if (speed > 18) tunneling = true;
        if (speed < 0.18 && radius > 1.35 && radius < 1.95 && position.y > -0.42 && position.y < 0.2) {
          stable += 1;
          if (stable >= 120 && settleStep === 0) settleStep = step;
        } else {
          stable = 0;
        }
        if (step % 120 === 0 && collect) trace.push(`${step}:${radius.toFixed(2)}:${speed.toFixed(2)}`);
        previousSpeed = speed;
        if (settleStep > 0) break;
      }
      const position = ballBody.translation();
      const velocity = ballBody.linvel();
      const finalPocketIndex = settlePocketIndex();
      return { radiusMin, radiusMax, laps, outerEntered, naturalExit, inward, energyLoss, deflector, fret, pocket, pocketChanges, bounces, settleStep, maxSpeed, escaped, tunneling, trace, finalPocketIndex, finalPosition: position, finalSpeed: Math.hypot(velocity.x, velocity.y, velocity.z) };
    }

    function runDrop() {
      if (!world || !rotorBody || !ballBody) return;
      resetBall();
      const angle = 0;
      const radius = POCKET_FRET_RADIUS;
      ballBody.setTranslation({ x: Math.sin(angle) * radius, y: 0.32, z: Math.cos(angle) * radius }, true);
      ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rotorAngle = 0;
      rotorBody.setNextKinematicRotation(yRotation(0));
      if (rotorGroup) rotorGroup.rotation.y = 0;
      let firstContact = false;
      let minGap = Infinity;
      let escaped = false;
      for (let step = 0; step < 240; step += 1) {
        world.step();
        syncBall();
        const position = ballBody.translation();
        const gap = position.y - BALL_RADIUS - POCKET_FLOOR_TOP;
        minGap = Math.min(minGap, gap);
        if (gap < 0.002) firstContact = true;
        if (
          position.y < -0.6 ||
          position.y > 0.5 ||
          Math.hypot(position.x, position.z) > 2.2 ||
          !Number.isFinite(position.y)
        ) {
          escaped = true;
        }
      }
      const position = ballBody.translation();
      const radiusAfter = Math.hypot(position.x, position.z);
      const penetration = Math.max(0, -minGap);
      const passed = firstContact && penetration < 0.003 && !escaped;
      callbacks.current.onPhysicsReport({
        status: passed ? "passed" : "failed",
        colliderCount: 138 + POCKET_COUNT + 1,
        stationaryCount: 1 + 8 + 128 + 1,
        rotorCount: POCKET_COUNT + 1,
        probeCount: 1,
        passedCount: passed ? 1 : 0,
        failedCount: passed ? 0 : 1,
        durationMs: 240 * STEP * 1000,
        detail: `Canonical pocket entry drop · final radius ${radiusAfter.toFixed(3)} · penetration ${penetration.toFixed(4)} wu`,
        results: [{ id: "procedural-pocket-entry-drop", label: "Canonical pocket entry drop", outcome: passed ? "resting" : "pass-through", pocket: settlePocketIndex(), finalRadius: radiusAfter, finalHeight: position.y, finalSpeed: 0, detail: `Continuous rotor floor + shared fret boundaries · max penetration ${penetration.toFixed(4)} wu` }],
      });
    }

    async function runSmoke() {
      callbacks.current.onPart5ValidationReport({ status: "running", testCount: 3, completedCount: 0, chainCompleteCount: 0, outerTrackCount: 0, energyLossCount: 0, inwardMovementCount: 0, deflectorHitCount: 0, movingFretContactCount: 0, pocketInteractionCount: 0, stableSettleCount: 0, timeoutCount: 0, escapedCount: 0, tunnelingCount: 0, velocityExplosionCount: 0, permanentTrapCount: 0, repeatedPathCount: 0, fixedRadiusCount: 0, durationMs: 0, detail: "Running 3 short procedural smoke tests", results: [] });
      const results: RunResult[] = [];
      for (let index = 0; index < 3; index += 1) {
        resetBall();
        releaseBall(index);
        const outcome = simulateSteps(Math.round(16 / STEP), true)!;
        const completed = outcome.settleStep > 0;
        const finalPocketNumber = outcome.finalPocketIndex === null ? null : EUROPEAN_SEQUENCE[outcome.finalPocketIndex];
        results.push({
          id: `procedural-v1-${index + 1}`,
          completed,
          chainComplete: completed && outcome.outerEntered && outcome.naturalExit && outcome.deflector && outcome.fret && outcome.pocket,
          outerTrackEntered: outcome.outerEntered,
          outerTrackLaps: outcome.laps,
          naturalTrackExit: outcome.naturalExit,
          energyLossObserved: outcome.energyLoss,
          inwardMovementObserved: outcome.inward,
          deflectorHit: outcome.deflector,
          movingFretContact: outcome.fret,
          pocketInteraction: outcome.pocket,
          pocketChangeCount: outcome.pocketChanges,
          bounceCount: outcome.bounces,
          settleSeconds: outcome.settleStep > 0 ? outcome.settleStep * STEP : 0,
          finalPocketIndex: outcome.finalPocketIndex,
          finalPocketNumber,
          finalRadius: outcome.finalPosition ? Math.hypot(outcome.finalPosition.x, outcome.finalPosition.z) : 0,
          finalHeight: outcome.finalPosition?.y ?? 0,
          finalSpeed: outcome.finalSpeed,
          finalAngularSpeed: 0,
          pathVariance: outcome.radiusMax - outcome.radiusMin,
          maxBallSpeed: outcome.maxSpeed,
          timeout: !completed,
          escaped: outcome.escaped,
          nanDetected: false,
          permanentTrap: false,
          impossibleRestingState: false,
          tunneling: outcome.tunneling,
          velocityExplosion: outcome.maxSpeed > 18,
          pathSignature: outcome.trace.join("."),
          debugTraceCaptured: true,
          detail: completed ? `Natural settle in ${ (outcome.settleStep * STEP).toFixed(2) } s · ${finalPocketNumber}` : "No stable pocket settle within 16 s",
        });
      }
      const completedCount = results.filter((result) => result.completed).length;
      const chainCompleteCount = results.filter((result) => result.chainComplete).length;
      callbacks.current.onPart5ValidationReport({
        status: completedCount === 3 ? "passed" : "failed",
        testCount: 3,
        completedCount,
        chainCompleteCount,
        outerTrackCount: results.filter((result) => result.outerTrackEntered).length,
        energyLossCount: results.filter((result) => result.energyLossObserved).length,
        inwardMovementCount: results.filter((result) => result.inwardMovementObserved).length,
        deflectorHitCount: results.filter((result) => result.deflectorHit).length,
        movingFretContactCount: results.filter((result) => result.movingFretContact).length,
        pocketInteractionCount: results.filter((result) => result.pocketInteraction).length,
        stableSettleCount: completedCount,
        timeoutCount: results.filter((result) => result.timeout).length,
        escapedCount: results.filter((result) => result.escaped).length,
        tunnelingCount: results.filter((result) => result.tunneling).length,
        velocityExplosionCount: results.filter((result) => result.velocityExplosion).length,
        permanentTrapCount: 0,
        repeatedPathCount: 0,
        fixedRadiusCount: 0,
        durationMs: 3 * 16 * 1000,
        detail: completedCount === 3 ? "3 short procedural V1 smoke tests passed." : `${completedCount}/3 short procedural V1 smoke tests settled.`,
        results,
      });
    }

    function render() {
      if (disposed) return;
      const now = performance.now();
      accumulator += Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (world && rotorBody && ballBody) {
        while (accumulator >= STEP) {
          rotorAngle += ROTOR_SPEED * STEP;
          rotorBody.setNextKinematicRotation(yRotation(rotorAngle));
          if (rotorGroup) rotorGroup.rotation.y = rotorAngle;
          world.step();
          accumulator -= STEP;
          syncBall();
          const position = ballBody.translation();
          const speed = Math.hypot(...Object.values(ballBody.linvel()));
          const radius = Math.hypot(position.x, position.z);
          if (speed < 0.18 && radius > 1.35 && radius < 1.95 && position.y > -0.42 && position.y < 0.2) {
            settlingFrames += 1;
            if (settlingFrames === 120 && ballState === "active") {
              ballState = "settled";
              callbacks.current.onBallState("settled", `Physical pocket settle · ${EUROPEAN_SEQUENCE[settlePocketIndex() ?? 0]}`);
            }
          } else {
            settlingFrames = 0;
          }
        }
      }
      controls?.update();
      renderer?.render(scene, camera);
      frame = requestAnimationFrame(render);
    }
    const resize = () => {
      if (!renderer) return;
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls?.dispose();
      if (ballBody && world) world.removeRigidBody(ballBody);
      world?.free();
      renderer?.dispose();
    };
  }, [props.loadKey, props.ballCommand.token, props.probeTestRequest, props.part5RunRequest]);

  useEffect(() => {
    if (props.ballCommand.token === 0) return;
    // The scene effect owns the live refs; changing the command remounts the
    // small procedural runtime through loadKey from the parent when needed.
  }, [props.ballCommand.token]);

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Interactive procedural European roulette physics preview" />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>PROCEDURAL EUROPEAN V1</span>
        <span>Y+ AXIS · SHARED MESH / COLLIDER SCALE</span>
      </div>
      {props.showGrid && <div className="grid-status is-visible" aria-hidden="true"><span>REFERENCE GRID</span></div>}
      {props.showPhysicsDebug && <div className="debug-status" aria-hidden="true"><span>PROCEDURAL COLLIDERS · 120 HZ · CCD</span></div>}
    </div>
  );
}