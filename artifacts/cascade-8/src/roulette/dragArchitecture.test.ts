import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(
  new URL("./index.ts", import.meta.url),
  "utf8",
);

const obsoleteDragFiles = [
  "chipDrag.ts",
  "chipDragV2.ts",
  "chipDragCanonicalState.ts",
  "chipDragCommitBridge.ts",
  "chipDragHandoff.ts",
  "chipDragLatestWriter.ts",
] as const;

describe("roulette drag architecture", () => {
  it("wires only the current V6 drag controller", () => {
    expect(indexSource).toContain(
      'from "./chipDragV6"',
    );
    expect(indexSource).not.toContain(
      'from "./chipDragV2"',
    );
    expect(indexSource).not.toContain(
      "chipDragLatestWriter",
    );
    expect(indexSource).not.toContain(
      "chipDragCommitBridge",
    );
  });

  it("does not keep retired drag state/writer implementations beside V6", () => {
    obsoleteDragFiles.forEach((file) => {
      expect(
        existsSync(new URL(`./${file}`, import.meta.url)),
      ).toBe(false);
    });
  });
});
