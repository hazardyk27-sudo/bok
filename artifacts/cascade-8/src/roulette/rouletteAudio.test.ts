import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getReferenceHit,
  getReferenceMix,
} from "./rouletteAudio";

describe("roulette reference-video audio mapping", () => {
  it("drives the real wheel loop from rotor speed", () => {
    const slow =
      getReferenceMix({
        rotorAngularVelocity: 1,
        ballAngularVelocity: 0,
        ballPhase: "settled",
      });
    const fast =
      getReferenceMix({
        rotorAngularVelocity: 7,
        ballAngularVelocity: 0,
        ballPhase: "settled",
      });

    expect(
      fast.wheelGain,
    ).toBeGreaterThan(
      slow.wheelGain,
    );
    expect(
      fast.wheelPlaybackRate,
    ).toBeGreaterThan(
      slow.wheelPlaybackRate,
    );
  });

  it("keeps the real ball rolling loop on the outer track and fades it during descent", () => {
    const track =
      getReferenceMix({
        rotorAngularVelocity: 2,
        ballAngularVelocity: 18,
        ballPhase: "track",
      });
    const descent =
      getReferenceMix({
        rotorAngularVelocity: 2,
        ballAngularVelocity: 18,
        ballPhase: "descent",
      });
    const pocket =
      getReferenceMix({
        rotorAngularVelocity: 2,
        ballAngularVelocity: 18,
        ballPhase: "pocket-entry",
      });

    expect(
      track.trackGain,
    ).toBeGreaterThan(
      descent.trackGain,
    );
    expect(
      descent.trackGain,
    ).toBeGreaterThan(0);
    expect(
      pocket.trackGain,
    ).toBe(0);
  });

  it("uses reference-video slices for physical contacts", () => {
    const deflector =
      getReferenceHit({
        kind: "deflector-hit",
        timeMs: 1000,
        intensity: 0.8,
        collisionIndex: 0,
      });
    const fret =
      getReferenceHit({
        kind: "fret-hit",
        timeMs: 1200,
        intensity: 0.5,
        collisionIndex: 1,
      });
    const pocket =
      getReferenceHit({
        kind: "pocket-bounce",
        timeMs: 1400,
        intensity: 0.4,
        collisionIndex: 2,
      });
    const settle =
      getReferenceHit({
        kind: "settled",
        timeMs: 5000,
        intensity: 1,
        pocketIndex: 8,
      });

    expect(deflector).not.toBeNull();
    expect(fret).not.toBeNull();
    expect(pocket).not.toBeNull();
    expect(settle).not.toBeNull();

    expect(
      deflector!.offset,
    ).toBe(0);
    expect(
      fret!.offset,
    ).toBeGreaterThan(0.1);
    expect(
      pocket!.offset,
    ).toBeGreaterThan(0.3);
    expect(
      settle!.offset,
    ).toBeGreaterThan(0.9);
  });

  it("does not play one-shots for loop control events", () => {
    expect(
      getReferenceHit({
        kind: "track-roll-start",
        timeMs: 0,
        intensity: 1,
      }),
    ).toBeNull();

    expect(
      getReferenceHit({
        kind: "rotor-roll-stop",
        timeMs: 8000,
        intensity: 0,
      }),
    ).toBeNull();
  });
});
