import { logger } from "../lib/logger";
import router from "./routes";
import { ticketMarketRuntime } from "./marketRuntimeDb";

void ticketMarketRuntime.start().catch((error) => {
  logger.error(
    { err: error },
    "Unable to start Idle ticket market runtime",
  );
});

const stopIdleMarketRuntime = () => {
  void ticketMarketRuntime.stop().catch((error) => {
    logger.error(
      { err: error },
      "Unable to stop Idle ticket market runtime cleanly",
    );
  });
};

process.once("SIGTERM", stopIdleMarketRuntime);
process.once("SIGINT", stopIdleMarketRuntime);

export { router };
