import {
  WHEEL_GEOMETRY,
} from "./config";
import {
  sampleBallOrbit,
  type BallOrbit,
  type FretCollision,
} from "./ballMotion";

export type RouletteSimulationEventKind =
  | "rotor-roll-start"
  | "rotor-roll-stop"
  | "track-roll-start"
  | "track-roll-stop"
  | "deflector-hit"
  | "fret-hit"
  | "pocket-bounce"
  | "pocket-capture"
  | "settled";

export type RouletteSimulationEvent = {
  kind: RouletteSimulationEventKind;
  timeMs: number;
  intensity: number;
  angularVelocity?: number;
  collisionIndex?: number;
  pocketIndex?: number;
};

export const ROULETTE_EVENT_CATCHUP_MS = 180;

function clamp01(value: number) {
  return Math.min(
    1,
    Math.max(
      0,
      Number.isFinite(value) ? value : 0,
    ),
  );
}

function getCollisionIntensity(
  collision: FretCollision,
) {
  return clamp01(
    Math.abs(
      collision.relativeAngularVelocityBefore,
    ) / 7.5,
  );
}

function isPocketBounce(
  collision: FretCollision,
) {
  return (
    collision.radiusRatio <=
      WHEEL_GEOMETRY.pocketOuterRadius ||
    Math.abs(
      collision.relativeAngularVelocityBefore,
    ) <= 1.25
  );
}

export function createRouletteSimulationEvents(
  orbit: BallOrbit,
): RouletteSimulationEvent[] {
  const events: RouletteSimulationEvent[] = [
    {
      kind: "rotor-roll-start",
      timeMs: 0,
      intensity: 1,
      angularVelocity:
        orbit.rotorSpin.initialAngularVelocity,
    },
    {
      kind: "track-roll-start",
      timeMs: 0,
      intensity: 1,
      angularVelocity:
        orbit.initialAngularVelocity,
    },
    {
      kind: "track-roll-stop",
      timeMs: orbit.descentStartMs,
      intensity: clamp01(
        orbit.descentStartAngularVelocity /
          orbit.initialAngularVelocity,
      ),
      angularVelocity:
        orbit.descentStartAngularVelocity,
    },
    {
      kind: "rotor-roll-stop",
      timeMs:
        orbit.rotorSpin.durationMs,
      intensity: 0,
      angularVelocity: 0,
    },
  ];

  if (orbit.deflectorCollision) {
    const sample = sampleBallOrbit(
      orbit,
      Math.max(
        0,
        orbit.deflectorCollision.timeMs - 4,
      ),
    );

    events.push({
      kind: "deflector-hit",
      timeMs:
        orbit.deflectorCollision.timeMs,
      intensity: clamp01(
        sample.angularVelocity / 10,
      ),
      angularVelocity:
        sample.angularVelocity,
      collisionIndex:
        orbit.deflectorCollision
          .deflectorIndex,
    });
  }

  orbit.fretCollisions.forEach(
    (collision, collisionIndex) => {
      events.push({
        kind: isPocketBounce(collision)
          ? "pocket-bounce"
          : "fret-hit",
        timeMs: collision.timeMs,
        intensity:
          getCollisionIntensity(
            collision,
          ),
        angularVelocity:
          Math.abs(
            collision
              .relativeAngularVelocityBefore,
          ),
        collisionIndex,
      });
    },
  );

  if (orbit.pocketCapture) {
    events.push({
      kind: "pocket-capture",
      timeMs:
        orbit.pocketCapture.timeMs,
      intensity: clamp01(
        Math.abs(
          orbit.pocketCapture
            .initialRelativeAngularVelocity,
        ) / 1.2,
      ),
      angularVelocity:
        Math.abs(
          orbit.pocketCapture
            .initialRelativeAngularVelocity,
        ),
      pocketIndex:
        orbit.pocketCapture.pocketIndex,
    });

    events.push({
      kind: "settled",
      timeMs:
        orbit.pocketCapture.settleTimeMs,
      intensity: 1,
      angularVelocity: 0,
      pocketIndex:
        orbit.pocketCapture.pocketIndex,
    });
  }

  return events.sort(
    (a, b) =>
      a.timeMs - b.timeMs,
  );
}

export function collectRouletteSimulationEvents(
  events: readonly RouletteSimulationEvent[],
  previousElapsedMs: number,
  elapsedMs: number,
  maxCatchupMs =
    ROULETTE_EVENT_CATCHUP_MS,
) {
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  ) {
    return [];
  }

  const safePrevious =
    Number.isFinite(previousElapsedMs)
      ? previousElapsedMs
      : -1;
  const catchupStart =
    elapsedMs - safePrevious >
    maxCatchupMs
      ? elapsedMs - maxCatchupMs
      : safePrevious;

  return events.filter(
    (event) =>
      event.timeMs >
        catchupStart &&
      event.timeMs <= elapsedMs,
  );
}
