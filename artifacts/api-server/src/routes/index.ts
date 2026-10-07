import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { router as cadiKazanRouter } from "../cadi-kazan";
import { router as slotRouter } from "../slot";
import { router as idleRouter } from "../idle";
import { router as rouletteRouter } from "../roulette";
import { authRouter } from "../auth";
import { sessionConvergenceRouter } from "../platform/sessionConvergence";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionConvergenceRouter);
router.use(authRouter);
router.use(cadiKazanRouter);
router.use(slotRouter);
router.use(idleRouter);
router.use(rouletteRouter);

export default router;
