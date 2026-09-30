import { logger } from "../lib/logger";
import router from "./routes";
import { ticketMarketRuntime } from "./marketRuntimeDb";
import {
  stadiumActionReceiptCleanupRuntime,
} from "./stadiumActionReceiptRetention";

void ticketMarketRuntime.start().catch((error) => {
  logger.error(
    { err: error },
    "Unable to start Idle ticket market runtime",
  );
});

stadiumActionReceiptCleanupRuntime.start();

const stopIdleRuntime = () => {
  stadiumActionReceiptCleanupRuntime.stop();

  void ticketMarketRuntime.stop().catch((error) => {
    logger.error(
      { err: error },
      "Unable to stop Idle ticket market runtime cleanly",
    );
  });
};

process.once("SIGTERM", stopIdleRuntime);
process.once("SIGINT", stopIdleRuntime);

export { router };
