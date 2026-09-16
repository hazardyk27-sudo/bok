import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { rouletteRepository } from "../roulette/repository";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, coordinator: rouletteRepository.leadership, service: "roulette" });
});

export default router;
