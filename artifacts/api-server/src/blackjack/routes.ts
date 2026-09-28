import { Router, type IRouter } from "express";

export const BLACKJACK_API_BASE = "/api/blackjack" as const;
export const BLACKJACK_ROUTER_BASE = "/blackjack" as const;
export const BLACKJACK_HEALTH_PATH = "/api/blackjack/health" as const;
export const BLACKJACK_MAX_SEATS = 5;

const router: IRouter = Router();

router.get(`${BLACKJACK_ROUTER_BASE}/health`, (_req, res) => {
  res.json({
    game: "blackjack",
    status: "integration-ready",
    authority: "server",
    apiBase: BLACKJACK_API_BASE,
    healthPath: BLACKJACK_HEALTH_PATH,
    websocketPath: "/api/blackjack/ws",
    maxSeats: BLACKJACK_MAX_SEATS,
  });
});

export default router;
