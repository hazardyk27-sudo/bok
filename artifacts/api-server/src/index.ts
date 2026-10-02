import { createServer } from "node:http";
import {
  assertDatabaseCutoverReady,
  databaseRuntimeConfig,
  pool,
} from "@workspace/db";
import app from "./app";
import {
  markBlackjackRuntimeAttached,
  markBlackjackRuntimeFailed,
  markBlackjackRuntimeStarting,
  markBlackjackRuntimeStopped,
} from "./blackjack";
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
let blackjackRuntime: Awaited<
  ReturnType<typeof attachBlackjackPlatformRuntime>
> | null = null;
let blackjackRuntimeRetryHandle: ReturnType<typeof setTimeout> | null = null;
let blackjackRuntimeAttempt = 0;
let shuttingDown = false;
const BLACKJACK_RUNTIME_RETRY_MS = 1_000;

server.listen(port, () => {
  logger.info(
    {
      port,
      blackjack: "STARTING",
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

// Blackjack is optional to the rest of the HTTP API, but Blackjack itself is
// not considered ready until its authoritative realtime runtime is attached.
// Startup failures and later fail-closed authority failures both rebuild the
// runtime in-process; a dead authority is never left behind a live WebSocket.
const scheduleBlackjackRuntimeRetry = (): void => {
  if (shuttingDown || blackjackRuntimeRetryHandle !== null) return;
  blackjackRuntimeRetryHandle = setTimeout(() => {
    blackjackRuntimeRetryHandle = null;
    void startBlackjackRuntime();
  }, BLACKJACK_RUNTIME_RETRY_MS);
};

const handleBlackjackRuntimeUnavailable = (
  error: unknown,
  attempt: number,
): void => {
  if (
    shuttingDown ||
    attempt !== blackjackRuntimeAttempt ||
    blackjackRuntime === null
  ) {
    return;
  }

  const failedRuntime = blackjackRuntime;
  blackjackRuntime = null;
  failedRuntime.close();
  markBlackjackRuntimeFailed(attempt);

  logger.error(
    {
      err: error,
      attempt,
      retryInMs: BLACKJACK_RUNTIME_RETRY_MS,
    },
    "Blackjack runtime became unavailable; recovery retry scheduled",
  );
  scheduleBlackjackRuntimeRetry();
};

const startBlackjackRuntime = async (): Promise<void> => {
  if (shuttingDown) return;

  blackjackRuntimeAttempt += 1;
  const attempt = blackjackRuntimeAttempt;
  markBlackjackRuntimeStarting(attempt);

  try {
    const runtime = await attachBlackjackPlatformRuntime(server, {
      onRuntimeUnavailable: (error) => {
        handleBlackjackRuntimeUnavailable(error, attempt);
      },
    });

    if (shuttingDown) {
      runtime.close();
      markBlackjackRuntimeStopped();
      return;
    }

    blackjackRuntime = runtime;

    const readiness = runtime.getReadiness();
    if (!readiness.ready) {
      handleBlackjackRuntimeUnavailable(
        new Error("BLACKJACK_RUNTIME_NOT_READY_AFTER_ATTACH"),
        attempt,
      );
      return;
    }

    markBlackjackRuntimeAttached(runtime, attempt);
    logger.info(
      {
        blackjack: readiness,
        attempt,
      },
      "Blackjack runtime attached",
    );
  } catch (error) {
    if (shuttingDown) {
      markBlackjackRuntimeStopped();
      return;
    }

    markBlackjackRuntimeFailed(attempt);
    logger.error(
      {
        err: error,
        attempt,
        retryInMs: BLACKJACK_RUNTIME_RETRY_MS,
      },
      "Blackjack runtime failed to attach; retry scheduled",
    );
    scheduleBlackjackRuntimeRetry();
  }
};

void startBlackjackRuntime();

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (blackjackRuntimeRetryHandle !== null) {
    clearTimeout(blackjackRuntimeRetryHandle);
    blackjackRuntimeRetryHandle = null;
  }
  blackjackRuntime?.close();
  blackjackRuntime = null;
  markBlackjackRuntimeStopped();
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
