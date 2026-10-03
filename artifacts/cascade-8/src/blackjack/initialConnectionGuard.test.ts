// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLACKJACK_INITIAL_CONNECTION_DEADLINE_MS,
  BLACKJACK_MOUNT_SNAPSHOT_TIMEOUT_MS,
  mountConnectedBlackjack,
  type BlackjackBrowserSocket,
} from "./index";

type Listener = (event: Event | MessageEvent<unknown>) => void;

function createPhysicalSocket() {
  const listeners = new Map<string, Set<Listener>>();
  const closeCalls: Array<[number | undefined, string | undefined]> = [];
  const socket: BlackjackBrowserSocket = {
    send: () => undefined,
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener as Listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener as Listener);
    },
    close: (code, reason) => closeCalls.push([code, reason]),
  };
  const emit = (type: string, event: Event | MessageEvent<unknown>) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  return { socket, closeCalls, emit };
}

function idleSnapshot() {
  return {
    type: "FULL_TABLE_SNAPSHOT",
    reason: "INITIAL_CONNECT",
    resetEventSequenceTo: 1,
    resetStateVersionTo: 1,
    snapshot: {
      serverTimeMs: 1_000,
      tableId: "initial-guard-table",
      phase: "TABLE_IDLE",
      maxSeats: 5,
      seats: [1, 2, 3, 4, 5].map((seatNumber) => ({
        seatNumber,
        playerId: null,
      })),
      players: [],
      round: null,
      stateVersion: 1,
      eventSequence: 1,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("blackjack initial realtime connection guard", () => {
  it("uses the wider mount watchdog for slow production WebSocket upgrades", () => {
    const physical = createPhysicalSocket();
    const delays: number[] = [];
    const app = document.createElement("div");

    const connection = mountConnectedBlackjack(app, {
      location: { protocol: "https:", host: "blackjack.example" },
      createSocket: () => physical.socket,
      scheduleTransportTimer: (_callback, delayMs) => {
        delays.push(delayMs);
        return delayMs;
      },
      cancelTransportTimer: () => undefined,
      scheduleRender: () => "render",
      cancelRender: () => undefined,
      scheduleReconnect: () => "reconnect",
      cancelReconnect: () => undefined,
    });

    expect(delays[0]).toBe(BLACKJACK_MOUNT_SNAPSHOT_TIMEOUT_MS);
    expect(app.querySelector('[data-blackjack-stat="balance"]')?.textContent)
      .toBe("—");
    connection.close();
  });

  it("repairs an endless initial CONNECTING state instead of leaving it stuck", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const physical = createPhysicalSocket();
    const app = document.createElement("div");

    mountConnectedBlackjack(app, {
      location: { protocol: "https:", host: "blackjack.example" },
      createSocket: () => physical.socket,
      scheduleTransportTimer: () => "transport",
      cancelTransportTimer: () => undefined,
      scheduleReconnect: () => "reconnect",
      cancelReconnect: () => undefined,
      scheduleRender: () => "render",
      cancelRender: () => undefined,
    });

    vi.advanceTimersByTime(BLACKJACK_INITIAL_CONNECTION_DEADLINE_MS - 1);
    expect(app.querySelector(".blackjack-connection-label")?.textContent)
      .toBe("CONNECTING");

    vi.advanceTimersByTime(1);
    expect(app.querySelector(".blackjack-connection-label")?.textContent)
      .toBe("RECONNECTING");
    expect(app.querySelector(".blackjack-context-prompt")?.textContent)
      .toBe("RESTORING TABLE CONNECTION");
    expect(app.querySelector('[data-blackjack-stat="balance"]')?.textContent)
      .toBe("—");
    expect(physical.closeCalls).toContainEqual([
      1000,
      "BLACKJACK_CLIENT_CLOSED",
    ]);
  });

  it("does not trip the deadline after an authoritative baseline arrives", () => {
    vi.useFakeTimers();
    const physical = createPhysicalSocket();
    const app = document.createElement("div");

    const connection = mountConnectedBlackjack(app, {
      location: { protocol: "https:", host: "blackjack.example" },
      createSocket: () => physical.socket,
      scheduleTransportTimer: () => "transport",
      cancelTransportTimer: () => undefined,
      scheduleReconnect: () => "reconnect",
      cancelReconnect: () => undefined,
      scheduleRender: () => "render",
      cancelRender: () => undefined,
    });

    physical.emit(
      "message",
      new MessageEvent("message", {
        data: JSON.stringify(idleSnapshot()),
      }),
    );
    expect(connection.getStatus().state).toBe("READY");

    vi.advanceTimersByTime(BLACKJACK_INITIAL_CONNECTION_DEADLINE_MS);
    expect(app.querySelector(".blackjack-connection-label")?.textContent)
      .toBe("LIVE");
    expect(physical.closeCalls).toEqual([]);
    connection.close();
  });
});
