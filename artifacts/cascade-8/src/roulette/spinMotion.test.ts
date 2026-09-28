import { describe, expect, it } from "vitest";
import {
  ROTOR_SPIN_PROFILE,
  createRotorSpin,
  getRotorSpinDurationMs,
  getRotorSpinRevolutions,
  sampleRotorSpin,
} from "./spinMotion";

describe("roulette rotor spin motion", () => {
  it("creates a deterministic drag-driven spin without a target pocket", () => {
    const spin = createRotorSpin(0, 1);

    expect(spin.initialAngularVelocity).toBe(
      ROTOR_SPIN_PROFILE.initialAngularVelocity,
    );
    expect(spin.dragPerSecond).toBe(ROTOR_SPIN_PROFILE.dragPerSecond);
    expect(spin.stopAngularVelocity).toBe(
      ROTOR_SPIN_PROFILE.stopAngularVelocity,
    );
    expect(spin.durationMs).toBeGreaterThan(11000);
    expect(spin.durationMs).toBeLessThan(11400);
    expect(getRotorSpinRevolutions(spin)).toBeGreaterThan(3.4);
    expect(getRotorSpinRevolutions(spin)).toBeLessThan(3.7);
  });

  it("slows monotonically and stops at the calculated duration", () => {
    const spin = createRotorSpin(0.4, 1);
    const early = sampleRotorSpin(spin, 1000);
    const middle = sampleRotorSpin(spin, spin.durationMs / 2);
    const end = sampleRotorSpin(spin, spin.durationMs);

    expect(early.angularVelocity).toBeGreaterThan(middle.angularVelocity);
    expect(middle.angularVelocity).toBeGreaterThan(0);
    expect(early.angle).toBeGreaterThan(spin.startAngle);
    expect(middle.angle).toBeGreaterThan(early.angle);
    expect(end.done).toBe(true);
    expect(end.progress).toBe(1);
    expect(end.angularVelocity).toBe(0);
    expect(end.angle).toBeGreaterThan(middle.angle);
  });

  it("supports the opposite wheel direction without changing the profile", () => {
    const clockwise = createRotorSpin(1.2, 1);
    const counterClockwise = createRotorSpin(1.2, -1);
    const elapsed = 2500;

    const a = sampleRotorSpin(clockwise, elapsed);
    const b = sampleRotorSpin(counterClockwise, elapsed);

    expect(a.angle - clockwise.startAngle).toBeCloseTo(
      -(b.angle - counterClockwise.startAngle),
    );
    expect(a.angularVelocity).toBeCloseTo(b.angularVelocity);
  });

  it("returns zero duration for invalid physical parameters", () => {
    expect(getRotorSpinDurationMs(0, 0.4, 0.1)).toBe(0);
    expect(getRotorSpinDurationMs(10, 0, 0.1)).toBe(0);
    expect(getRotorSpinDurationMs(10, 0.4, 10)).toBe(0);
  });
});
