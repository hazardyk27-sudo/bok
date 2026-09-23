import { AudioManager } from "../game/AudioManager";
import {
  interpolateScratchPoints,
  SCRATCH_ABRASION_CONFIG,
  ScratchProgressGrid,
  type ScratchAbrasionConfig,
  type ScratchPoint,
} from "./ScratchProgress";
import { prefersReducedMotion } from "./ScratchFeedback";

const MIN_RESULT_COMMIT_DISTANCE_PX = 3;
const MIN_AUDIO_INTERVAL_MS = 28;
const MAX_TRAIL_SAMPLES = 1400;
const MAX_DEBRIS_PARTICLES = 14;
const MOBILE_DEBRIS_PARTICLES = 8;

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

type TrailSample = {
  point: ScratchPoint;
  angle: number;
  speed: number;
};

export type ScratchSurfaceOptions = {
  abrasion?: Partial<ScratchAbrasionConfig>;
  audio?: AudioManager;
  debrisCanvas?: HTMLCanvasElement;
  resultReady?: boolean;
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
  private resultReady = false;
  private resultRequest: Promise<void> | null = null;
  private lastMoveAt = 0;
  private lastAudioAt = -Infinity;
  private brushStep = 0;
  private trail: TrailSample[] = [];
  private debrisFrame: number | null = null;
  private debrisFrameAt = 0;
  private debris: DebrisParticle[] = [];

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.pointerId.value = event.pointerId;
    this.lastPoint = this.pointFromEvent(event);
    this.gestureDistance = 0;
    this.lastMoveAt = performance.now();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-scratching");
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.pointerId.value !== event.pointerId || !this.lastPoint) return;
    const point = this.pointFromEvent(event);
    const deltaX = point.x - this.lastPoint.x;
    const deltaY = point.y - this.lastPoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.0006) return;

    const now = performance.now();
    const distancePx = distance * Math.max(1, this.canvas.clientWidth);
    const elapsed = Math.max(8, now - this.lastMoveAt);
    const speed = clamp(distancePx / elapsed / 1.05);
    const angle = Math.atan2(deltaY, deltaX);
    this.gestureDistance += distancePx;

    if (!this.resultReady && this.gestureDistance >= MIN_RESULT_COMMIT_DISTANCE_PX) {
      this.ensureResultCommitted();
    }

    for (const sample of interpolateScratchPoints(this.lastPoint, point, 0.018)) {
      const depthGain = this.abrasionConfig.depthPerSample * (0.92 + speed * 0.34);
      this.progress.sampleCircle(sample.x, sample.y, this.abrasionConfig.brushRadius, depthGain);
      this.rememberTrail(sample, angle, speed);
      if (this.resultReady && this.progress.isRevealableAt(sample.x, sample.y)) {
        this.cutFoil(sample, angle, speed);
      } else {
        this.drawScuff(sample, angle, speed);
      }
    }

    this.emitDebris(point, angle, speed);
    if (now - this.lastAudioAt >= MIN_AUDIO_INTERVAL_MS) {
      this.audio?.scratch(speed, this.progress.depthAt(point.x, point.y));
      this.lastAudioAt = now;
    }

    this.lastPoint = point;
    this.lastMoveAt = now;
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
    this.progress = new ScratchProgressGrid(18, 12, 1, this.abrasionConfig);
    this.onCommit = options.onCommit;
    this.audio = options.audio;
    this.reducedMotion = prefersReducedMotion();
    this.debrisCanvas = options.debrisCanvas;
    this.debrisContext = options.debrisCanvas?.getContext("2d") ?? undefined;
    this.resultReady = options.resultReady ?? false;
    if (this.resultReady) this.resultRequest = Promise.resolve();
    this.resizeCanvas();
    this.paintCover();
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.finishPointer);
    canvas.addEventListener("pointercancel", this.finishPointer);
    canvas.addEventListener("lostpointercapture", this.finishPointer);
  }

  destroy() {
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
    if (this.pointerId.value !== null && this.canvas.hasPointerCapture(this.pointerId.value)) {
      this.canvas.releasePointerCapture(this.pointerId.value);
    }
    this.pointerId.value = null;
    this.lastPoint = null;
    this.gestureDistance = 0;
    this.lastMoveAt = 0;
    this.lastAudioAt = -Infinity;
    this.brushStep = 0;
    this.trail = [];
    this.resultReady = false;
    this.resultRequest = null;
    this.progress.reset();
    this.context.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.clearDebris();
    this.paintCover();
  }

  private rememberTrail(point: ScratchPoint, angle: number, speed: number) {
    this.trail.push({ point, angle, speed });
    if (this.trail.length > MAX_TRAIL_SAMPLES) {
      this.trail.splice(0, this.trail.length - MAX_TRAIL_SAMPLES);
    }
  }

  private ensureResultCommitted() {
    if (this.resultReady || this.resultRequest) return;
    this.resultRequest = this.onCommit()
      .then(() => {
        this.resultReady = true;
        this.replayTrail();
      })
      .catch(() => {
        this.resultReady = false;
        this.resultRequest = null;
      });
  }

  private replayTrail() {
    for (const sample of this.trail) {
      if (this.progress.isRevealableAt(sample.point.x, sample.point.y)) {
        this.cutFoil(sample.point, sample.angle, sample.speed);
      }
    }
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
    base.addColorStop(0, "#e0bb70");
    base.addColorStop(.18, "#a57338");
    base.addColorStop(.46, "#d1a457");
    base.addColorStop(.72, "#8a5d31");
    base.addColorStop(1, "#d9b36a");
    this.context.fillStyle = base;
    this.context.fillRect(0, 0, width, height);

    const sheen = this.context.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, "rgba(255, 247, 205, .3)");
    sheen.addColorStop(.32, "rgba(255, 240, 186, .05)");
    sheen.addColorStop(.6, "rgba(36, 24, 18, .10)");
    sheen.addColorStop(1, "rgba(255, 226, 155, .18)");
    this.context.fillStyle = sheen;
    this.context.fillRect(0, 0, width, height);

    this.context.save();
    this.context.lineCap = "round";
    for (let index = -12; index < Math.ceil(width / 8) + 16; index += 1) {
      const x = index * 8;
      this.context.beginPath();
      this.context.moveTo(x, 0);
      this.context.lineTo(x + height * .92, height);
      this.context.lineWidth = index % 3 === 0 ? .7 : .4;
      this.context.strokeStyle = index % 4 === 0
        ? "rgba(255, 244, 198, .2)"
        : "rgba(57, 36, 20, .11)";
      this.context.stroke();
    }
    this.context.restore();

    const vignette = this.context.createRadialGradient(width * .5, height * .45, 0, width * .5, height * .45, Math.max(width, height) * .8);
    vignette.addColorStop(0, "rgba(255,255,255,.02)");
    vignette.addColorStop(1, "rgba(45,25,11,.16)");
    this.context.fillStyle = vignette;
    this.context.fillRect(0, 0, width, height);
  }

  private pointFromEvent(event: PointerEvent): ScratchPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }

  private drawScuff(point: ScratchPoint, angle: number, speed: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const radius = Math.max(6, width * this.abrasionConfig.brushRadius);
    const x = point.x * width;
    const y = point.y * height;

    this.context.save();
    this.context.translate(x, y);
    this.context.rotate(angle);
    this.context.globalCompositeOperation = "source-over";
    this.context.globalAlpha = 0.16 + speed * 0.06;
    this.context.strokeStyle = "rgba(255, 244, 204, .72)";
    this.context.lineWidth = Math.max(.55, radius * .045);
    this.context.beginPath();
    this.context.moveTo(-radius * .52, -radius * .08);
    this.context.lineTo(radius * .58, radius * .07);
    this.context.stroke();

    this.context.globalAlpha = .08;
    this.context.strokeStyle = "rgba(66, 40, 21, .8)";
    this.context.lineWidth = Math.max(.35, radius * .025);
    this.context.beginPath();
    this.context.moveTo(-radius * .36, radius * .18);
    this.context.lineTo(radius * .44, radius * .24);
    this.context.stroke();
    this.context.restore();
  }

  private cutFoil(point: ScratchPoint, angle: number, speed: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const radius = Math.max(7, width * this.abrasionConfig.brushRadius * .82);
    const x = point.x * width;
    const y = point.y * height;
    const roughness = .9 + Math.sin(this.brushStep * 1.63) * .07;
    this.brushStep += 1;

    this.context.save();
    this.context.translate(x, y);
    this.context.rotate(angle);
    this.context.globalCompositeOperation = "destination-out";
    this.context.globalAlpha = .9;
    this.context.fillStyle = "#000";
    this.drawBrushPath(radius, speed, roughness);
    this.context.restore();
  }

  private drawBrushPath(radius: number, speed: number, roughness: number) {
    this.context.beginPath();
    for (let index = 0; index < 18; index += 1) {
      const theta = (index / 18) * Math.PI * 2;
      const variation = roughness + Math.sin(index * 3.91 + this.brushStep * .31) * .09;
      const pointX = Math.cos(theta) * radius * variation;
      const pointY = Math.sin(theta) * radius * (.72 + speed * .12) * variation;
      if (index === 0) this.context.moveTo(pointX, pointY);
      else this.context.lineTo(pointX, pointY);
    }
    this.context.closePath();
    this.context.fill();
  }

  private emitDebris(point: ScratchPoint, angle: number, speed: number) {
    if (this.reducedMotion || !this.debrisContext || speed < .1) return;
    const isCompact = window.innerWidth <= 720 || (navigator.maxTouchPoints ?? 0) > 0;
    const limit = isCompact ? MOBILE_DEBRIS_PARTICLES : MAX_DEBRIS_PARTICLES;
    const count = speed > .68 ? 2 : 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    for (let index = 0; index < count; index += 1) {
      if (this.debris.length >= limit) this.debris.shift();
      const spread = (index - (count - 1) / 2) * .3;
      this.debris.push({
        x: point.x * width,
        y: point.y * height,
        vx: Math.cos(angle + Math.PI + spread) * (.2 + speed * .9),
        vy: Math.sin(angle + Math.PI + spread) * (.2 + speed * .9) - (.15 + speed * .5),
        size: .7 + speed * 1.1,
        rotation: angle + index,
        spin: (index % 2 ? 1 : -1) * (.04 + speed * .08),
        life: 0,
        maxLife: 190 + speed * 150,
        alpha: .28 + speed * .24,
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
      particle.vy += .0012 * elapsed;
      particle.rotation += particle.spin * elapsed;
      const lifeProgress = particle.life / particle.maxLife;
      if (lifeProgress >= 1) return false;

      this.debrisContext!.save();
      this.debrisContext!.translate(particle.x, particle.y);
      this.debrisContext!.rotate(particle.rotation);
      this.debrisContext!.globalAlpha = particle.alpha * (1 - lifeProgress);
      this.debrisContext!.fillStyle = lifeProgress < .45 ? "#f1d38c" : "#a87943";
      this.debrisContext!.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * .55);
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
}
