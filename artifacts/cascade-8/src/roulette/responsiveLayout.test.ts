import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_PHASE_GEOMETRY,
  ROULETTE_REFERENCE_SCENES,
  computeRouletteResponsiveLayout,
} from "./responsiveLayout";
import type {
  RouletteScenePhase,
} from "./scenePhase";

const VIEWPORTS = [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 873],
  [412, 915],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [844, 390],
  [1024, 768],
  [1180, 820],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
] as const;

const PHASES: RouletteScenePhase[] = [
  "betting",
  "spinning",
  "settled",
];

describe("roulette canonical responsive layout", () => {
  it("fits the complete reference scene inside every target viewport without stretching", () => {
    for (const [width, height] of VIEWPORTS) {
      for (const phase of PHASES) {
        const layout =
          computeRouletteResponsiveLayout(
            width,
            height,
            phase,
          );

        expect(layout.scale).toBeGreaterThan(0);
        expect(layout.offsetX).toBeGreaterThanOrEqual(-0.001);
        expect(layout.offsetY).toBeGreaterThanOrEqual(-0.001);
        expect(
          layout.offsetX +
            layout.renderedWidth,
        ).toBeLessThanOrEqual(
          width + 0.001,
        );
        expect(
          layout.offsetY +
            layout.renderedHeight,
        ).toBeLessThanOrEqual(
          height + 0.001,
        );

        expect(
          layout.renderedWidth /
            layout.renderedHeight,
        ).toBeCloseTo(
          layout.reference.width /
            layout.reference.height,
          10,
        );
      }
    }
  });

  it("keeps wheel and complete table/rail geometry inside both canonical scenes", () => {
    for (
      const mode of
      ["portrait", "landscape"] as const
    ) {
      const scene =
        ROULETTE_REFERENCE_SCENES[
          mode
        ];

      for (const phase of PHASES) {
        const geometry =
          ROULETTE_PHASE_GEOMETRY[
            mode
          ][phase];

        expect(
          geometry.wheel.x,
        ).toBeGreaterThanOrEqual(0);
        expect(
          geometry.wheel.y,
        ).toBeGreaterThanOrEqual(0);
        expect(
          geometry.wheel.x +
            geometry.wheel.size,
        ).toBeLessThanOrEqual(
          scene.width,
        );
        expect(
          geometry.wheel.y +
            geometry.wheel.size,
        ).toBeLessThanOrEqual(
          scene.height,
        );

        const tableRight =
          geometry.table.x +
          (
            geometry.table.width +
            geometry.table.railWidth
          ) *
            geometry.table.scale;
        const tableBottom =
          geometry.table.y +
          geometry.table.height *
            geometry.table.scale;

        expect(
          geometry.table.x,
        ).toBeGreaterThanOrEqual(0);
        expect(
          geometry.table.y,
        ).toBeGreaterThanOrEqual(0);
        expect(tableRight).toBeLessThanOrEqual(
          scene.width + 0.001,
        );
        expect(tableBottom).toBeLessThanOrEqual(
          scene.height + 0.001,
        );
      }
    }
  });

  it("uses one immutable geometry per orientation and phase regardless of device resolution", () => {
    const portraitA =
      computeRouletteResponsiveLayout(
        390,
        844,
        "betting",
      );
    const portraitB =
      computeRouletteResponsiveLayout(
        430,
        932,
        "betting",
      );
    const landscapeA =
      computeRouletteResponsiveLayout(
        1024,
        768,
        "spinning",
      );
    const landscapeB =
      computeRouletteResponsiveLayout(
        1920,
        1080,
        "spinning",
      );

    expect(
      portraitA.geometry,
    ).toEqual(
      portraitB.geometry,
    );
    expect(
      landscapeA.geometry,
    ).toEqual(
      landscapeB.geometry,
    );
  });
});
