import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EUROPEAN_WHEEL_ORDER, ROULETTE_SEGMENT_DEGREES } from "./rouletteGeometry";
import {
  ROULETTE_BALL_RADIUS,
  ROULETTE_MODEL_PATH,
  ROULETTE_PHYSICS_SCHEMA_VERSION,
  ROULETTE_WHEEL_DIAMETER,
} from "../../../lib/roulette-physics-config";

type Vec3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };

type ReplaySample = {
  simulatedAtMs: number;
  ball: { position: Vec3; orientation: Quaternion };
  rotor: { orientation: Quaternion };
};

type PhysicsReplay = {
  status: "SETTLED" | "INVALID";
  finalPocket: { index: number; number: number } | null;
  trajectory: ReplaySample[];
};

const REPLAY_URL = "/api/physics-lab/rounds/current";
const MODEL_URL = ROULETTE_MODEL_PATH;
const TARGET_WHEEL_DIAMETER = ROULETTE_WHEEL_DIAMETER;

function indexFor(number: number) {
  return EUROPEAN_WHEEL_ORDER.indexOf(number as typeof EUROPEAN_WHEEL_ORDER[number]);
}

function copyQuaternion(target: THREE.Quaternion, source: Quaternion) {
  target.set(source.x, source.y, source.z, source.w);
}

export class RoulettePhysicsReplay {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private readonly ball = new THREE.Mesh(
    new THREE.SphereGeometry(ROULETTE_BALL_RADIUS, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0xfff8dc, metalness: 0.18, roughness: 0.24 }),
  );
  private rotor?: THREE.Group;
  private replay?: PhysicsReplay;
  private frame = 0;
  private playbackStartedAt = 0;
  private playbackDurationMs = 0;
  private targetNumber: number | null = null;
  private looping = false;
  private onComplete?: () => void;
  private resizeObserver: ResizeObserver;

  private constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.camera.position.set(0, 7.4, 7.9);
    this.camera.lookAt(0, -0.1, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff3d2, 0x101820, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 8, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7ad62, 2.1);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  static async create(canvas: HTMLCanvasElement) {
    const player = new RoulettePhysicsReplay(canvas);
    await Promise.all([player.loadModel(), player.loadReplay()]);
    player.resize();
    player.renderFrame();
    canvas.dataset.physicsSchema = ROULETTE_PHYSICS_SCHEMA_VERSION;
    canvas.dataset.ready = "true";
    return player;
  }

  startLoop() {
    if (!this.replay?.trajectory.length) return;
    this.looping = true;
    this.targetNumber = null;
    this.canvas.dataset.replayState = "spinning";
    delete this.canvas.dataset.replayPocket;
    this.playbackStartedAt = performance.now();
    this.playbackDurationMs = Math.max(1, this.replay.trajectory.at(-1)!.simulatedAtMs);
    this.onComplete = undefined;
    this.startFrames();
  }

  playTo(number: number, durationMs: number, elapsedMs: number, onComplete: () => void) {
    if (!this.replay?.trajectory.length) {
      onComplete();
      return;
    }
    this.looping = false;
    this.targetNumber = number;
    this.canvas.dataset.replayState = "landing";
    this.canvas.dataset.replayPocket = String(number);
    this.playbackDurationMs = Math.max(1, durationMs);
    this.playbackStartedAt = performance.now() - Math.min(durationMs, Math.max(0, elapsedMs));
    this.onComplete = onComplete;
    this.startFrames();
  }

  settle(number: number) {
    if (!this.replay?.trajectory.length) return;
    this.looping = false;
    this.targetNumber = number;
    this.canvas.dataset.replayState = "settled";
    this.canvas.dataset.replayPocket = String(number);
    this.applySample(this.replay.trajectory.at(-1)!);
    this.renderFrame();
    cancelAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  private async loadReplay() {
    const response = await fetch(REPLAY_URL, { credentials: "same-origin", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error("PHYSICS_REPLAY_UNAVAILABLE");
    const replay = await response.json() as PhysicsReplay;
    if (replay.status !== "SETTLED" || !replay.finalPocket || replay.trajectory.length < 2) {
      throw new Error("PHYSICS_REPLAY_NOT_SETTLED");
    }
    this.replay = replay;
  }

  private async loadModel() {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const runtime = gltf.scene.clone(true);
    runtime.getObjectByName("Sphere_16")?.removeFromParent();
    runtime.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(runtime);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = TARGET_WHEEL_DIAMETER / Math.max(size.x, size.z);
    const sourceRoot = runtime.getObjectByName("GLTF_SceneRootNode") ?? runtime;
    const stationary = new THREE.Group();
    const rotor = new THREE.Group();
    [...sourceRoot.children].forEach((child) => {
      const isRotor = child.name.startsWith("Text_29") || child.name.startsWith("Plane");
      (isRotor ? rotor : stationary).attach(child);
    });
    const wheel = new THREE.Group();
    wheel.add(stationary, rotor);
    wheel.scale.setScalar(scale);
    wheel.position.copy(center).multiplyScalar(-scale);
    wheel.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.rotor = rotor;
    this.scene.add(wheel);
  }

  private startFrames() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      const replay = this.replay;
      if (!replay?.trajectory.length) return;
      const elapsed = performance.now() - this.playbackStartedAt;
      const progress = this.looping
        ? (elapsed % this.playbackDurationMs) / this.playbackDurationMs
        : Math.min(1, elapsed / this.playbackDurationMs);
      const replayMs = progress * replay.trajectory.at(-1)!.simulatedAtMs;
      this.applyAt(replayMs);
      this.renderFrame();
      if (!this.looping && progress >= 1) {
        this.canvas.dataset.replayState = "settled";
        const complete = this.onComplete;
        this.onComplete = undefined;
        complete?.();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private applyAt(simulatedAtMs: number) {
    const samples = this.replay!.trajectory;
    let rightIndex = samples.findIndex((sample) => sample.simulatedAtMs >= simulatedAtMs);
    if (rightIndex < 0) rightIndex = samples.length - 1;
    const left = samples[Math.max(0, rightIndex - 1)];
    const right = samples[rightIndex];
    const span = Math.max(1, right.simulatedAtMs - left.simulatedAtMs);
    const alpha = Math.max(0, Math.min(1, (simulatedAtMs - left.simulatedAtMs) / span));
    const interpolated: ReplaySample = {
      simulatedAtMs,
      ball: {
        position: {
          x: THREE.MathUtils.lerp(left.ball.position.x, right.ball.position.x, alpha),
          y: THREE.MathUtils.lerp(left.ball.position.y, right.ball.position.y, alpha),
          z: THREE.MathUtils.lerp(left.ball.position.z, right.ball.position.z, alpha),
        },
        orientation: left.ball.orientation,
      },
      rotor: { orientation: left.rotor.orientation },
    };
    const ballLeft = new THREE.Quaternion();
    const ballRight = new THREE.Quaternion();
    copyQuaternion(ballLeft, left.ball.orientation);
    copyQuaternion(ballRight, right.ball.orientation);
    ballLeft.slerp(ballRight, alpha);
    interpolated.ball.orientation = ballLeft;
    const rotorLeft = new THREE.Quaternion();
    const rotorRight = new THREE.Quaternion();
    copyQuaternion(rotorLeft, left.rotor.orientation);
    copyQuaternion(rotorRight, right.rotor.orientation);
    rotorLeft.slerp(rotorRight, alpha);
    interpolated.rotor.orientation = rotorLeft;
    this.applySample(interpolated);
  }

  private applySample(sample: ReplaySample) {
    const templateIndex = this.replay?.finalPocket?.index ?? 0;
    const targetIndex = this.targetNumber === null ? templateIndex : Math.max(0, indexFor(this.targetNumber));
    const yaw = THREE.MathUtils.degToRad((targetIndex - templateIndex) * ROULETTE_SEGMENT_DEGREES);
    const yawRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.ball.position.set(sample.ball.position.x, sample.ball.position.y, sample.ball.position.z).applyQuaternion(yawRotation);
    copyQuaternion(this.ball.quaternion, sample.ball.orientation);
    this.ball.quaternion.premultiply(yawRotation);
    if (this.rotor) copyQuaternion(this.rotor.quaternion, sample.rotor.orientation);
  }

  private resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderFrame();
  }

  private renderFrame() {
    this.renderer.render(this.scene, this.camera);
  }
}