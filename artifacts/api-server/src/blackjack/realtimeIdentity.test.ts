import { describe, expect, it } from "vitest";
import {
  BLACKJACK_REALTIME_SESSION_COOKIE,
  BLACKJACK_REALTIME_SESSION_COOKIE_PATH,
  getCookieCandidatesByName,
  resolveBlackjackRealtimeSessionId,
} from "./realtimeIdentity";

const ROOT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEGACY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BOUND = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("blackjack realtime identity binding", () => {
  it("uses a dedicated websocket-path cookie instead of game_session ordering", () => {
    const header = [
      `game_session=${LEGACY}`,
      `game_session=${ROOT}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBe(BOUND);
  });

  it("does not silently fall back to ambiguous game_session candidates", () => {
    const header = [
      `game_session=${LEGACY}`,
      `game_session=${ROOT}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBeNull();
  });

  it("keeps the dedicated binding scoped to the blackjack websocket path", () => {
    expect(BLACKJACK_REALTIME_SESSION_COOKIE_PATH).toBe("/api/blackjack/ws");
  });

  it("deduplicates repeated realtime binding values and uses the latest valid binding", () => {
    const newer = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const header = [
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${newer}`,
    ].join("; ");

    expect(getCookieCandidatesByName(
      header,
      BLACKJACK_REALTIME_SESSION_COOKIE,
    )).toEqual([BOUND, newer]);
    expect(resolveBlackjackRealtimeSessionId(header)).toBe(newer);
  });

  it("rejects malformed binding values", () => {
    const header = `${BLACKJACK_REALTIME_SESSION_COOKIE}=not-a-session`;
    expect(resolveBlackjackRealtimeSessionId(header)).toBeNull();
  });
});
