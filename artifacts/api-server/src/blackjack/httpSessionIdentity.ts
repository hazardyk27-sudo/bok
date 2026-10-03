import { randomUUID } from "node:crypto";
import { isValidSessionId } from "../platform/session";

export type BlackjackAuthWalletLookup = (
  authToken: string,
) => Promise<string | null>;

export type BlackjackHttpSessionIdentityInput = Readonly<{
  authToken: unknown;
  canonicalSessionId: unknown;
}>;

export type BlackjackHttpSessionIdentity = Readonly<{
  sessionId: string;
  source: "AUTH" | "CANONICAL" | "GUEST_CREATED";
}>;

export async function resolveBlackjackHttpSessionIdentity(
  input: BlackjackHttpSessionIdentityInput,
  options: Readonly<{
    lookupAuthWalletSessionId: BlackjackAuthWalletLookup;
    createSessionId?: () => string;
  }>,
): Promise<BlackjackHttpSessionIdentity> {
  if (typeof input.authToken === "string" && input.authToken.length > 0) {
    const authenticatedWalletSessionId =
      await options.lookupAuthWalletSessionId(input.authToken);
    if (authenticatedWalletSessionId !== null) {
      if (!isValidSessionId(authenticatedWalletSessionId)) {
        throw new Error("BLACKJACK_AUTH_WALLET_SESSION_INVALID");
      }
      return Object.freeze({
        sessionId: authenticatedWalletSessionId,
        source: "AUTH" as const,
      });
    }
  }

  if (isValidSessionId(input.canonicalSessionId)) {
    return Object.freeze({
      sessionId: input.canonicalSessionId,
      source: "CANONICAL" as const,
    });
  }

  const created = (options.createSessionId ?? randomUUID)();
  if (!isValidSessionId(created)) {
    throw new Error("BLACKJACK_GUEST_SESSION_INVALID");
  }
  return Object.freeze({
    sessionId: created,
    source: "GUEST_CREATED" as const,
  });
}
