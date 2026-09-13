import Phaser from "phaser";
import { BOARD_COLUMNS, BOARD_ROWS, getSymbolDefinition, type SymbolId } from "../config/GameConfig";
import type { Board, Cell } from "../engine/types";

type BoardNode = { container: Phaser.GameObjects.Container; symbol: SymbolId; row: number; col: number };

export class GameScene extends Phaser.Scene {
  private nodes: BoardNode[] = [];
  private boardOrigin = { x: 88, y: 76 };
  private cellSize = { width: 90, height: 88 };

  constructor() {
    super("Cascade8GameScene");
  }

  create() {
    this.drawBoardFrame();
  }

  private drawBoardFrame() {
    const frame = this.add.graphics();
    frame.fillStyle(0x0b1530, 0.76);
    frame.fillRoundedRect(70, 58, 580, 472, 28);
    frame.lineStyle(2, 0x5e7cff, 0.3);
    frame.strokeRoundedRect(70, 58, 580, 472, 28);
    frame.lineStyle(1, 0x9baeff, 0.13);
    frame.strokeRoundedRect(80, 68, 560, 452, 22);
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        const x = this.boardOrigin.x + col * this.cellSize.width;
        const y = this.boardOrigin.y + row * this.cellSize.height;
        const cell = this.add.rectangle(x + 44, y + 41, 80, 78, 0x16264d, 0.45);
        cell.setStrokeStyle(1, 0x8b9de3, 0.1);
      }
    }
  }

  clearSymbols() {
    this.nodes.forEach((node) => node.container.destroy());
    this.nodes = [];
  }

  renderBoard(board: Board, winningCells: Cell[] = [], crystalCells: Cell[] = []) {
    this.clearSymbols();
    const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
    const crystalSet = new Set(crystalCells.map((cell) => `${cell.row}:${cell.col}`));
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLUMNS; col += 1) {
        const symbol = board[row][col];
        const definition = getSymbolDefinition(symbol);
        const container = this.add.container(
          this.boardOrigin.x + col * this.cellSize.width + 44,
          this.boardOrigin.y + row * this.cellSize.height + 41,
        );
        const isWinner = winning.has(`${row}:${col}`);
        const isCrystal = crystalSet.has(`${row}:${col}`);
        const glow = this.add.circle(0, 2, 31, definition.color, isWinner ? 0.27 : 0.1);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        const orb = this.add.circle(0, 0, 25, 0x09142f, 0.94);
        orb.setStrokeStyle(isWinner || symbol === "SCATTER" ? 2 : 1, definition.color, isWinner ? 0.9 : 0.3);
        const shine = this.add.ellipse(-9, -12, 13, 7, 0xffffff, 0.18).setAngle(-25);
        const text = this.add.text(0, 1, definition.icon, {
          color: definition.colorHex,
          fontFamily: "Georgia, serif",
          fontSize: symbol === "SCATTER" ? "31px" : "29px",
          fontStyle: "bold",
        }).setOrigin(0.5);
        container.add([glow, orb, shine, text]);
        if (symbol === "SCATTER") {
          const ring = this.add.circle(0, 0, 34, undefined, 0).setStrokeStyle(1.5, definition.color, 0.72);
          container.add(ring);
          this.tweens.add({ targets: ring, scale: 1.14, alpha: 0.3, duration: 780, yoyo: true, repeat: -1 });
        }
        if (isCrystal) {
          const badge = this.add.text(0, -32, "✧", { color: "#f3d77a", fontSize: "16px" }).setOrigin(0.5);
          container.add(badge);
        }
        this.nodes.push({ container, symbol, row, col });
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