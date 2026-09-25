import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { SESSION_COOKIE } from "../roulette/routes";
import { idleRepository } from "./repository";
import { IDLE_BUSINESS_IDS, type IdleBusinessId } from "./storage";

const router: IRouter = Router();
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;

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
  const status = message === "IDEMPOTENCY_KEY_REUSED" || message === "IDLE_BUSINESS_MAX_LEVEL" || message === "IDLE_VAULT_MAX_LEVEL" ? 409
    : message === "INSUFFICIENT_IDLE_CREDITS" ? 402
      : message === "IDLE_BUSINESS_NOT_FOUND" ? 404
        : 400;
  res.status(status).json({ error: message });
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

    const { idempotencyKey } = req.body as { idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      res.status(400).json({ error: "VALID_IDEMPOTENCY_KEY_REQUIRED" });
      return;
    }

    const result = await idleRepository.collectBusiness(
      getSessionId(req, res),
      businessId,
      idempotencyKey,
    );

    res.json({
      serverTime: result.serverNow.toISOString(),
      businessId: result.businessId,
      collectedCents: result.collectedCents,
      remainderMicrocents: result.remainderMicrocents,
      balanceCents: result.balanceCents,
      replayed: result.replayed,
      business: serializeBusiness(result.business),
    });
  } catch (error) {
    sendError(res, error);
  }
});


router.post("/idle/businesses/:businessId/upgrade", async (req, res) => {
  try {
    const businessId = req.params.businessId as IdleBusinessId;
    if (!IDLE_BUSINESS_IDS.includes(businessId)) {
      res.status(404).json({ error: "IDLE_BUSINESS_NOT_FOUND" });
      return;
    }

    const { idempotencyKey } = req.body as { idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      res.status(400).json({ error: "VALID_IDEMPOTENCY_KEY_REQUIRED" });
      return;
    }

    const result = await idleRepository.upgradeBusiness(
      getSessionId(req, res),
      businessId,
      idempotencyKey,
    );

    res.json({
      serverTime: result.serverNow.toISOString(),
      businessId: result.businessId,
      targetBusinessLevel: result.targetBusinessLevel,
      costCents: result.costCents,
      balanceCents: result.balanceCents,
      replayed: result.replayed,
      business: serializeBusiness(result.business),
    });
  } catch (error) {
    sendError(res, error);
  }
});


router.post("/idle/businesses/:businessId/vault/upgrade", async (req, res) => {
  try {
    const businessId = req.params.businessId as IdleBusinessId;
    if (!IDLE_BUSINESS_IDS.includes(businessId)) {
      res.status(404).json({ error: "IDLE_BUSINESS_NOT_FOUND" });
      return;
    }

    const { idempotencyKey } = req.body as { idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      res.status(400).json({ error: "VALID_IDEMPOTENCY_KEY_REQUIRED" });
      return;
    }

    const result = await idleRepository.upgradeVault(
      getSessionId(req, res),
      businessId,
      idempotencyKey,
    );

    res.json({
      serverTime: result.serverNow.toISOString(),
      businessId: result.businessId,
      targetVaultLevel: result.targetVaultLevel,
      costCents: result.costCents,
      balanceCents: result.balanceCents,
      replayed: result.replayed,
      business: serializeBusiness(result.business),
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
