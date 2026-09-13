import { describe, expect, it } from "vitest";
import { simulate } from "./Simulator";

describe("simulator", () => {
  it("is reproducible for a seed", () => {
    expect(simulate(1000, "123")).toEqual(simulate(1000, "123"));
    expect(simulate(1000, "123").totalReturnCents).not.toBe(simulate(1000, "124").totalReturnCents);
  });
});