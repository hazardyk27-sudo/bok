import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_MODEL_PATH,
  ROULETTE_PHYSICS_SCHEMA_VERSION,
  ROULETTE_RAW_SOURCE_CENTER,
  ROULETTE_WHEEL_DIAMETER,
  ROULETTE_Y_ORIGIN,
} from "../../../lib/roulette-physics-config";

type Vec3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };

type ReplaySample = {
  simulatedAtMs: number;
  ball: { position: Vec3; orientation: Quaternion };
  rotor: { orientation: Quaternion };
};

type PhysicsReplay = {
  roundId: string;
  status: "SETTLED" | "INVALID";
  winningNumber: number | null;
  finalPocket: { index: number; number: number } | null;
  trajectoryHash: string;
  trajectory: ReplaySample[];
};
const MODEL_URL = ROULETTE_MODEL_PATH;
const TARGET_WHEEL_DIAMETER = ROULETTE_WHEEL_DIAMETER;

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
  private loadedRouletteRoundId = "";
  private playbackComplete = false;
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
    await player.loadModel();
    player.resize();
    player.renderFrame();
    canvas.dataset.physicsSchema = ROULETTE_PHYSICS_SCHEMA_VERSION;
    canvas.dataset.ready = "true";
    return player;
  }

  async startLoop(roundId: string, elapsedMs = 0) {
    await this.loadReplay(roundId);
    if (!this.replay?.trajectory.length) return;
    this.playbackComplete = false;
    this.canvas.dataset.replayState = "spinning";
    delete this.canvas.dataset.replayPocket;
    this.playbackDurationMs = Math.max(
      1,
      this.replay.trajectory.at(-1)!.simulatedAtMs,
    );
    this.playbackStartedAt =
      performance.now() -
      Math.min(this.playbackDurationMs, Math.max(0, elapsedMs));
    this.onComplete = undefined;
    this.startFrames();
  }

  async playTo(
    roundId: string,
    expectedNumber: number,
    onComplete: () => void,
  ) {
    await this.loadReplay(roundId);
    this.assertExpectedNumber(expectedNumber);
    if (!this.replay?.trajectory.length) throw new Error("PHYSICS_REPLAY_UNAVAILABLE");

    this.canvas.dataset.replayState = "landing";
    this.canvas.dataset.replayPocket = String(expectedNumber);
    this.onComplete = onComplete;

    if (this.playbackComplete || this.playbackStartedAt === 0) {
      this.applySample(this.replay.trajectory.at(-1)!);
      this.renderFrame();
      this.playbackComplete = true;
      this.finishPlayback();
      return;
    }

    this.startFrames();
  }

  async settle(roundId: string, expectedNumber: number) {
    await this.loadReplay(roundId);
    this.assertExpectedNumber(expectedNumber);
    if (!this.replay?.trajectory.length) throw new Error("PHYSICS_REPLAY_UNAVAILABLE");

    cancelAnimationFrame(this.frame);
    this.playbackComplete = true;
    this.canvas.dataset.replayState = "settled";
    this.canvas.dataset.replayPocket = String(expectedNumber);
    this.applySample(this.replay.trajectory.at(-1)!);
    this.renderFrame();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  private async loadReplay(rouletteRoundId: string) {
    if (
      this.loadedRouletteRoundId === rouletteRoundId &&
      this.replay?.trajectory.length
    ) {
      return;
    }

    const response = await fetch(
      `/api/roulette/rounds/${encodeURIComponent(rouletteRoundId)}/replay`,
      {
        credentials: "same-origin",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) throw new Error("PHYSICS_REPLAY_UNAVAILABLE");
    const replay = await response.json() as PhysicsReplay;
    if (
      replay.status !== "SETTLED" ||
      !replay.finalPocket ||
      replay.winningNumber === null ||
      replay.finalPocket.number !== replay.winningNumber ||
      replay.trajectory.length < 2
    ) {
      throw new Error("PHYSICS_REPLAY_NOT_SETTLED");
    }
    this.replay = replay;
    this.loadedRouletteRoundId = rouletteRoundId;
    this.playbackStartedAt = 0;
    this.playbackComplete = false;
  }

  private assertExpectedNumber(expectedNumber: number) {
    if (
      !this.replay?.finalPocket ||
      this.replay.finalPocket.number !== expectedNumber ||
      this.replay.winningNumber !== expectedNumber
    ) {
      throw new Error("ROULETTE_PHYSICS_RESULT_MISMATCH");
    }
  }

  private async loadModel() {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const runtime = gltf.scene.clone(true);
    runtime.getObjectByName("Sphere_16")?.removeFromParent();

    const embeddedScaleNode = runtime.getObjectByName("GLTF_SceneRootNode");
    if (!embeddedScaleNode) {
      throw new Error("ROULETTE_MODEL_SCALE_ROOT_MISSING");
    }
    embeddedScaleNode.scale.set(1, 1, 1);
    runtime.updateMatrixWorld(true);

    const outside = runtime.getObjectByName("geo1_outside_0");
    const inside = runtime.getObjectByName("geo1_inside_0");
    const turret = runtime.getObjectByName("geo1_turret_0");
    if (!outside || !inside || !turret) {
      throw new Error("ROULETTE_MODEL_REQUIRED_NODES_MISSING");
    }

    const sourceCenter = new THREE.Vector3(
      ROULETTE_RAW_SOURCE_CENTER.x,
      ROULETTE_RAW_SOURCE_CENTER.y,
      ROULETTE_RAW_SOURCE_CENTER.z,
    );

    const wheel = new THREE.Group();
    wheel.position.set(0, ROULETTE_Y_ORIGIN, 0);

    const runtimeOffset = new THREE.Group();
    runtimeOffset.position.set(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
    runtimeOffset.scale.setScalar(ROULETTE_AUTHORITATIVE_SCALE);
    runtimeOffset.add(runtime);
    wheel.add(runtimeOffset);
    wheel.updateMatrixWorld(true);

    const normalizedBounds = new THREE.Box3().setFromObject(runtime);
    runtimeOffset.position.sub(normalizedBounds.getCenter(new THREE.Vector3()));
    wheel.updateMatrixWorld(true);

    const stationary = new THREE.Group();
    const rotorPivot = new THREE.Group();
    const rotorVisual = new THREE.Group();
    rotorPivot.add(rotorVisual);
    wheel.add(stationary, rotorPivot);
    stationary.attach(outside);
    stationary.attach(turret);
    rotorVisual.attach(inside);
    wheel.remove(runtimeOffset);
    wheel.updateMatrixWorld(true);

    const finalBounds = new THREE.Box3().setFromObject(wheel);
    const finalSize = finalBounds.getSize(new THREE.Vector3());
    const diameterError =
      Math.abs(Math.max(finalSize.x, finalSize.z) - TARGET_WHEEL_DIAMETER);
    if (diameterError > 0.03) {
      throw new Error("ROULETTE_MODEL_AUTHORITATIVE_SCALE_MISMATCH");
    }

    wheel.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.rotor = rotorPivot;
    this.scene.add(wheel);
  }

  private startFrames() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      const replay = this.replay;
      if (!replay?.trajectory.length) return;
      const elapsed = performance.now() - this.playbackStartedAt;
      const replayMs = Math.min(
        replay.trajectory.at(-1)!.simulatedAtMs,
        Math.max(0, elapsed),
      );
      this.applyAt(replayMs);
      this.renderFrame();

      if (replayMs >= replay.trajectory.at(-1)!.simulatedAtMs) {
        this.playbackComplete = true;
        if (this.onComplete) this.finishPlayback();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private finishPlayback() {
    this.canvas.dataset.replayState = "settled";
    const complete = this.onComplete;
    this.onComplete = undefined;
    complete?.();
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
    this.ball.position.set(
      sample.ball.position.x,
      sample.ball.position.y,
      sample.ball.position.z,
    );
    copyQuaternion(this.ball.quaternion, sample.ball.orientation);
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