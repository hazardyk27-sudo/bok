import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { router as cadiKazanRouter } from "../cadi-kazan";
import { router as slotRouter } from "../slot";
import { router as idleRouter } from "../idle";
import { router as blackjackRouter } from "../blackjack";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cadiKazanRouter);
router.use(slotRouter);
router.use(idleRouter);
router.use(blackjackRouter);

export default router;
