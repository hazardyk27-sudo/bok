import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const betStateSource = readFileSync(
  new URL("./betState.ts", import.meta.url),
  "utf8",
);
const authorityVisualSource = readFileSync(
  new URL("./betAuthorityVisual.ts", import.meta.url),
  "utf8",
);
const walletSource = readFileSync(
  new URL("./rouletteWalletClient.ts", import.meta.url),
  "utf8",
);

describe("roulette wager authority architecture", () => {
  it("keeps wager topology and authority metadata in one store", () => {
    expect(betStateSource).not.toContain(
      "let authoritativePlacements",
    );
    expect(authorityVisualSource).not.toContain(
      "let authorityRoundId",
    );
    expect(authorityVisualSource).not.toContain(
      "let authorityRevision",
    );
    expect(authorityVisualSource).not.toContain(
      "let authorityOptimistic",
    );
    expect(betStateSource).toContain(
      "getRouletteAuthorityStoreBets",
    );
    expect(authorityVisualSource).toContain(
      "getRouletteAuthorityStoreSnapshot",
    );
  });

  it("does not keep retired drag compatibility state in reducers or wallet client", () => {
    expect(betStateSource).not.toContain(
      "AuthoritativeDragPlacements",
    );
    expect(walletSource).not.toContain(
      "RouletteBetMoveGuard",
    );
    expect(walletSource).not.toContain(
      "deriveRouletteBetMoveGuard",
    );
    expect(walletSource).not.toContain(
      "applyRouletteBetMoveGuard",
    );
  });
});
