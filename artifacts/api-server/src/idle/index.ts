import { logger } from "../lib/logger";
import router from "./routes";
import { ticketMarketRuntime } from "./marketRuntimeDb";
import { ensureIdleRuntimeSchema } from "./runtimeSchema";
import {
  StadiumActionReceiptCleanupRuntime,
} from "./stadiumActionReceiptRetention";

const stadiumActionReceiptCleanupRuntime =
  new StadiumActionReceiptCleanupRuntime({
    onError: (error) => {
      logger.error(
        { err: error },
        "Idle Stadium action-receipt cleanup failed",
      );
    },
  });

void ensureIdleRuntimeSchema()
  .then(async () => {
    stadiumActionReceiptCleanupRuntime.start();
    await ticketMarketRuntime.start();
  })
  .catch((error) => {
    logger.error(
      { err: error },
      "Unable to initialize Idle Stadium runtime",
    );
  });

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
