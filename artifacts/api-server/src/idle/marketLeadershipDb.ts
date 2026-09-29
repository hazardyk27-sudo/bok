import { pool } from "@workspace/db";
import {
  GlobalMarketWriterLeadership,
} from "./marketLeadership";

/**
 * Runtime wiring for the pure/injectable advisory-lock leadership core.
 *
 * Only the elected writer keeps this checked-out PostgreSQL client. Followers
 * release their temporary try-lock client immediately.
 */
export const globalMarketWriterLeadership =
  new GlobalMarketWriterLeadership({
    connect: () => pool.connect(),
  });
