import {
  interpolateScratchPoints,
  SCRATCH_REVEAL_THRESHOLD,
  ScratchProgressGrid,
  type ScratchPoint,
} from "./ScratchProgress";

const BRUSH_RADIUS = 0.16;
const MIN_GESTURE_DISTANCE_PX = 18;
export const SCRATCH_COMPLETION_DURATION_MS = 180;

type ScratchSurfaceOptions = {
  threshold?: number;
  onCommit: () => void;
};

export class ScratchSurface {
  private readonly context: CanvasRenderingContext2D;
  private readonly progress: ScratchProgressGrid;
  private readonly onCommit: () => void;
  private pointerId: number | null = null;
  private lastPoint: ScratchPoint | null = null;
  private gestureDistance = 0;
  private committed = false;
  private completionFrame: number | null = null;
  private completionGeneration = 0;

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.committed) return;
    this.pointerId = event.pointerId;
    this.lastPoint = this.pointFromEvent(event);
    this.gestureDistance = 0;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-scratching");
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.committed || this.pointerId !== event.pointerId || !this.lastPoint) return;
    const point = this.pointFromEvent(event);
    const distance = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y);
    if (distance < 0.001) return;
    this.gestureDistance += distance * this.canvas.clientWidth;
    for (const sample of interpolateScratchPoints(this.lastPoint, point)) {
      this.erase(sample);
      this.progress.sampleCircle(sample.x, sample.y, BRUSH_RADIUS);
    }
    this.lastPoint = point;
    this.tryCommit();
    event.preventDefault();
  };

  private readonly finishPointer = (event: PointerEvent) => {
    if (this.pointerId !== event.pointerId) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.pointerId = null;
    this.lastPoint = null;
    this.canvas.classList.remove("is-scratching");
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: ScratchSurfaceOptions,
  ) {
    this.context = canvas.getContext("2d")!;
    this.progress = new ScratchProgressGrid(10, 10, options.threshold ?? SCRATCH_REVEAL_THRESHOLD);
    this.onCommit = options.onCommit;
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
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.finishPointer);
    this.canvas.removeEventListener("pointercancel", this.finishPointer);
    this.canvas.removeEventListener("lostpointercapture", this.finishPointer);
  }

  reset() {
    this.cancelCompletion();
    this.pointerId = null;
    this.lastPoint = null;
    this.gestureDistance = 0;
    this.committed = false;
    this.progress.reset();
    this.context.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.paintCover();
  }

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private paintCover() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const gradient = this.context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(184, 145, 67, .98)");
    gradient.addColorStop(.5, "rgba(106, 74, 35, .98)");
    gradient.addColorStop(1, "rgba(53, 39, 31, .98)");
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, width, height);
    this.context.strokeStyle = "rgba(255, 234, 166, .18)";
    this.context.lineWidth = 1;
    for (let offset = -height; offset < width + height; offset += 12) {
      this.context.beginPath();
      this.context.moveTo(offset, 0);
      this.context.lineTo(offset + height, height);
      this.context.stroke();
    }
  }

  private pointFromEvent(event: PointerEvent): ScratchPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }

  private erase(point: ScratchPoint) {
    const radius = Math.max(8, this.canvas.clientWidth * BRUSH_RADIUS);
    this.context.save();
    this.context.globalCompositeOperation = "destination-out";
    this.context.beginPath();
    this.context.arc(point.x * this.canvas.clientWidth, point.y * this.canvas.clientHeight, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
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
    const startedAt = performance.now();
    const animate = (timestamp: number) => {
      if (generation !== this.completionGeneration) return;
      const progress = Math.min(1, (timestamp - startedAt) / SCRATCH_COMPLETION_DURATION_MS);
      this.context.save();
      this.context.globalCompositeOperation = "destination-out";
      this.context.globalAlpha = Math.min(1, 0.16 + progress * 0.84);
      this.context.fillStyle = "#000";
      this.context.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
      this.context.restore();
      if (progress >= 1) {
        this.completionFrame = null;
        this.onCommit();
        return;
      }
      this.completionFrame = window.requestAnimationFrame(animate);
    };
    this.completionFrame = window.requestAnimationFrame(animate);
  }
}