import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachBlackjackPlatformRuntime } from "./platform/blackjack";
import { recoverSharedWalletsIfEmpty } from "./platform/wallet";

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

const walletRecovery = await recoverSharedWalletsIfEmpty();
if (walletRecovery.recovered) {
  logger.warn(
    { insertedCount: walletRecovery.insertedCount },
    "Recovered shared wallets from authoritative game ledgers",
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
