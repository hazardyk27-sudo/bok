import {
  describe,
  expect,
  it,
} from "vitest";
import {
  didRouletteChipInteractionSucceed,
  getRouletteChipFeedbackPulses,
} from "./chipFeedback";

describe("roulette chip feedback", () => {
  it("uses a compact double-clack for a placed chip", () => {
    const pulses =
      getRouletteChipFeedbackPulses(
        "place",
        3,
      );

    expect(pulses).toHaveLength(2);
    expect(pulses[0].delayMs).toBe(0);
    expect(pulses[1].delayMs).toBeGreaterThan(0);
    expect(pulses[0].durationMs).toBeLessThanOrEqual(40);
  });

  it("varies repeated placement timbre without changing timing", () => {
    const first =
      getRouletteChipFeedbackPulses(
        "place",
        0,
      );
    const second =
      getRouletteChipFeedbackPulses(
        "place",
        1,
      );

    expect(first[0].centerHz).not.toBe(
      second[0].centerHz,
    );
    expect(first[0].delayMs).toBe(
      second[0].delayMs,
    );
    expect(first[1].delayMs).toBe(
      second[1].delayMs,
    );
  });

  it("plays placement/action feedback only after the rendered bet state changes", () => {
    expect(
      didRouletteChipInteractionSucceed(
        "place",
        25,
        35,
      ),
    ).toBe(true);
    expect(
      didRouletteChipInteractionSucceed(
        "place",
        25,
        25,
      ),
    ).toBe(false);

    expect(
      didRouletteChipInteractionSucceed(
        "undo",
        35,
        25,
      ),
    ).toBe(true);
    expect(
      didRouletteChipInteractionSucceed(
        "clear",
        35,
        0,
      ),
    ).toBe(true);

    expect(
      didRouletteChipInteractionSucceed(
        "double",
        25,
        50,
      ),
    ).toBe(true);
    expect(
      didRouletteChipInteractionSucceed(
        "rebet",
        0,
        25,
      ),
    ).toBe(true);
  });

  it("only clicks chip selection when the selected state actually changes", () => {
    expect(
      didRouletteChipInteractionSucceed(
        "select",
        0,
        0,
        false,
        true,
      ),
    ).toBe(true);
    expect(
      didRouletteChipInteractionSucceed(
        "select",
        0,
        0,
        true,
        true,
      ),
    ).toBe(false);
  });
});
