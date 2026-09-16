import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rouletteRouter from "../roulette/routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rouletteRouter);

export default router;
