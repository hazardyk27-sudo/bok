import Phaser from "phaser";
import { BOARD_COLUMNS, BOARD_ROWS, NORMAL_SYMBOLS, getSymbolDefinition, type SymbolId } from "../config/GameConfig";
import { isMultiplierCore, type Board, type BoardCell, type Cell } from "../engine/types";

type BoardNode = {
  container: Phaser.GameObjects.Container;
  symbol: BoardCell;
  row: number;
  col: number;
};

const SCATTER_SYMBOL_SIZE = 100;
const SCATTER_SOURCE_SIZE = 256;
const CORE_BASE_SIZE = 84;
const SMALL_CORE_SIZE = 80;
const LARGE_CORE_SIZE = 100;

export class GameScene extends Phaser.Scene {
  private nodes: BoardNode[] = [];

  private transientEffects: Phaser.GameObjects.GameObject[] = [];

  private frame?: Phaser.GameObjects.Graphics;

  private cellFrames: Phaser.GameObjects.Rectangle[] = [];

  private freeSpinMode = false;

  private boardOrigin = { x: 22, y: 30 };

  private cellSize = { width: 96, height: 92 };

  constructor() {
    super("Cascade8GameScene");
  }

  preload() {
    NORMAL_SYMBOLS.forEach((symbol) => {
      if (symbol.logoPath) this.load.image(`club-logo-${symbol.id}`, `${import.meta.env.BASE_URL}${symbol.logoPath}`);
    });
    this.load.image("scatter-symbol", `${import.meta.env.BASE_URL}special-symbols/scatter.png`);
    this.load.image("core-2x", `${import.meta.env.BASE_URL}special-symbols/2x.png`);
    this.load.image("core-3x", `${import.meta.env.BASE_URL}special-symbols/3x.png`);
    this.load.image("core-5x", `${import.meta.env.BASE_URL}special-symbols/5x.png`);
    this.load.image("core-10x", `${import.meta.env.BASE_URL}special-symbols/10x.png`);
  }

  create() {
    this.drawBoardFrame();
  }

  private drawBoardFrame() {
    this.frame?.destroy();
    this.cellFrames.forEach((cell) => cell.destroy());
    this.cellFrames = [];
    const frame = this.add.graphics();
    frame.setDepth(-10);
    frame.fillStyle(this.freeSpinMode ? 0x33230b : 0x0b1530, 0.76);
    frame.fillRoundedRect(10, 18, 600, 484, 24);
    frame.lineStyle(2, this.freeSpinMode ? 0xffd36a : 0x5e7cff, this.freeSpinMode ? 0.68 : 0.3);
    frame.strokeRoundedRect(10, 18, 600, 484, 24);
    frame.lineStyle(1, this.freeSpinMode ? 0xffe8a6 : 0x9baeff, this.freeSpinMode ? 0.28 : 0.13);
    frame.strokeRoundedRect(18, 26, 584, 468, 18);
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        const x = this.boardOrigin.x + col * this.cellSize.width;
        const y = this.boardOrigin.y + row * this.cellSize.height;
        const cell = this.add.rectangle(
          x + 48,
          y + 46,
          88,
          84,
          this.freeSpinMode ? 0x5b3b0d : 0x16264d,
          this.freeSpinMode ? 0.52 : 0.45,
        ).setDepth(-9);
        cell.setStrokeStyle(1, this.freeSpinMode ? 0xffd36a : 0x8b9de3, this.freeSpinMode ? 0.25 : 0.1);
        this.cellFrames.push(cell);
      }
    }
    this.frame = frame;
  }

  setFreeSpinMode(enabled: boolean) {
    this.freeSpinMode = enabled;
    this.drawBoardFrame();
  }

  clearSymbols() {
    this.clearTransientEffects();
    this.nodes.forEach((node) => this.destroyNode(node));
    this.nodes = [];
  }

  private trackEffect<T extends Phaser.GameObjects.GameObject>(effect: T) {
    this.transientEffects.push(effect);
    return effect;
  }

  private releaseEffect(effect: Phaser.GameObjects.GameObject) {
    const index = this.transientEffects.indexOf(effect);
    if (index >= 0) this.transientEffects.splice(index, 1);
  }

  private destroyEffect(effect: Phaser.GameObjects.GameObject) {
    this.tweens.killTweensOf(effect);
    this.releaseEffect(effect);
    if (effect.active) effect.destroy();
  }

  private clearTransientEffects() {
    if (!this.transientEffects.length) return;
    this.tweens.killTweensOf(this.transientEffects);
    this.transientEffects.forEach((effect) => {
      if (effect.active) effect.destroy();
    });
    this.transientEffects = [];
  }

  private destroyNode(node: BoardNode) {
    const targets = [node.container, ...node.container.list];
    this.tweens.killTweensOf(targets);
    node.container.destroy();
  }

  getDebugMetrics() {
    return {
      activeNodes: this.nodes.length,
      boardCells: BOARD_COLUMNS * BOARD_ROWS,
      fps: Math.round(this.game.loop.actualFps || 0),
      renderer: this.game.renderer.type === Phaser.WEBGL ? "WEBGL" : "CANVAS",
    };
  }

  private createSymbolNode(symbol: BoardCell, row: number, col: number, winner = false) {
    const container = this.add.container(
      this.boardOrigin.x + col * this.cellSize.width + 48,
      this.boardOrigin.y + row * this.cellSize.height + 46,
    );
    if (isMultiplierCore(symbol)) {
      const coreSize = symbol.value >= 10 ? LARGE_CORE_SIZE : SMALL_CORE_SIZE;
      const coreScale = coreSize / CORE_BASE_SIZE;
      const glow = this.add.circle(0, 0, 43, 0xffb52e, 0.2).setBlendMode(Phaser.BlendModes.ADD);
      const radiance = this.add.graphics();
      radiance.lineStyle(2, 0xffdb6b, 0.62);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        radiance.lineBetween(Math.cos(angle) * 27, Math.sin(angle) * 27, Math.cos(angle) * 38, Math.sin(angle) * 38);
      }
      if (symbol.value === 2 || symbol.value === 3 || symbol.value === 5 || symbol.value === 10) {
        const portrait = this.add.image(0, 0, `core-${symbol.value}x`).setDisplaySize(84, 84);
        container.add([glow, radiance, portrait]);
        container.setScale(coreScale);
        this.tweens.add({ targets: glow, scale: 1.18, alpha: 0.12, duration: 680, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: radiance, angle: 360, duration: 4200, repeat: -1 });
        const node = { container, symbol, row, col };
        this.nodes.push(node);
        return node;
      }
      const core = this.add.polygon(0, 0, [0, -32, 25, -14, 25, 14, 0, 32, -25, 14, -25, -14], 0x8f5a0c, 0.72);
      const inner = this.add.polygon(0, 0, [0, -24, 18, -10, 18, 10, 0, 24, -18, 10, -18, -10], 0xffbe35, 0.72);
      const label = this.add.text(0, 1, `${symbol.value}x`, {
        color: "#fff4c7",
        fontFamily: "Arial, sans-serif",
        fontSize: symbol.value >= 100 ? "15px" : "19px",
        fontStyle: "bold",
        stroke: "#5d3200",
        strokeThickness: 4,
      }).setOrigin(0.5);
      const bolt = this.add.text(0, -39, "✦", { color: "#fff3ba", fontSize: "18px" }).setOrigin(0.5);
      container.add([glow, radiance, core, inner, label, bolt]);
      container.setScale(coreScale);
      this.tweens.add({ targets: glow, scale: 1.18, alpha: 0.12, duration: 680, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: radiance, angle: 360, duration: 4200, repeat: -1 });
      const node = { container, symbol, row, col };
      this.nodes.push(node);
      return node;
    }
    if (symbol === "SCATTER") {
      const aura = this.add.ellipse(0, 1, 70, 78, 0xffbb3c, 0.08).setBlendMode(Phaser.BlendModes.ADD);
      const warmBloom = this.add.ellipse(0, 4, 48, 60, 0xffe29a, 0.08).setBlendMode(Phaser.BlendModes.ADD);
      const scatterArt = this.add.image(0, 0, "scatter-symbol")
        .setScale(SCATTER_SYMBOL_SIZE / SCATTER_SOURCE_SIZE);
      const glint = this.add.text(18, -31, "✦", { color: "#fff4bf", fontSize: "11px" }).setOrigin(0.5);
      container.add([aura, warmBloom, scatterArt, glint]);
      this.tweens.add({ targets: aura, scale: 1.12, alpha: 0.14, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: warmBloom, scale: 1.16, alpha: 0.16, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.tweens.add({
        targets: scatterArt,
        x: 2,
        y: -1,
        duration: 90,
        yoyo: true,
        repeat: -1,
        repeatDelay: 1800,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({ targets: glint, alpha: 0.18, scale: 0.6, duration: 260, yoyo: true, repeat: -1, repeatDelay: 2600 });
      const node = { container, symbol, row, col };
      this.nodes.push(node);
      return node;
    }
    const definition = getSymbolDefinition(symbol);
    const frameColor = definition.frameColor;
    const glow = this.add.circle(0, 2, 39, definition.color, winner ? 0.78 : 0.42);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const orb = this.add.circle(0, 0, 31, definition.color, winner ? 0.82 : 0.64);
    orb.setStrokeStyle(winner ? 3.5 : 3, frameColor, winner ? 1 : 0.96);
    const innerFrame = this.add.circle(0, 0, 27, undefined, 0)
      .setStrokeStyle(1.5, definition.color, winner ? 0.95 : 0.82);
    const core = this.add.circle(0, 0, 26, 0x09142f, 0.56);
    const shine = this.add.ellipse(-9, -12, 13, 7, 0xffffff, 0.18).setAngle(-25);
    const mark = this.add.image(0, 0, `club-logo-${symbol}`).setDisplaySize(60, 60);
    container.add([glow, orb, innerFrame, core, mark, shine]);
    const node = { container, symbol, row, col };
    this.nodes.push(node);
    return node;
  }

  private createTrophy() {
    const trophy = this.add.graphics();
    trophy.fillStyle(0x633507, 0.9);
    trophy.fillRoundedRect(-18, -34, 36, 35, 8);
    trophy.fillRoundedRect(-28, -29, 10, 24, 5);
    trophy.fillRoundedRect(18, -29, 10, 24, 5);
    trophy.fillStyle(0xb66c0e, 1);
    trophy.fillRoundedRect(-15, -36, 30, 34, 7);
    trophy.fillRoundedRect(-24, -27, 8, 21, 4);
    trophy.fillRoundedRect(16, -27, 8, 21, 4);
    trophy.fillStyle(0xf0b52c, 1);
    trophy.fillRoundedRect(-11, -32, 22, 28, 5);
    trophy.fillStyle(0xffe59a, 0.92);
    trophy.fillRoundedRect(-7, -30, 6, 20, 3);
    trophy.fillStyle(0xd18916, 1);
    trophy.fillRect(-7, -1, 14, 22);
    trophy.fillStyle(0xffd45a, 1);
    trophy.fillRect(-5, 0, 6, 20);
    trophy.fillStyle(0x8a4d08, 1);
    trophy.fillRoundedRect(-23, 20, 46, 9, 3);
    trophy.fillStyle(0xf7c64d, 1);
    trophy.fillRoundedRect(-19, 19, 38, 6, 2);
    trophy.fillStyle(0xffffd7, 0.95);
    trophy.fillTriangle(0, -22, -4, -14, 4, -14);
    trophy.fillStyle(0xfff2b0, 0.85);
    trophy.fillCircle(0, -17, 2);
    return trophy;
  }

  private animateScatterLanding(node: BoardNode) {
    const centerX = node.container.x;
    const centerY = node.container.y + 34;
    const shockwave = this.trackEffect(this.add.ellipse(centerX, centerY, 28, 9, undefined, 0)
      .setStrokeStyle(2, 0xffd56a, 0.9)
      .setDepth(4));
    const sparks = Array.from({ length: 5 }, (_, index) => {
      const spark = this.trackEffect(this.add.text(centerX, centerY, "✦", { color: "#ffe49a", fontSize: index % 2 ? "9px" : "12px" })
        .setOrigin(0.5)
        .setDepth(4));
      const angle = (index / 5) * Math.PI * 2;
      this.tweens.add({
        targets: spark,
        x: centerX + Math.cos(angle) * (22 + index * 5),
        y: centerY + Math.sin(angle) * (12 + index * 4),
        alpha: 0,
        scale: 0.5,
        duration: 260,
        ease: "Cubic.easeOut",
          onComplete: () => this.destroyEffect(spark),
      });
      return spark;
    });
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: shockwave,
        scaleX: 2.6,
        scaleY: 1.8,
        alpha: 0,
        duration: 300,
        ease: "Cubic.easeOut",
          onComplete: () => {
          this.destroyEffect(shockwave);
          sparks.forEach((spark) => this.destroyEffect(spark));
          resolve();
        },
      });
    });
  }

  renderBoard(board: Board, winningCells: Cell[] = []) {
    this.clearSymbols();
    const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        this.createSymbolNode(
          board[row][col],
          row,
          col,
          winning.has(`${row}:${col}`),
        );
      }
    }
  }

  async animateDrop(duration: number) {
    await Promise.all(this.nodes.map((node, index) => new Promise<void>((resolve) => {
      const finalY = node.container.y;
      node.container.y = finalY - 260 - (index % BOARD_COLUMNS) * 18;
      node.container.alpha = 0.2;
      this.tweens.add({
        targets: node.container,
        y: finalY,
        alpha: 1,
        duration: duration + (index % BOARD_COLUMNS) * 24,
        delay: (index % BOARD_COLUMNS) * 20,
        ease: "Back.easeOut",
         onComplete: () => {
           if (node.symbol === "SCATTER") void this.animateScatterLanding(node).then(resolve);
           else resolve();
         },
      });
    })));
  }

  async highlightCells(cells: Cell[], duration: number) {
    const wanted = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
    const active = this.nodes.filter((node) => wanted.has(`${node.row}:${node.col}`));
    await Promise.all(active.map((node) => new Promise<void>((resolve) => {
      this.tweens.add({
        targets: node.container,
        scale: 1.14,
        duration: duration / 2,
        yoyo: true,
        ease: "Sine.easeInOut",
             onComplete: () => {
               if (node.symbol === "SCATTER") void this.animateScatterLanding(node).then(resolve);
               else resolve();
             },
      });
    })));
  }

  async activateMultiplierCores(values: number[], duration = 360) {
    const active = this.nodes.filter((node) => isMultiplierCore(node.symbol) && values.includes(node.symbol.value));
    await Promise.all(active.map((node) => new Promise<void>((resolve) => {
      this.tweens.add({
        targets: node.container,
        scale: 1.24,
        angle: 8,
        duration,
        yoyo: true,
        ease: "Back.easeOut",
        onComplete: () => resolve(),
      });
    })));
  }

  async dissolveMultiplierCore(value: number, duration = 260) {
    const node = this.nodes.find((candidate) => isMultiplierCore(candidate.symbol) && candidate.symbol.value === value);
    if (!node) return;
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: node.container,
        scale: node.container.scale * 1.42,
        alpha: 0,
        angle: node.container.angle + 12,
        duration,
        ease: "Cubic.easeOut",
        onComplete: () => {
          this.destroyNode(node);
          this.nodes = this.nodes.filter((candidate) => candidate !== node);
          resolve();
        },
      });
    });
  }

  async burstCells(cells: Cell[], duration: number) {
    const wanted = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
    const active = this.nodes.filter((node) => wanted.has(`${node.row}:${node.col}`));
    await Promise.all(active.map((node) => new Promise<void>((resolve) => {
      const color = isMultiplierCore(node.symbol) ? 0xffc34d : getSymbolDefinition(node.symbol).color;
      const centerX = node.container.x;
      const centerY = node.container.y;
      const ring = this.trackEffect(this.add.circle(centerX, centerY, 25, undefined, 0)
        .setStrokeStyle(2, color, 0.9)
        .setDepth(3));
      this.tweens.add({
        targets: ring,
        scale: 2.15,
        alpha: 0,
        duration: duration + 80,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyEffect(ring),
      });
      const particleCount = Math.min(8, Math.max(3, Math.floor(96 / Math.max(active.length, 1))));
      Array.from({ length: particleCount }, (_, index) => {
        const particle = this.trackEffect(this.add.circle(centerX, centerY, index % 3 === 0 ? 4 : 2.5, color, 0.92).setDepth(3));
        const angle = (index / particleCount) * Math.PI * 2;
        const distance = 38 + (index % 4) * 15;
        this.tweens.add({
          targets: particle,
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          alpha: 0,
          scale: 0.15,
          duration: duration + 120,
          ease: "Cubic.easeOut",
          onComplete: () => this.destroyEffect(particle),
        });
        return particle;
      });
      this.tweens.add({
        targets: node.container,
        scale: 1.6,
        alpha: 0,
        duration,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.destroyNode(node);
          resolve();
        },
      });
    })));
    this.nodes = this.nodes.filter((node) => !wanted.has(`${node.row}:${node.col}`));
  }

  async animateCascade(board: Board, removedCells: Cell[], duration: number) {
    const winning = new Set(removedCells.map((cell) => `${cell.row}:${cell.col}`));
    const animations: Promise<void>[] = [];
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
      const survivors = this.nodes
        .filter((node) => node.col === col && !winning.has(`${node.row}:${node.col}`))
        .sort((a, b) => a.row - b.row);
      const generatedCount = BOARD_ROWS - survivors.length;
      survivors.forEach((node, index) => {
        const targetRow = generatedCount + index;
        const targetY = this.boardOrigin.y + targetRow * this.cellSize.height + 46;
        node.row = targetRow;
        animations.push(new Promise<void>((resolve) => {
          this.tweens.add({
            targets: node.container,
            y: targetY,
            duration: duration + col * 18,
            ease: "Cubic.easeInOut",
            onComplete: () => resolve(),
          });
        }));
      });
      for (let row = 0; row < generatedCount; row += 1) {
        const node = this.createSymbolNode(board[row][col], row, col);
        const targetY = this.boardOrigin.y + row * this.cellSize.height + 46;
        node.container.y = targetY - 260 - col * 14;
        node.container.alpha = 0.2;
        animations.push(new Promise<void>((resolve) => {
          this.tweens.add({
            targets: node.container,
            y: targetY,
            alpha: 1,
            duration: duration + col * 18,
            delay: col * 20,
            ease: "Back.easeOut",
            onComplete: () => resolve(),
          });
        }));
      }
    }
    await Promise.all(animations);
  }

  sparkle() {
    const sparks = Array.from({ length: 18 }, (_, index) => {
      const spark = this.trackEffect(this.add.circle(310, 260, index % 3 === 0 ? 3 : 2, [0x73c9ff, 0xc69dff, 0xffd16e][index % 3], 0.9));
      const angle = (index / 18) * Math.PI * 2;
      this.tweens.add({
        targets: spark,
        x: 310 + Math.cos(angle) * (80 + (index % 4) * 22),
        y: 260 + Math.sin(angle) * (80 + (index % 4) * 22),
        alpha: 0,
        scale: 0.2,
        duration: 420 + (index % 4) * 35,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyEffect(spark),
      });
      return spark;
    });
    this.time.delayedCall(650, () => sparks.forEach((spark) => this.destroyEffect(spark)));
  }

  async presentBonusTriggerCeremony(scatterCells: Cell[], count: number) {
    const wanted = new Set(scatterCells.map((cell) => `${cell.row}:${cell.col}`));
    const selected = this.nodes.filter((node) => node.symbol === "SCATTER" && wanted.has(`${node.row}:${node.col}`));
    if (!selected.length) return;

    const visibleCount = Math.min(count, selected.length);
    const rowGap = visibleCount >= 6 ? 66 : visibleCount === 5 ? 76 : 88;
    const rowScale = visibleCount >= 6 ? 0.68 : visibleCount === 5 ? 0.78 : 0.88;
    const centerX = 310;
    const centerY = 258;
    const nonSelected = this.nodes.filter((node) => !selected.includes(node));

    await Promise.all([
      ...nonSelected.map((node) => new Promise<void>((resolve) => {
        this.tweens.add({
          targets: node.container,
          alpha: 0.2,
          duration: 180,
          ease: "Quad.easeOut",
          onComplete: () => resolve(),
        });
      })),
      ...selected.map((node, index) => new Promise<void>((resolve) => {
        const targetX = centerX + (index - (visibleCount - 1) / 2) * rowGap;
        const targetY = centerY;
        const halo = this.trackEffect(this.add.circle(node.container.x, node.container.y, 46, 0xffc94f, 0.14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(2));
        this.tweens.add({
          targets: halo,
          x: targetX,
          y: targetY,
          scale: 1.18,
          alpha: 0.28,
          duration: 560,
          ease: "Cubic.easeInOut",
          onComplete: () => {
            this.tweens.add({
              targets: halo,
              alpha: 0,
              scale: 1.48,
              duration: 240,
              ease: "Cubic.easeOut",
              onComplete: () => this.destroyEffect(halo),
            });
          },
        });
        this.tweens.add({
          targets: node.container,
          x: targetX,
          y: targetY,
          scale: rowScale,
          angle: index % 2 ? 2 : -2,
          depth: 7,
          duration: 560 + index * 22,
          delay: index * 42,
          ease: "Back.easeOut",
          onComplete: () => resolve(),
        });
      })),
    ]);
    await new Promise<void>((resolve) => this.time.delayedCall(260, () => resolve()));
  }

  bonusUnlockFlash() {
    const flash = this.trackEffect(this.add.circle(310, 258, 46, 0xffe7a1, 0.48)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(8));
    const ring = this.trackEffect(this.add.circle(310, 258, 58, undefined, 0)
      .setStrokeStyle(3, 0xffd064, 0.95)
      .setDepth(8));
    this.tweens.add({
      targets: flash,
      scale: 3.4,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => this.destroyEffect(flash),
    });
    this.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => this.destroyEffect(ring),
    });
    this.sparkle();
  }

  async collectMultiplierCore(value: number, occurrence = 0, duration = 230) {
    const matching = this.nodes.filter((node) => isMultiplierCore(node.symbol) && node.symbol.value === value);
    const node = matching[occurrence];
    if (!node) return;
    const halo = this.trackEffect(this.add.circle(node.container.x, node.container.y, 34, 0xffd36a, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4));
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: [node.container, halo],
        scale: 1.22,
        duration: Math.max(70, duration * 0.45),
        ease: "Back.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: [node.container, halo],
            alpha: 0,
            scale: 1.55,
            duration: Math.max(70, duration * 0.55),
            ease: "Cubic.easeIn",
            onComplete: () => {
              this.destroyNode(node);
              this.destroyEffect(halo);
              resolve();
            },
          });
        },
      });
    });
    this.nodes = this.nodes.filter((candidate) => candidate !== node);
  }
}

export function createGameScene(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 620,
    height: 520,
    transparent: true,
    scene: [GameScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 620, height: 520 },
    render: { antialias: true, pixelArt: false, roundPixels: true },
    banner: false,
  });
}
