import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getContinuousAudioProfile,
  getImpactAudioProfile,
} from "./rouletteAudio";

describe("roulette audio profile", () => {
  it("raises rotor mechanical sound with wheel speed", () => {
    const slow =
      getContinuousAudioProfile({
        rotorAngularVelocity: 1,
        ballAngularVelocity: 0,
        ballPhase: "settled",
      });
    const fast =
      getContinuousAudioProfile({
        rotorAngularVelocity: 7,
        ballAngularVelocity: 0,
        ballPhase: "settled",
      });

    expect(
      fast.rotorGain,
    ).toBeGreaterThan(
      slow.rotorGain,
    );
    expect(
      fast.rotorFrequency,
    ).toBeGreaterThan(
      slow.rotorFrequency,
    );
  });

  it("only keeps continuous ball rolling on the outer track", () => {
    const track =
      getContinuousAudioProfile({
        rotorAngularVelocity: 2,
        ballAngularVelocity: 14,
        ballPhase: "track",
      });
    const pocket =
      getContinuousAudioProfile({
        rotorAngularVelocity: 2,
        ballAngularVelocity: 14,
        ballPhase: "pocket-entry",
      });

    expect(
      track.trackGain,
    ).toBeGreaterThan(0);
    expect(
      pocket.trackGain,
    ).toBe(0);
  });

  it("maps real collision categories to distinct transient profiles", () => {
    const deflector =
      getImpactAudioProfile({
        kind: "deflector-hit",
        timeMs: 1000,
        intensity: 0.8,
        collisionIndex: 1,
      });
    const fret =
      getImpactAudioProfile({
        kind: "fret-hit",
        timeMs: 1200,
        intensity: 0.5,
        collisionIndex: 2,
      });
    const settle =
      getImpactAudioProfile({
        kind: "settled",
        timeMs: 5000,
        intensity: 1,
        pocketIndex: 8,
      });

    expect(deflector).not.toBeNull();
    expect(fret).not.toBeNull();
    expect(settle).not.toBeNull();
    expect(
      deflector!.frequency,
    ).toBeGreaterThan(
      fret!.frequency,
    );
    expect(
      settle!.durationSeconds,
    ).toBeGreaterThan(
      fret!.durationSeconds,
    );
  });

  it("does not generate transient sounds for loop control events", () => {
    expect(
      getImpactAudioProfile({
        kind: "track-roll-start",
        timeMs: 0,
        intensity: 1,
      }),
    ).toBeNull();

    expect(
      getImpactAudioProfile({
        kind: "rotor-roll-stop",
        timeMs: 8000,
        intensity: 0,
      }),
    ).toBeNull();
  });
});
