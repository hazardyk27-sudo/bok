import { describe, expect, it, vi } from "vitest";
import { CancelableCompletionRegistry } from "./CancelableCompletionRegistry";

describe("CancelableCompletionRegistry", () => {
  it("completes registered work once and returns to baseline", () => {
    const registry = new CancelableCompletionRegistry();
    const completion = vi.fn();
    const complete = registry.track(completion);

    expect(registry.size).toBe(1);
    complete();
    complete();

    expect(completion).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });

  it("does not accumulate work across repeated round resets", () => {
    const registry = new CancelableCompletionRegistry();
    const completions = Array.from({ length: 100 }, () => vi.fn());

    completions.forEach((completion) => {
      registry.track(completion);
      registry.track(completion);
      registry.completeAll();
      expect(registry.size).toBe(0);
    });

    completions.forEach((completion) => expect(completion).toHaveBeenCalledTimes(2));
  });
});