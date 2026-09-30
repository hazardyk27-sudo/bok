import { createServer } from "node:http";
import { pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { attachBlackjackPlatformRuntime } from "./platform/blackjack";
import { initializeSharedWalletPlatform } from "./platform/wallet";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
let blackjackRuntime: Awaited<
  ReturnType<typeof attachBlackjackPlatformRuntime>
> | null = null;
let shuttingDown = false;

server.listen(port, () => {
  logger.info(
    {
      port,
      blackjack: "STARTING",
      walletInitialization: "STARTING",
    },
    "Server listening",
  );
});

// Shared-wallet migration/repair is startup maintenance, not a prerequisite for
// opening the HTTP socket. Running it after listen prevents a slow/stale
// initializer from taking every online game offline at once.
void initializeSharedWalletPlatform()
  .then((walletInitialization) => {
    const migratedWalletCount =
      walletInitialization.legacyImportedCount
      + walletInitialization.legacyRepairedDefaultCount
      + walletInitialization.ledgerRecoveredCount;

    if (walletInitialization.skippedBecauseAnotherInitializer) {
      logger.warn(
        walletInitialization,
        "Shared wallet initialization skipped because another initializer owns the lock",
      );
      return;
    }

    if (
      migratedWalletCount > 0
      || walletInitialization.legacyPreservedCount > 0
    ) {
      logger.warn(
        walletInitialization,
        "Initialized canonical shared wallets and retired legacy wallet authority",
      );
    }
  })
  .catch((error) => {
    logger.error(
      { err: error },
      "Shared wallet startup maintenance failed; HTTP API remains available",
    );
  });

// Blackjack is an optional realtime subsystem from the HTTP API's point of
// view. Its durable recovery must never prevent health, wallet, Idle or
// Roulette HTTP routes from accepting connections. The browser client already
// reconnects until the realtime transport becomes ready.
void attachBlackjackPlatformRuntime(server)
  .then((runtime) => {
    if (shuttingDown) {
      runtime.close();
      return;
    }

    blackjackRuntime = runtime;
    logger.info(
      {
        blackjack: runtime.getReadiness(),
      },
      "Blackjack runtime attached",
    );
  })
  .catch((error) => {
    logger.error(
      { err: error },
      "Blackjack runtime failed to attach; HTTP API remains available",
    );
  });

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  blackjackRuntime?.close();
  server.close();

  void pool.end().catch((error) => {
    logger.error(
      { err: error },
      "Failed to close database pool during API shutdown",
    );
  });
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
