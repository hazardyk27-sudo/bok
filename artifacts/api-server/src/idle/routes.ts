import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { SESSION_COOKIE } from "../roulette/routes";
import { idleRepository } from "./repository";
import { IDLE_BUSINESS_IDS, type IdleBusinessId } from "./storage";

const router: IRouter = Router();

function getSessionId(req: Request, res: Response) {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (existing && /^[a-f0-9-]{20,80}$/.test(existing)) return existing;

  const sessionId = randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return sessionId;
}


function serializeBusiness(business: Awaited<ReturnType<typeof idleRepository.getSessionState>>["businesses"][number]) {
  return {
    businessId: business.businessId,
    businessLevel: business.businessLevel,
    vaultLevel: business.vaultLevel,
    accruedMicrocents: business.projectedAccruedMicrocents,
    vaultCapacityMicrocents: business.vaultCapacityMicrocents,
    remainingCapacityMicrocents: business.remainingCapacityMicrocents,
    isVaultFull: business.isVaultFull,
    checkpointAt: business.checkpointAt.toISOString(),
  };
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "IDLE_REQUEST_FAILED";
  res.status(400).json({ error: message });
}

router.get("/idle/state", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const state = await idleRepository.getSessionState(sessionId);
    res.json({
      sessionId,
      serverTime: state.serverNow.toISOString(),
      wallet: state.wallet,
      businesses: state.businesses.map(serializeBusiness),
    });
  } catch (error) {
    sendError(res, error);
  }
});


router.post("/idle/businesses/:businessId/collect", async (req, res) => {
  try {
    const businessId = req.params.businessId as IdleBusinessId;
    if (!IDLE_BUSINESS_IDS.includes(businessId)) {
      res.status(404).json({ error: "IDLE_BUSINESS_NOT_FOUND" });
      return;
    }

    const result = await idleRepository.collectBusiness(
      getSessionId(req, res),
      businessId,
    );

    res.json({
      serverTime: result.serverNow.toISOString(),
      businessId: result.businessId,
      collectedCents: result.collectedCents,
      remainderMicrocents: result.remainderMicrocents,
      balanceCents: result.balanceCents,
      business: serializeBusiness(result.business),
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
