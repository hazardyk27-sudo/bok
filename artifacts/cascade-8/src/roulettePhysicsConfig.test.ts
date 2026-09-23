import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_DARK_RACE_CHANNEL_PROFILE,
  ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
  ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS,
  ROULETTE_DARK_RACE_LAUNCH_RADIUS,
  ROULETTE_DARK_RACE_RADIUS_BAND,
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_FIXED_TIMESTEP,
  ROULETTE_GRAVITY_Y,
  ROULETTE_MAX_CCD_SUBSTEPS,
  ROULETTE_MODEL_PATH,
  ROULETTE_PHYSICS_SCHEMA_VERSION,
  ROULETTE_POCKET_COUNT,
  ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
  ROULETTE_POCKET_FLOOR_Y,
  ROULETTE_POCKET_OUTER_LIP_RADIUS,
  ROULETTE_POCKET_OUTER_LIP_Y,
  ROULETTE_ROTOR_ANGULAR_SPEED,
  ROULETTE_ROTOR_BODY_MODE,
  ROULETTE_WHEEL_DIAMETER,
} from "../../../lib/roulette-physics-config";
import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_POCKET_COUNT as CLIENT_POCKET_COUNT,
  ROULETTE_SEGMENT_DEGREES,
} from "./rouletteGeometry";

const part3ViewportSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../roulette-physics-lab/src/Part2SceneViewport.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

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

  it("locks the measured recessed dark-race geometry", () => {
    expect(ROULETTE_DARK_RACE_RADIUS_BAND).toEqual([2.27, 2.54]);
    expect(ROULETTE_DARK_RACE_LAUNCH_RADIUS).toBeCloseTo(2.39);
    expect(ROULETTE_DARK_RACE_WOOD_INNER_RADIUS).toBeCloseTo(2.47);
    expect(ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS).toBeCloseTo(2.26);
    expect(ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS).toBeCloseTo(2.225);
    expect(
      ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS + ROULETTE_BALL_RADIUS,
    ).toBeCloseTo(2.281);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[0]).toEqual([2.18, -0.205]);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[2]).toEqual([2.225, -0.33]);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE.at(-1)).toEqual([
      2.559,
      -0.04,
    ]);
  });

  it("locks the continuous bowl-to-pocket seam", () => {
    expect(ROULETTE_POCKET_FLOOR_OUTER_RADIUS).toBeCloseTo(1.9);
    expect(ROULETTE_POCKET_FLOOR_Y).toBeCloseTo(-0.45);
    expect(ROULETTE_POCKET_OUTER_LIP_RADIUS).toBeCloseTo(2.04);
    expect(ROULETTE_POCKET_OUTER_LIP_Y).toBeCloseTo(-0.29);
    expect(ROULETTE_DARK_RACE_CHANNEL_PROFILE[0][0]).toBeCloseTo(2.18);
    expect(
      ROULETTE_DARK_RACE_CHANNEL_PROFILE[0][0] -
        ROULETTE_POCKET_OUTER_LIP_RADIUS,
    ).toBeCloseTo(0.14);
  });

  it("locks the European 37-pocket Y-axis kinematic rotor contract", () => {
    expect(ROULETTE_POCKET_COUNT).toBe(37);
    expect(CLIENT_POCKET_COUNT).toBe(37);
    expect(EUROPEAN_WHEEL_ORDER).toEqual(ROULETTE_EUROPEAN_SEQUENCE);
    expect(ROULETTE_SEGMENT_DEGREES).toBeCloseTo(360 / 37);
    expect(ROULETTE_ROTOR_BODY_MODE).toBe("kinematic-position-y");
    expect(ROULETTE_ROTOR_ANGULAR_SPEED).toBeCloseTo(0.35);
  });

  it("keeps legacy outer-track constants out of the runtime physics path", () => {
    expect(part3ViewportSource).not.toContain(
      "const PART3_LAUNCH_RADIUS = 2.82",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_TRACK_INNER_RADIUS = 2.72",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_TRACK_OUTER_RADIUS = 2.90",
    );
    expect(part3ViewportSource).not.toContain(
      "PART3_LEGACY_TRACK_VERTICAL_OFFSET",
    );
    expect(part3ViewportSource).not.toContain(
      "const PART3_OPERATIONAL_LAUNCH_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "const PART3_LAUNCH_RADIUS = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "return makePart2RaceChannelTrimesh(verticalOffset)",
    );
  });

  it("keeps a single continuous stationary bowl bridge between race and rotor lip", () => {
    expect(part3ViewportSource).toContain("function buildBowlBridgeTrimesh");
    expect(part3ViewportSource).toContain("measureBowlBridgeProfile");
    expect(part3ViewportSource).toContain(
      "const BOWL_BRIDGE_INNER_RADIUS = POCKET_OUTER_LIP_RADIUS",
    );
    expect(part3ViewportSource).toContain(
      "const BOWL_BRIDGE_OUTER_RADIUS = PART2_CHANNEL_PROFILE[0][0]",
    );
    expect(part3ViewportSource).toContain(
      "'stationary-bowl-apron-bridge'",
    );
    expect(part3ViewportSource).toContain(
      "[POCKET_OUTER_LIP_RADIUS, POCKET_OUTER_LIP_Y]",
    );
    expect(part3ViewportSource).toContain(
      "targetOuterY = part2ChannelSurfaceAt",
    );
    expect(part3ViewportSource).toContain(
      "setCollisionGroups(\n                   STATIONARY_COLLISION_GROUP",
    );
  });

  it("derives visible deflectors from the authoritative GLB instead of the 37-pocket ring", () => {
    expect(part3ViewportSource).not.toContain(
      "const PART3_DEFLECTOR_COUNT = 37",
    );
    expect(part3ViewportSource).not.toContain(
      "addPart3DeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "const PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT = 360",
    );
    expect(part3ViewportSource).toContain(
      "const measureVisibleDeflectors = (): Part4DeflectorAudit",
    );
    expect(part3ViewportSource).toContain(
      "addMeasuredDeflectorColliders",
    );
    expect(part3ViewportSource).toContain(
      "'asset-measured-visible-deflector-cuboid'",
    );
    expect(part3ViewportSource).toContain(
      "PART4_DEFLECTOR_AUDIT",
    );
    expect(part3ViewportSource).toContain(
      "part4DeflectorAudit?.passed",
    );
  });

  it("keeps the PART 2 containment correction geometric only", () => {
    expect(part3ViewportSource).toContain("speed: 5,");
    expect(part3ViewportSource).toContain(
      "const initialLinearSpeed = PART3_PROBES[0].speed",
    );
    expect(part3ViewportSource).not.toContain(".addForce(");
    expect(part3ViewportSource).not.toContain(".applyImpulse(");
    expect(part3ViewportSource).not.toContain(".addTorque(");
    expect(part3ViewportSource).toContain(
      "PART2_INNER_CONTAINMENT_CENTER_LIMIT",
    );
    expect(part3ViewportSource).toContain(
      "minimumInnerContainmentClearance",
    );
  });
});
