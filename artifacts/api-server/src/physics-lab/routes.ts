import { Router, type IRouter } from "express";
import { physicsLabRepository } from "./repository";

const router: IRouter = Router();

function sendError(res: Parameters<IRouter["get"]>[1] extends never ? never : any, error: unknown) {
  const message =
    error instanceof Error ? error.message : "PHYSICS_LAB_REQUEST_FAILED";
  res.status(message === "PHYSICS_LAB_ROUND_NOT_FOUND" ? 404 : 503).json({
    error: message,
  });
}

router.get("/physics-lab/rounds/current", async (req, res) => {
  try {
    res.json(await physicsLabRepository.getCurrentRound());
  } catch (error) {
    req.log.error({ err: error }, "Unable to load Physics Lab authoritative round");
    sendError(res, error);
  }
});

router.post("/physics-lab/rounds", async (req, res) => {
  try {
    res.status(201).json(await physicsLabRepository.createRound());
  } catch (error) {
    req.log.error({ err: error }, "Unable to create Physics Lab authoritative round");
    sendError(res, error);
  }
});

router.get("/physics-lab/rounds/:roundId", async (req, res) => {
  try {
    const round = await physicsLabRepository.getRound(req.params.roundId);
    if (!round) {
      res.status(404).json({ error: "PHYSICS_LAB_ROUND_NOT_FOUND" });
      return;
    }
    res.json(round);
  } catch (error) {
    req.log.error({ err: error }, "Unable to load Physics Lab replay");
    sendError(res, error);
  }
});

export default router;