import { logger } from "../lib/logger";
import router from "./routes";
import { ticketMarketRuntime } from "./marketRuntimeDb";

void ticketMarketRuntime.start().catch((error) => {
  logger.error(
    { err: error },
    "Unable to start Idle ticket market runtime",
  );
});

export { router };
