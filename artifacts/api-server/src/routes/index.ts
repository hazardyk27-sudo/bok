import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rouletteRouter from "../roulette/routes";
import physicsLabRouter from "../physics-lab/routes";
import cadiKazanRouter from "../cadi-kazan/routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rouletteRouter);
router.use(physicsLabRouter);
router.use(cadiKazanRouter);

export default router;
