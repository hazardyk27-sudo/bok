export const SCRATCH_REVEAL_THRESHOLD = 0.62;
export const SCRATCH_GRID_COLUMNS = 10;
export const SCRATCH_GRID_ROWS = 10;

export type ScratchPoint = { x: number; y: number };
export type ScratchAbrasionConfig = {
  depthPerSample: number;
  revealDepth: number;
  brushRadius: number;
};

export const SCRATCH_ABRASION_CONFIG: Readonly<ScratchAbrasionConfig> = {
  depthPerSample: 0.13,
  revealDepth: 0.62,
  brushRadius: 0.16,
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function interpolateScratchPoints(from: ScratchPoint, to: ScratchPoint, spacing = 0.035): ScratchPoint[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.001, spacing)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  });
}

export class ScratchProgressGrid {
  private readonly sampled: Uint8Array;
  private readonly depths: Float32Array;
  private sampledCount = 0;

  constructor(
    readonly columns = SCRATCH_GRID_COLUMNS,
    readonly rows = SCRATCH_GRID_ROWS,
    readonly threshold = SCRATCH_REVEAL_THRESHOLD,
    readonly abrasion: ScratchAbrasionConfig = SCRATCH_ABRASION_CONFIG,
  ) {
    this.sampled = new Uint8Array(columns * rows);
    this.depths = new Float32Array(columns * rows);
  }

  get coverage() {
    return this.sampledCount / this.sampled.length;
  }

  get committed() {
    return this.coverage >= this.threshold;
  }

  reset() {
    this.sampled.fill(0);
    this.depths.fill(0);
    this.sampledCount = 0;
  }

  depthAt(x: number, y: number) {
    const column = Math.min(this.columns - 1, Math.max(0, Math.floor(clamp(x) * this.columns)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(clamp(y) * this.rows)));
    return this.depths[row * this.columns + column];
  }

  isRevealableAt(x: number, y: number) {
    return this.depthAt(x, y) >= this.abrasion.revealDepth;
  }

  sampleCircle(x: number, y: number, radius: number, depthGain = this.abrasion.depthPerSample) {
    const normalizedX = clamp(x);
    const normalizedY = clamp(y);
    const normalizedRadius = Math.max(0, radius);
    const cellWidth = 1 / this.columns;
    const cellHeight = 1 / this.rows;
    const cellRadius = Math.hypot(cellWidth, cellHeight) / 2;

    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const centerX = (column + 0.5) * cellWidth;
        const centerY = (row + 0.5) * cellHeight;
        if (Math.hypot(centerX - normalizedX, centerY - normalizedY) > normalizedRadius + cellRadius) continue;
        const index = row * this.columns + column;
        const wasRevealable = this.sampled[index] === 1;
        this.depths[index] = Math.min(1, this.depths[index] + Math.max(0, depthGain));
        if (!wasRevealable && this.depths[index] >= this.abrasion.revealDepth) {
          this.sampled[index] = 1;
          this.sampledCount += 1;
        }
      }
    }
    return this.coverage;
  }
}