import { Router, type IRouter } from "express";
import { getBlackjackRuntimeBootstrapState } from "./serverRuntime";

export const BLACKJACK_API_BASE = "/api/blackjack" as const;
export const BLACKJACK_ROUTER_BASE = "/blackjack" as const;
export const BLACKJACK_HEALTH_PATH = "/api/blackjack/health" as const;
export const BLACKJACK_MAX_SEATS = 5;

export function buildBlackjackHealthPayload() {
  const readiness = getBlackjackRuntimeBootstrapState();

  return Object.freeze({
    game: "blackjack",
    ready: readiness.ready,
    status: readiness.status,
    runtimeStatus: readiness.runtime?.status ?? null,
    attempt: readiness.attempt,
    failureCode: readiness.failureCode,
    authority: "server",
    apiBase: BLACKJACK_API_BASE,
    healthPath: BLACKJACK_HEALTH_PATH,
    websocketPath: "/api/blackjack/ws",
    maxSeats: BLACKJACK_MAX_SEATS,
  });
}

const router: IRouter = Router();

router.get(`${BLACKJACK_ROUTER_BASE}/health`, (_req, res) => {
  const payload = buildBlackjackHealthPayload();
  res.status(payload.ready ? 200 : 503).json(payload);
});

export default router;
