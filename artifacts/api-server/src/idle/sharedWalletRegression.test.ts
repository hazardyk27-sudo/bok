import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(
      new URL(relativePath, import.meta.url),
    ),
    "utf8",
  );
}

const idleRoutes = source("./routes.ts");
const platformWallet = source("../platform/wallet.ts");
const walletSources = [
  source("./stadiumState.ts"),
  source("./seatPurchase.ts"),
  source("./stadiumUpgrade.ts"),
  source("./speedUpgrade.ts"),
  source("./storageUpgrade.ts"),
  source("./ticketSale.ts"),
];

describe("Idle shared wallet/session compatibility", () => {
  it("does not depend on another game's route module for session identity", () => {
    expect(idleRoutes).not.toContain(
      '../roulette/routes',
    );
    expect(idleRoutes).toContain(
      'String(SHARED_WALLET_TABLE) === "shared_wallets"',
    );
    expect(idleRoutes).toContain('"game_session"');
    expect(idleRoutes).toContain('"roulette_session"');
    expect(idleRoutes).toContain('path: "/"');
  });

  it("resolves registered accounts and duplicate game-session cookies canonically", () => {
    expect(idleRoutes).toContain('const AUTH_COOKIE = "fy_auth"');
    expect(idleRoutes).toContain("resolveAuthenticatedWalletSessionId");
    expect(idleRoutes).toContain("readRawCookieValues");
    expect(idleRoutes).toContain("auth_sessions");
    expect(idleRoutes).toContain("wallet_session_id");
    expect(idleRoutes).toContain("createHash(\"sha256\")");
    expect(idleRoutes).toContain("balance_cents");
    expect(
      idleRoutes.indexOf("await resolveCookieSessionId(req)")
    ).toBeLessThan(
      idleRoutes.indexOf("await resolveAuthenticatedWalletSessionId(req)")
    );
    expect(idleRoutes).toContain("await getSessionId(req, res)");
  });

  it("uses the shared platform wallet table authority everywhere", () => {
    expect(platformWallet).toContain(
      "SHARED_WALLET_TABLE",
    );
    expect(platformWallet).toContain(
      "INITIAL_SHARED_BALANCE_CENTS",
    );

    for (const walletSource of walletSources) {
      expect(walletSource).toContain(
        "SHARED_WALLET_TABLE",
      );
      expect(walletSource).not.toContain(
        "roulette_wallets",
      );
    }
  });

  it("locks the wallet before every debit or credit", () => {
    for (const walletSource of walletSources.slice(1)) {
      expect(walletSource).toContain("FOR UPDATE");
    }

    for (const mutationSource of walletSources.slice(1)) {
      expect(mutationSource).toContain(
        "UPDATE ${SHARED_WALLET_TABLE}",
      );
    }
  });

  it("keeps the common platform initial wallet value as Idle's fallback", () => {
    for (const walletSource of walletSources) {
      expect(walletSource).toContain(
        "INITIAL_SHARED_BALANCE_CENTS",
      );
      expect(walletSource).not.toContain(
        "INITIAL_ROULETTE_BALANCE_CENTS",
      );
    }
  });
});
