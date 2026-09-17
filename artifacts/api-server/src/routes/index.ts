import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rouletteRouter from "../roulette/routes";
import physicsLabRouter from "../physics-lab/routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rouletteRouter);
router.use(physicsLabRouter);

export default router;
