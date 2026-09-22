import { describe, expect, it } from "vitest";
import {
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_FIXED_TIMESTEP,
  ROULETTE_GRAVITY_Y,
  ROULETTE_MAX_CCD_SUBSTEPS,
  ROULETTE_MODEL_PATH,
  ROULETTE_PHYSICS_SCHEMA_VERSION,
  ROULETTE_POCKET_COUNT,
  ROULETTE_ROTOR_ANGULAR_SPEED,
  ROULETTE_ROTOR_BODY_MODE,
  ROULETTE_WHEEL_DIAMETER,
} from "../../../lib/roulette-physics-config";
import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_POCKET_COUNT as CLIENT_POCKET_COUNT,
  ROULETTE_SEGMENT_DEGREES,
} from "./rouletteGeometry";

describe("authoritative roulette physics config", () => {
  it("locks the rou-lp-test-04 physical scale and ball standard", () => {
    expect(ROULETTE_PHYSICS_SCHEMA_VERSION).toBe(
      "roulette-physics-v1-rou-lp-test-04",
    );
    expect(ROULETTE_MODEL_PATH).toBe("/physics-lab/rou-lp-test-04.glb");
    expect(ROULETTE_WHEEL_DIAMETER).toBe(6);
    expect(ROULETTE_AUTHORITATIVE_SCALE).toBeCloseTo(7.147963);
    expect(ROULETTE_BALL_RADIUS).toBeCloseTo(0.056);
    expect(ROULETTE_GRAVITY_Y).toBeCloseTo(-58.86);
    expect(ROULETTE_FIXED_TIMESTEP).toBeCloseTo(1 / 120);
    expect(ROULETTE_MAX_CCD_SUBSTEPS).toBe(8);
  });

  it("locks the European 37-pocket Y-axis kinematic rotor contract", () => {
    expect(ROULETTE_POCKET_COUNT).toBe(37);
    expect(CLIENT_POCKET_COUNT).toBe(37);
    expect(EUROPEAN_WHEEL_ORDER).toEqual(ROULETTE_EUROPEAN_SEQUENCE);
    expect(ROULETTE_SEGMENT_DEGREES).toBeCloseTo(360 / 37);
    expect(ROULETTE_ROTOR_BODY_MODE).toBe("kinematic-position-y");
    expect(ROULETTE_ROTOR_ANGULAR_SPEED).toBeCloseTo(0.35);
  });
});
