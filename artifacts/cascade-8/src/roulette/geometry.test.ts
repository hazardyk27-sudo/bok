import { describe, expect, it } from "vitest";
import {
  BALL_STYLE,
  BALL_TRACK_STYLE,
  CENTER_MECHANISM_STYLE,
  EUROPEAN_WHEEL_SEQUENCE,
  NUMBER_RING_STYLE,
  OUTER_RIM_STYLE,
  POCKET_RING_STYLE,
  RED_NUMBERS,
  SEGMENT_COUNT,
  WHEEL_GEOMETRY,
  getNumberColor,
  WHEEL_COLORS,
} from "./config";

describe("roulette 2d wheel geometry", () => {
  it("uses the canonical European single-zero wheel order", () => {
    expect(EUROPEAN_WHEEL_SEQUENCE).toEqual([
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
      5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
    ]);
    expect(SEGMENT_COUNT).toBe(37);
    expect(new Set(EUROPEAN_WHEEL_SEQUENCE).size).toBe(37);
  });

  it("uses the canonical European red-number set and colors", () => {
    expect([...RED_NUMBERS].sort((a, b) => a - b)).toEqual([
      1, 3, 5, 7, 9, 12, 14, 16, 18,
      19, 21, 23, 25, 27, 30, 32, 34, 36,
    ]);
    expect(getNumberColor(0)).toBe(WHEEL_COLORS.green);
    expect(getNumberColor(32)).toBe(WHEEL_COLORS.red);
    expect(getNumberColor(15)).toBe(WHEEL_COLORS.black);
  });

  it("keeps reference-led rings strictly nested", () => {
    expect(WHEEL_GEOMETRY.outerRadius).toBeGreaterThan(WHEEL_GEOMETRY.outerWoodInnerRadius);
    expect(WHEEL_GEOMETRY.outerWoodInnerRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberOuterRadius);
    expect(WHEEL_GEOMETRY.numberOuterRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberInnerRadius);
    expect(WHEEL_GEOMETRY.numberInnerRadius).toBe(WHEEL_GEOMETRY.pocketOuterRadius);
    expect(WHEEL_GEOMETRY.pocketOuterRadius).toBeGreaterThan(WHEEL_GEOMETRY.pocketInnerRadius);
    expect(WHEEL_GEOMETRY.pocketInnerRadius).toBeGreaterThan(WHEEL_GEOMETRY.centerDiscRadius);
  });

  it("keeps outer wood material guides inside the stator annulus", () => {
    expect(OUTER_RIM_STYLE.panelCount).toBe(WHEEL_GEOMETRY.markerCount);
    expect(OUTER_RIM_STYLE.grainInnerRadius).toBeGreaterThan(WHEEL_GEOMETRY.outerWoodInnerRadius);
    expect(OUTER_RIM_STYLE.grainOuterRadius).toBeLessThan(WHEEL_GEOMETRY.outerRadius);
    expect(OUTER_RIM_STYLE.innerBevelRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberOuterRadius);
    expect(OUTER_RIM_STYLE.outerBevelRadius).toBeLessThanOrEqual(WHEEL_GEOMETRY.outerRadius);
    expect(OUTER_RIM_STYLE.varnishRadius).toBeGreaterThan(OUTER_RIM_STYLE.grainInnerRadius);
  });

  it("keeps the fixed ball track between the rotor and outer markers", () => {
    expect(BALL_TRACK_STYLE.innerRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberOuterRadius);
    expect(BALL_TRACK_STYLE.outerRadius).toBeGreaterThan(BALL_TRACK_STYLE.innerRadius);
    expect(BALL_TRACK_STYLE.pathRadius).toBeGreaterThan(BALL_TRACK_STYLE.innerRadius);
    expect(BALL_TRACK_STYLE.pathRadius).toBeLessThan(BALL_TRACK_STYLE.outerRadius);

    const markerInnerEdge =
      WHEEL_GEOMETRY.markerRadius - OUTER_RIM_STYLE.markerHeight;
    expect(BALL_TRACK_STYLE.outerRadius).toBeLessThan(markerInnerEdge);
    expect(BALL_TRACK_STYLE.troughWidth).toBeLessThan(
      BALL_TRACK_STYLE.outerRadius - BALL_TRACK_STYLE.innerRadius,
    );
  });

  it("keeps the visual ball fully inside the fixed track", () => {
    const innerClearance =
      BALL_TRACK_STYLE.pathRadius - BALL_STYLE.radius - BALL_TRACK_STYLE.innerRadius;
    const outerClearance =
      BALL_TRACK_STYLE.outerRadius - BALL_TRACK_STYLE.pathRadius - BALL_STYLE.radius;

    expect(innerClearance).toBeGreaterThan(0);
    expect(outerClearance).toBeGreaterThan(0);
    expect(BALL_STYLE.shadowRadius).toBeGreaterThan(BALL_STYLE.radius);
    expect(BALL_STYLE.highlightRadius).toBeLessThan(BALL_STYLE.radius);
  });

  it("keeps inward number labels centered inside the number ring", () => {
    expect(NUMBER_RING_STYLE.textRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberInnerRadius);
    expect(NUMBER_RING_STYLE.textRadius).toBeLessThan(WHEEL_GEOMETRY.numberOuterRadius);

    const numberRingWidth = WHEEL_GEOMETRY.numberOuterRadius - WHEEL_GEOMETRY.numberInnerRadius;
    const pocketRingWidth = WHEEL_GEOMETRY.pocketOuterRadius - WHEEL_GEOMETRY.pocketInnerRadius;
    expect(numberRingWidth).toBeLessThan(pocketRingWidth);
  });

  it("keeps the green pocket ring broad and its depth guides inside the ring", () => {
    const pocketWidth = WHEEL_GEOMETRY.pocketOuterRadius - WHEEL_GEOMETRY.pocketInnerRadius;
    expect(pocketWidth).toBeGreaterThan(0.2);
    expect(POCKET_RING_STYLE.separatorWidth).toBeGreaterThan(NUMBER_RING_STYLE.separatorWidth);
    expect(POCKET_RING_STYLE.centerSheenRadius).toBeGreaterThan(WHEEL_GEOMETRY.pocketInnerRadius);
    expect(POCKET_RING_STYLE.centerSheenRadius).toBeLessThan(WHEEL_GEOMETRY.pocketOuterRadius);
    expect(POCKET_RING_STYLE.outerShadowInset).toBeGreaterThan(0);
    expect(POCKET_RING_STYLE.innerHighlightInset).toBeGreaterThan(0);
  });

  it("keeps the four-arm gold center mechanism inside the wooden center disc", () => {
    expect(CENTER_MECHANISM_STYLE.armCount).toBe(4);
    expect(CENTER_MECHANISM_STYLE.baseOuterRadius).toBeLessThan(WHEEL_GEOMETRY.centerDiscRadius);
    expect(CENTER_MECHANISM_STYLE.baseMiddleRadius).toBeLessThan(CENTER_MECHANISM_STYLE.baseOuterRadius);
    expect(CENTER_MECHANISM_STYLE.baseInnerRadius).toBeLessThan(CENTER_MECHANISM_STYLE.baseMiddleRadius);
    expect(CENTER_MECHANISM_STYLE.hubRadius).toBeLessThan(CENTER_MECHANISM_STYLE.baseInnerRadius);

    const knobOuterEdge =
      CENTER_MECHANISM_STYLE.armLength + CENTER_MECHANISM_STYLE.knobRadius;
    expect(knobOuterEdge).toBeLessThan(WHEEL_GEOMETRY.centerDiscRadius);
  });
});
