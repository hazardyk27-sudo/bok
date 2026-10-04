import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getAudibleRouletteChipPulse,
} from "./chipFeedbackV2";

describe("roulette chip feedback v2", () => {
  it("raises low chip feedback gains into an audible range", () => {
    const pulse =
      getAudibleRouletteChipPulse({
        delayMs: 0,
        durationMs: 34,
        centerHz: 2180,
        q: 2.6,
        noiseGain: 0.058,
        bodyHz: 470,
        bodyGain: 0.025,
      });

    expect(pulse.noiseGain).toBeGreaterThan(0.2);
    expect(pulse.bodyGain).toBeGreaterThanOrEqual(0.08);
    expect(pulse.centerHz).toBe(2180);
    expect(pulse.bodyHz).toBe(470);
  });

  it("caps boosted gains before they can clip badly", () => {
    const pulse =
      getAudibleRouletteChipPulse({
        delayMs: 0,
        durationMs: 20,
        centerHz: 2600,
        q: 2.6,
        noiseGain: 1,
        bodyHz: 600,
        bodyGain: 1,
      });

    expect(pulse.noiseGain).toBe(0.3);
    expect(pulse.bodyGain).toBe(0.16);
  });
});
