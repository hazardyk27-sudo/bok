import { AudioManager } from "../game/AudioManager";
import {
  interpolateScratchPoints,
  SCRATCH_ABRASION_CONFIG,
  SCRATCH_REVEAL_THRESHOLD,
  ScratchProgressGrid,
  type ScratchAbrasionConfig,
  type ScratchPoint,
} from "./ScratchProgress";
import { prefersReducedMotion } from "./ScratchFeedback";

const MIN_GESTURE_DISTANCE_PX = 18;
const MIN_AUDIO_INTERVAL_MS = 28;
const MAX_DEBRIS_PARTICLES = 18;
const MOBILE_DEBRIS_PARTICLES = 10;
export const SCRATCH_COMPLETION_DURATION_MS = 180;

export function getCompletionEraseAlpha(progress: number, previousProgress: number) {
  if (progress >= 1) return 1;
  return Math.max(0, progress - previousProgress) / Math.max(0.001, 1 - previousProgress);
}

type DebrisParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  life: number;
  maxLife: number;
  alpha: number;
};

export type ScratchSurfaceOptions = {
  threshold?: number;
  abrasion?: Partial<ScratchAbrasionConfig>;
  audio?: AudioManager;
  debrisCanvas?: HTMLCanvasElement;
  onCommit: () => Promise<void>;
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

export class ScratchSurface {
  private readonly context: CanvasRenderingContext2D;
  private readonly progress: ScratchProgressGrid;
  private readonly onCommit: () => Promise<void>;
  private readonly audio?: AudioManager;
  private readonly abrasionConfig: ScratchAbrasionConfig;
  private readonly reducedMotion: boolean;
  private readonly debrisCanvas?: HTMLCanvasElement;
  private readonly debrisContext?: CanvasRenderingContext2D;
  private readonly pointerId: { value: number | null } = { value: null };
  private lastPoint: ScratchPoint | null = null;
  private gestureDistance = 0;
  private committed = false;
  private completionFrame: number | null = null;
  private completionGeneration = 0;
  private lastMoveAt = 0;
  private lastAudioAt = -Infinity;
  private brushStep = 0;
  private debrisFrame: number | null = null;
  private debrisFrameAt = 0;
  private debris: DebrisParticle[] = [];

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.committed) return;
    this.pointerId.value = event.pointerId;
    this.lastPoint = this.pointFromEvent(event);
    this.gestureDistance = 0;
    this.lastMoveAt = performance.now();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-scratching");
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.committed || this.pointerId.value !== event.pointerId || !this.lastPoint) return;
    const point = this.pointFromEvent(event);
    const deltaX = point.x - this.lastPoint.x;
    const deltaY = point.y - this.lastPoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.001) return;

    const now = performance.now();
    const distancePx = distance * this.canvas.clientWidth;
    const elapsed = Math.max(8, now - this.lastMoveAt);
    const speed = clamp(distancePx / elapsed / 1.1);
    const angle = Math.atan2(deltaY, deltaX);
    this.gestureDistance += distancePx;
    for (const sample of interpolateScratchPoints(this.lastPoint, point)) {
      const depthGain = this.abrasionConfig.depthPerSample * (0.82 + speed * 0.42);
      this.progress.sampleCircle(sample.x, sample.y, this.abrasionConfig.brushRadius, depthGain);
      this.erase(sample, angle, speed, this.progress.isRevealableAt(sample.x, sample.y));
    }
    this.emitDebris(point, angle, speed);
    if (now - this.lastAudioAt >= MIN_AUDIO_INTERVAL_MS) {
      this.audio?.scratch(speed, this.progress.depthAt(point.x, point.y));
      this.lastAudioAt = now;
    }
    this.lastPoint = point;
    this.lastMoveAt = now;
    this.tryCommit();
    event.preventDefault();
  };

  private readonly finishPointer = (event: PointerEvent) => {
    if (this.pointerId.value !== event.pointerId) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.pointerId.value = null;
    this.lastPoint = null;
    this.lastMoveAt = 0;
    this.canvas.classList.remove("is-scratching");
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: ScratchSurfaceOptions,
  ) {
    this.context = canvas.getContext("2d")!;
    this.abrasionConfig = { ...SCRATCH_ABRASION_CONFIG, ...options.abrasion };
    this.progress = new ScratchProgressGrid(10, 10, options.threshold ?? SCRATCH_REVEAL_THRESHOLD, this.abrasionConfig);
    this.onCommit = options.onCommit;
    this.audio = options.audio;
    this.reducedMotion = prefersReducedMotion();
    this.debrisCanvas = options.debrisCanvas;
    this.debrisContext = options.debrisCanvas?.getContext("2d") ?? undefined;
    this.resizeCanvas();
    this.paintCover();
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.finishPointer);
    canvas.addEventListener("pointercancel", this.finishPointer);
    canvas.addEventListener("lostpointercapture", this.finishPointer);
  }

  destroy() {
    this.cancelCompletion();
    this.cancelDebris();
    if (this.pointerId.value !== null && this.canvas.hasPointerCapture(this.pointerId.value)) {
      this.canvas.releasePointerCapture(this.pointerId.value);
    }
    this.pointerId.value = null;
    this.lastPoint = null;
    this.canvas.classList.remove("is-scratching");
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.finishPointer);
    this.canvas.removeEventListener("pointercancel", this.finishPointer);
    this.canvas.removeEventListener("lostpointercapture", this.finishPointer);
  }

  reset() {
    this.cancelCompletion();
    this.pointerId.value = null;
    this.lastPoint = null;
    this.gestureDistance = 0;
    this.lastMoveAt = 0;
    this.lastAudioAt = -Infinity;
    this.brushStep = 0;
    this.committed = false;
    this.progress.reset();
    this.context.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.clearDebris();
    this.paintCover();
  }

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.debrisCanvas && this.debrisContext) {
      this.debrisCanvas.width = Math.max(1, Math.round(rect.width * ratio));
      this.debrisCanvas.height = Math.max(1, Math.round(rect.height * ratio));
      this.debrisContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  private paintCover() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const base = this.context.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "rgba(220, 184, 99, .99)");
    base.addColorStop(.22, "rgba(111, 75, 34, .99)");
    base.addColorStop(.48, "rgba(190, 145, 65, .99)");
    base.addColorStop(.74, "rgba(73, 49, 31, .99)");
    base.addColorStop(1, "rgba(224, 183, 83, .99)");
    this.context.fillStyle = base;
    this.context.fillRect(0, 0, width, height);

    const sheen = this.context.createRadialGradient(width * .28, height * .12, 0, width * .28, height * .12, width * .9);
    sheen.addColorStop(0, "rgba(255, 248, 207, .3)");
    sheen.addColorStop(.32, "rgba(255, 224, 143, .08)");
    sheen.addColorStop(1, "rgba(39, 26, 19, .16)");
    this.context.fillStyle = sheen;
    this.context.fillRect(0, 0, width, height);

    this.context.save();
    this.context.lineCap = "round";
    for (let index = 0; index < Math.ceil(width / 7) + 18; index += 1) {
      const offset = index * 7 - height;
      const wobble = Math.sin(index * 1.73) * 4;
      this.context.beginPath();
      this.context.moveTo(offset + wobble, 0);
      this.context.lineTo(offset + height * 0.98 + Math.sin(index * 2.4) * 5, height);
      this.context.lineWidth = 0.45 + (index % 4) * 0.28;
      this.context.strokeStyle = index % 3 === 0
        ? "rgba(255, 237, 170, .2)"
        : "rgba(41, 27, 20, .14)";
      this.context.stroke();
    }
    for (let index = 0; index < 28; index += 1) {
      const x = (Math.sin(index * 9.17) * 0.5 + 0.5) * width;
      const y = (Math.sin(index * 4.31 + 1.2) * 0.5 + 0.5) * height;
      this.context.beginPath();
      this.context.moveTo(x, y);
      this.context.lineTo(x + 7 + (index % 5) * 2, y + Math.sin(index) * 2);
      this.context.lineWidth = 0.55;
      this.context.strokeStyle = "rgba(255, 235, 164, .18)";
      this.context.stroke();
    }
    this.context.restore();

    const edge = this.context.createLinearGradient(0, 0, 0, height);
    edge.addColorStop(0, "rgba(255, 249, 210, .1)");
    edge.addColorStop(.5, "rgba(255, 249, 210, 0)");
    edge.addColorStop(1, "rgba(26, 17, 13, .16)");
    this.context.fillStyle = edge;
    this.context.fillRect(0, 0, width, height);
  }

  private pointFromEvent(event: PointerEvent): ScratchPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }

  private erase(point: ScratchPoint, angle: number, speed: number, revealable: boolean) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const radius = Math.max(8, width * this.abrasionConfig.brushRadius);
    const x = point.x * width;
    const y = point.y * height;
    const roughness = 0.9 + Math.sin(this.brushStep * 1.7) * 0.06;
    this.brushStep += 1;
    this.context.save();
    this.context.translate(x, y);
    this.context.rotate(angle);
    this.context.globalCompositeOperation = "source-over";
    this.context.globalAlpha = 0.12 + speed * 0.05;
    this.context.fillStyle = "#4d3428";
    this.drawBrushPath(radius, speed, roughness);
    this.context.globalAlpha = 0.11 + speed * 0.06;
    this.context.strokeStyle = "#f8d98f";
    this.context.lineWidth = Math.max(0.6, radius * 0.06);
    this.context.beginPath();
    this.context.moveTo(-radius * 0.52, -radius * 0.08);
    this.context.lineTo(radius * 0.58, radius * 0.1);
    this.context.stroke();
    if (revealable) {
      this.context.globalCompositeOperation = "destination-out";
      // Keep the rough scuff as a rim, but fully clear the already-abraded
      // center so the real result layer is visible instead of a dark smear.
      this.context.globalAlpha = 1;
      this.context.fillStyle = "#000";
      this.drawBrushPath(radius * 0.64, speed, roughness);
    }
    this.context.restore();
  }

  private drawBrushPath(radius: number, speed: number, roughness: number) {
    this.context.beginPath();
    for (let index = 0; index < 12; index += 1) {
      const theta = (index / 12) * Math.PI * 2;
      const variation = roughness + Math.sin(index * 4.17 + this.brushStep * 0.23) * 0.11;
      const pointX = Math.cos(theta) * radius * variation;
      const pointY = Math.sin(theta) * radius * (0.82 + speed * 0.16) * variation;
      if (index === 0) this.context.moveTo(pointX, pointY);
      else this.context.lineTo(pointX, pointY);
    }
    this.context.closePath();
    this.context.fill();
  }

  private emitDebris(point: ScratchPoint, angle: number, speed: number) {
    if (this.reducedMotion || !this.debrisContext || speed < 0.08) return;
    const isCompact = window.innerWidth <= 720 || (navigator.maxTouchPoints ?? 0) > 0;
    const limit = isCompact ? MOBILE_DEBRIS_PARTICLES : MAX_DEBRIS_PARTICLES;
    const count = speed > 0.62 ? 2 : 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    for (let index = 0; index < count; index += 1) {
      if (this.debris.length >= limit) this.debris.shift();
      const spread = (index - (count - 1) / 2) * 0.35;
      this.debris.push({
        x: point.x * width,
        y: point.y * height,
        vx: Math.cos(angle + Math.PI + spread) * (0.35 + speed * 1.4),
        vy: Math.sin(angle + Math.PI + spread) * (0.35 + speed * 1.4) - (0.2 + speed * 0.8),
        size: 0.8 + speed * 1.4 + (index % 2) * 0.5,
        rotation: angle + index,
        spin: (index % 2 ? 1 : -1) * (0.05 + speed * 0.12),
        life: 0,
        maxLife: 220 + speed * 170,
        alpha: 0.32 + speed * 0.32,
      });
    }
    if (this.debrisFrame === null) {
      this.debrisFrameAt = performance.now();
      this.debrisFrame = window.requestAnimationFrame(this.animateDebris);
    }
  }

  private readonly animateDebris = (timestamp: number) => {
    if (!this.debrisContext || !this.debrisCanvas) {
      this.debrisFrame = null;
      return;
    }
    const elapsed = Math.min(34, Math.max(1, timestamp - this.debrisFrameAt));
    this.debrisFrameAt = timestamp;
    const width = this.debrisCanvas.clientWidth;
    const height = this.debrisCanvas.clientHeight;
    this.debrisContext.clearRect(0, 0, width, height);
    this.debris = this.debris.filter((particle) => {
      particle.life += elapsed;
      particle.x += particle.vx * elapsed;
      particle.y += particle.vy * elapsed;
      particle.vy += 0.0016 * elapsed;
      particle.rotation += particle.spin * elapsed;
      const lifeProgress = particle.life / particle.maxLife;
      if (lifeProgress >= 1) return false;
      this.debrisContext!.save();
      this.debrisContext!.translate(particle.x, particle.y);
      this.debrisContext!.rotate(particle.rotation);
      this.debrisContext!.globalAlpha = particle.alpha * (1 - lifeProgress);
      this.debrisContext!.fillStyle = lifeProgress < 0.45 ? "#f4d283" : "#a8753d";
      this.debrisContext!.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.65);
      this.debrisContext!.restore();
      return particle.x > -8 && particle.x < width + 8 && particle.y > -8 && particle.y < height + 8;
    });
    if (this.debris.length > 0) this.debrisFrame = window.requestAnimationFrame(this.animateDebris);
    else this.debrisFrame = null;
  };

  private clearDebris() {
    this.cancelDebris();
    this.debris = [];
    this.debrisContext?.clearRect(0, 0, this.debrisCanvas?.clientWidth ?? 0, this.debrisCanvas?.clientHeight ?? 0);
  }

  private cancelDebris() {
    if (this.debrisFrame !== null) {
      window.cancelAnimationFrame(this.debrisFrame);
      this.debrisFrame = null;
    }
  }

  private tryCommit() {
    if (this.committed || this.gestureDistance < MIN_GESTURE_DISTANCE_PX || !this.progress.committed) return;
    this.committed = true;
    this.animateCompletion();
  }

  private cancelCompletion() {
    this.completionGeneration += 1;
    if (this.completionFrame !== null) {
      window.cancelAnimationFrame(this.completionFrame);
      this.completionFrame = null;
    }
  }

  private animateCompletion() {
    const generation = this.completionGeneration + 1;
    this.completionGeneration = generation;
    // Keep the partial abrasion visible while the server decides the result.
    // The result layer is still empty at this point, so no hidden bomb data
    // can leak through the openings.
    void this.onCommit().then(() => {
      if (generation !== this.completionGeneration) return;
      if (this.reducedMotion) {
        this.context.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        this.clearDebris();
        return;
      }
      const startedAt = performance.now();
      let previousProgress = 0;
      const animate = (timestamp: number) => {
        if (generation !== this.completionGeneration) return;
        const progress = Math.min(1, (timestamp - startedAt) / SCRATCH_COMPLETION_DURATION_MS);
        const progressDelta = progress - previousProgress;
        this.context.save();
        this.context.globalCompositeOperation = "destination-out";
        // destination-out compounds across frames. Convert the linear overall
        // progress into the incremental alpha needed to reach that exact
        // remaining mask opacity instead of clearing almost everything early.
        this.context.globalAlpha = getCompletionEraseAlpha(progress, previousProgress);
        this.context.fillStyle = "#000";
        this.context.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        this.context.restore();
        previousProgress = progress;
        if (progress >= 1) {
          this.completionFrame = null;
          this.clearDebris();
          return;
        }
        this.completionFrame = window.requestAnimationFrame(animate);
      };
      this.completionFrame = window.requestAnimationFrame(animate);
    });
  }
}