import { Router, type IRouter } from "express";

export const BLACKJACK_API_BASE = "/api/blackjack";
export const BLACKJACK_MAX_SEATS = 5;

const router: IRouter = Router();

router.get(`${BLACKJACK_API_BASE}/health`, (_req, res) => {
  res.json({
    game: "blackjack",
    status: "foundation",
    authority: "server",
    maxSeats: BLACKJACK_MAX_SEATS,
  });
});

export default router;
