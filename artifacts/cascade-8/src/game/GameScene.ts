import Phaser from "phaser";
import { BOARD_COLUMNS, BOARD_ROWS, NORMAL_SYMBOLS, getSymbolDefinition, type SymbolId } from "../config/GameConfig";
import type { Board, Cell } from "../engine/types";

type BoardNode = { container: Phaser.GameObjects.Container; symbol: SymbolId; row: number; col: number };

export class GameScene extends Phaser.Scene {
  private nodes: BoardNode[] = [];
  private frame?: Phaser.GameObjects.Graphics;
  private cellFrames: Phaser.GameObjects.Rectangle[] = [];
  private freeSpinMode = false;
  private boardOrigin = { x: 88, y: 76 };
  private cellSize = { width: 90, height: 88 };

  constructor() {
    super("Cascade8GameScene");
  }

  preload() {
    NORMAL_SYMBOLS.forEach((symbol) => {
      if (symbol.logoPath) this.load.image(`club-logo-${symbol.id}`, `${import.meta.env.BASE_URL}${symbol.logoPath}`);
    });
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
    frame.fillRoundedRect(70, 58, 580, 472, 28);
    frame.lineStyle(2, this.freeSpinMode ? 0xffd36a : 0x5e7cff, this.freeSpinMode ? 0.68 : 0.3);
    frame.strokeRoundedRect(70, 58, 580, 472, 28);
    frame.lineStyle(1, this.freeSpinMode ? 0xffe8a6 : 0x9baeff, this.freeSpinMode ? 0.28 : 0.13);
    frame.strokeRoundedRect(80, 68, 560, 452, 22);
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        const x = this.boardOrigin.x + col * this.cellSize.width;
        const y = this.boardOrigin.y + row * this.cellSize.height;
        const cell = this.add.rectangle(
          x + 44,
          y + 41,
          80,
          78,
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
    this.nodes.forEach((node) => node.container.destroy());
    this.nodes = [];
  }

  private createSymbolNode(symbol: SymbolId, row: number, col: number, crystal = false, winner = false) {
    const definition = getSymbolDefinition(symbol);
    const container = this.add.container(
      this.boardOrigin.x + col * this.cellSize.width + 44,
      this.boardOrigin.y + row * this.cellSize.height + 41,
    );
    const glow = this.add.circle(0, 2, 31, definition.color, winner ? 0.7 : 0.34);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const orb = this.add.circle(0, 0, 25, definition.color, winner ? 0.7 : 0.52);
    orb.setStrokeStyle(winner || symbol === "SCATTER" ? 2 : 1.5, definition.color, winner ? 1 : 0.72);
    const core = this.add.circle(0, 0, 22, 0x09142f, 0.5);
    const shine = this.add.ellipse(-9, -12, 13, 7, 0xffffff, 0.18).setAngle(-25);
    const mark = symbol === "SCATTER"
      ? this.add.text(0, 1, definition.icon, { color: definition.colorHex, fontFamily: "Georgia, serif", fontSize: "31px", fontStyle: "bold" }).setOrigin(0.5)
      : this.add.image(0, 0, `club-logo-${symbol}`).setDisplaySize(42, 42);
    container.add([glow, orb, core, mark, shine]);
    if (symbol === "SCATTER") {
      const ring = this.add.circle(0, 0, 34, undefined, 0).setStrokeStyle(1.5, definition.color, 0.72);
      container.add(ring);
      this.tweens.add({ targets: ring, scale: 1.14, alpha: 0.3, duration: 780, yoyo: true, repeat: -1 });
    }
    if (crystal) {
      container.add(this.add.text(0, -32, "✧", { color: "#f3d77a", fontSize: "16px" }).setOrigin(0.5));
    }
    const node = { container, symbol, row, col };
    this.nodes.push(node);
    return node;
  }

  renderBoard(board: Board, winningCells: Cell[] = [], crystalCells: Cell[] = []) {
    this.clearSymbols();
    const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
    const crystalSet = new Set(crystalCells.map((cell) => `${cell.row}:${cell.col}`));
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        this.createSymbolNode(
          board[row][col],
          row,
          col,
          crystalSet.has(`${row}:${col}`),
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
        onComplete: () => resolve(),
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
        onComplete: () => resolve(),
      });
    })));
  }

  async burstCells(cells: Cell[], duration: number) {
    const wanted = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
    const active = this.nodes.filter((node) => wanted.has(`${node.row}:${node.col}`));
    await Promise.all(active.map((node) => new Promise<void>((resolve) => {
      const color = getSymbolDefinition(node.symbol).color;
      const centerX = node.container.x;
      const centerY = node.container.y;
      const ring = this.add.circle(centerX, centerY, 25, undefined, 0)
        .setStrokeStyle(2, color, 0.9)
        .setDepth(3);
      this.tweens.add({
        targets: ring,
        scale: 2.15,
        alpha: 0,
        duration: duration + 80,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      });
      Array.from({ length: 12 }, (_, index) => {
        const particle = this.add.circle(centerX, centerY, index % 3 === 0 ? 4 : 2.5, color, 0.92).setDepth(3);
        const angle = (index / 12) * Math.PI * 2;
        const distance = 38 + (index % 4) * 15;
        this.tweens.add({
          targets: particle,
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          alpha: 0,
          scale: 0.15,
          duration: duration + 120,
          ease: "Cubic.easeOut",
          onComplete: () => particle.destroy(),
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
          node.container.destroy();
          resolve();
        },
      });
    })));
    this.nodes = this.nodes.filter((node) => !wanted.has(`${node.row}:${node.col}`));
  }

  async animateCascade(board: Board, winningCells: Cell[], duration: number) {
    const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
    const animations: Promise<void>[] = [];
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
      const survivors = this.nodes
        .filter((node) => node.col === col && !winning.has(`${node.row}:${node.col}`))
        .sort((a, b) => a.row - b.row);
      const generatedCount = BOARD_ROWS - survivors.length;
      survivors.forEach((node, index) => {
        const targetRow = generatedCount + index;
        const targetY = this.boardOrigin.y + targetRow * this.cellSize.height + 41;
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
        const targetY = this.boardOrigin.y + row * this.cellSize.height + 41;
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
      const spark = this.add.circle(360, 270, index % 3 === 0 ? 3 : 2, [0x73c9ff, 0xc69dff, 0xffd16e][index % 3], 0.9);
      const angle = (index / 18) * Math.PI * 2;
      this.tweens.add({
        targets: spark,
        x: 360 + Math.cos(angle) * (80 + (index % 4) * 22),
        y: 270 + Math.sin(angle) * (80 + (index % 4) * 22),
        alpha: 0,
        scale: 0.2,
        duration: 420 + (index % 4) * 35,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy(),
      });
      return spark;
    });
    this.time.delayedCall(650, () => sparks.forEach((spark) => { if (spark.active) spark.destroy(); }));
  }
}

export function createGameScene(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 720,
    height: 620,
    transparent: true,
    scene: [GameScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 720, height: 620 },
    render: { antialias: true, pixelArt: false, roundPixels: true },
    banner: false,
  });
}