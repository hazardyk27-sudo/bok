import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { rouletteRepository } from "./roulette/repository";
import { attachRouletteWebSocket } from "./roulette/realtime";

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
attachRouletteWebSocket(server);

void rouletteRepository.start()
  .then(() => {
    server.listen(port, () => logger.info({ port, coordinator: rouletteRepository.leadership }, "Server listening"));
  })
  .catch((err: unknown) => {
    logger.error({ err }, "Unable to start roulette coordinator");
    process.exit(1);
  });

const shutdown = () => {
  void rouletteRepository.stop().finally(() => server.close());
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
