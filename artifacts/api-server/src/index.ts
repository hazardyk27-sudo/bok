import { createServer } from "node:http";
import {
  assertDatabaseCutoverReady,
  databaseRuntimeConfig,
  pool,
} from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
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

const databaseReadiness = await assertDatabaseCutoverReady();

logger.info(
  {
    databaseTarget: databaseReadiness.target,
    databaseHost: databaseReadiness.hostname,
    migrationReceipt: databaseReadiness.receipt
      ? {
          verifiedAt: databaseReadiness.receipt.verifiedAt,
          sourceTableCount: databaseReadiness.receipt.sourceTableCount,
          sourceTotalRows: databaseReadiness.receipt.sourceTotalRows,
          sourceManifestSha256:
            databaseReadiness.receipt.sourceManifestSha256,
        }
      : null,
  },
  "Database runtime target verified",
);

const server = createServer(app);
let shuttingDown = false;

server.listen(port, () => {
  logger.info(
    {
      port,
      walletInitialization: "STARTING",
      databaseTarget: databaseRuntimeConfig.target,
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

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;

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
