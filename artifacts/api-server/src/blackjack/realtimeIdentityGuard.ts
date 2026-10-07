import type { IncomingMessage } from "node:http";
import type { BlackjackRealtimeIdentity } from "./realtime";

export type BlackjackLiveIdentityResolver = (
  request: IncomingMessage,
) =>
  | BlackjackRealtimeIdentity
  | null
  | Promise<BlackjackRealtimeIdentity | null>;

export function isBlackjackRealtimeRequestAlive(
  request: IncomingMessage,
): boolean {
  return !request.aborted && !request.destroyed && !request.socket.destroyed;
}

export async function resolveBlackjackLiveRealtimeIdentity(
  request: IncomingMessage,
  resolver: BlackjackLiveIdentityResolver,
): Promise<BlackjackRealtimeIdentity | null> {
  if (!isBlackjackRealtimeRequestAlive(request)) return null;

  const identity = await resolver(request);
  if (identity === null) return null;

  return isBlackjackRealtimeRequestAlive(request) ? identity : null;
}
