import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    "utf8",
  );
}

const indexSource = source("./index.ts");
const dragSource = source("./chipDragV6.ts");
const authorityVisualSource = source("./betAuthorityVisual.ts");
const authoritySource = source("./betAuthority.ts");

describe("roulette performance architecture guard", () => {
  it("keeps retired competing writer and global DOM interception layers out of the mount path", () => {
    expect(indexSource).not.toContain("installRouletteChipDragLatestWriter");
    expect(indexSource).not.toContain("installRouletteIncrementalPlacedChipReuse");
    expect(indexSource).not.toContain("installRouletteOptimisticBalanceUi");
    expect(indexSource).not.toContain("installRouletteBetAuthorityVisual");
  });

  it("keeps drag input-only without its old polling, retry, or DOM-protector loops", () => {
    expect(dragSource).not.toContain("MutationObserver");
    expect(dragSource).not.toContain("setInterval(");
    expect(dragSource).not.toContain("SOURCE_SYNC_ATTEMPTS");
    expect(dragSource).not.toContain("bootstrapRoulette");
    expect(dragSource).not.toContain("flushPendingRemovals");
  });

  it("keeps authority metadata free of DOM rendering and serializes all wager writes", () => {
    expect(authorityVisualSource).not.toContain("MutationObserver");
    expect(authorityVisualSource).not.toContain("querySelector");
    expect(authoritySource).toContain("writeTail");
    expect(authoritySource).toContain("enqueueWrite");
    expect(authoritySource).toContain("authority.optimistic");
  });
});
