import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/roulette/health", (_req, res) => {
  res.json({ ok: true, game: "roulette" });
});

export default router;
