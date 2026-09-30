import { Router, type IRouter } from "express";
import { LEGACY_SCOPED_SESSION_PATHS } from "./session";

export const SESSION_CONVERGENCE_ROUTE_PATHS = LEGACY_SCOPED_SESSION_PATHS.map(
  (path) => `${path.slice("/api".length)}/session-converge`,
);

export const sessionConvergenceRouter: IRouter = Router();

sessionConvergenceRouter.get(
  SESSION_CONVERGENCE_ROUTE_PATHS,
  (_req, res) => {
    res.status(204).end();
  },
);
