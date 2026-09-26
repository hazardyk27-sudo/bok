import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import {
  attachRuntime as attachRouletteRuntime,
  startRuntime as startRouletteRuntime,
  stopRuntime as stopRouletteRuntime,
} from "./roulette";

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
attachRouletteRuntime(server);

void startRouletteRuntime()
  .then((coordinator) => {
    server.listen(port, () => logger.info({ port, coordinator }, "Server listening"));
  })
  .catch((err: unknown) => {
    logger.error({ err }, "Unable to start roulette coordinator");
    process.exit(1);
  });

const shutdown = () => {
  void stopRouletteRuntime().finally(() => server.close());
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
