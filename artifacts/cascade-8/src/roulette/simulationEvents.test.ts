import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createBallOrbit,
} from "./ballMotion";
import {
  createRotorSpin,
} from "./spinMotion";
import {
  ROULETTE_EVENT_CATCHUP_MS,
  collectRouletteSimulationEvents,
  createRouletteSimulationEvents,
} from "./simulationEvents";

describe("roulette simulation audio events", () => {
  it("builds a deterministic physics-driven event timeline", () => {
    const orbit = createBallOrbit(
      -0.72,
      createRotorSpin(0.37, 1),
    );
    const events =
      createRouletteSimulationEvents(
        orbit,
      );

    expect(events[0].timeMs).toBe(0);
    expect(
      events.some(
        (event) =>
          event.kind ===
          "rotor-roll-start",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind ===
          "track-roll-start",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind ===
          "track-roll-stop",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind ===
          "rotor-roll-stop",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind ===
            "fret-hit" ||
          event.kind ===
            "pocket-bounce",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind ===
          "pocket-capture",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.kind === "settled",
      ),
    ).toBe(true);

    for (
      let index = 1;
      index < events.length;
      index += 1
    ) {
      expect(
        events[index].timeMs,
      ).toBeGreaterThanOrEqual(
        events[index - 1].timeMs,
      );
    }
  });

  it("derives collision event count from the simulation collision chain", () => {
    const orbit = createBallOrbit(
      -0.72,
      createRotorSpin(0.37, 1),
    );
    const events =
      createRouletteSimulationEvents(
        orbit,
      );
    const contactEvents =
      events.filter(
        (event) =>
          event.kind ===
            "fret-hit" ||
          event.kind ===
            "pocket-bounce",
      );

    expect(
      contactEvents,
    ).toHaveLength(
      orbit.fretCollisions.length,
    );
  });

  it("emits the final settle event at the actual capture settle time", () => {
    const orbit = createBallOrbit();
    const events =
      createRouletteSimulationEvents(
        orbit,
      );
    const settled =
      events.find(
        (event) =>
          event.kind === "settled",
      );

    expect(
      orbit.pocketCapture,
    ).not.toBeNull();
    expect(settled).toBeDefined();
    expect(settled!.timeMs).toBe(
      orbit.pocketCapture!
        .settleTimeMs,
    );
    expect(
      settled!.pocketIndex,
    ).toBe(
      orbit.pocketCapture!
        .pocketIndex,
    );
  });

  it("skips stale collision bursts after a long animation gap", () => {
    const events = [
      {
        kind: "fret-hit" as const,
        timeMs: 1000,
        intensity: 0.8,
      },
      {
        kind:
          "pocket-bounce" as const,
        timeMs: 2000,
        intensity: 0.5,
      },
      {
        kind: "settled" as const,
        timeMs: 5000,
        intensity: 1,
      },
    ];

    expect(
      collectRouletteSimulationEvents(
        events,
        900,
        2050,
      ),
    ).toEqual([
      events[1],
    ]);

    expect(
      collectRouletteSimulationEvents(
        events,
        4900,
        5000,
      ),
    ).toEqual([
      events[2],
    ]);

    expect(
      ROULETTE_EVENT_CATCHUP_MS,
    ).toBeLessThan(250);
  });
});
