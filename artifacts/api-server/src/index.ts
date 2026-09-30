import { createServer } from "node:http";
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

const walletInitialization = await initializeSharedWalletPlatform();
const migratedWalletCount =
  walletInitialization.legacyImportedCount
  + walletInitialization.legacyRepairedDefaultCount
  + walletInitialization.ledgerRecoveredCount;

if (migratedWalletCount > 0 || walletInitialization.legacyPreservedCount > 0) {
  logger.warn(
    walletInitialization,
    "Initialized canonical shared wallets and retired legacy wallet authority",
  );
}

const server = createServer(app);
const blackjackRuntime = await attachBlackjackPlatformRuntime(server);

server.listen(port, () => {
  logger.info(
    {
      port,
      blackjack: blackjackRuntime.getReadiness(),
    },
    "Server listening",
  );
});

const shutdown = () => {
  blackjackRuntime.close();
  server.close();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
