import { Router, type IRouter } from "express";
import { getIdleLeaderboard } from "./leaderboard";

const leaderboardRouter: IRouter = Router();

leaderboardRouter.get("/idle/leaderboard", async (_req, res) => {
  try {
    res.json(await getIdleLeaderboard());
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : "IDLE_LEADERBOARD_REQUEST_FAILED",
    });
  }
});

export default leaderboardRouter;
