import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  query,
} = vi.hoisted(() => ({
  query: vi.fn(async () => ({
    rows: [],
    rowCount: 0,
  })),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query,
  },
}));

import {
  ensureRouletteGlobalTableStorage,
} from "./globalTableStore";

describe("roulette global storage bootstrap", () => {
  beforeEach(() => {
    query.mockClear();
  });

  it("runs schema bootstrap only once after the first successful initialization", async () => {
    const first =
      ensureRouletteGlobalTableStorage();
    const second =
      ensureRouletteGlobalTableStorage();

    expect(second).toBe(first);

    await Promise.all([
      first,
      second,
    ]);

    const bootstrapQueryCount =
      query.mock.calls.length;

    expect(
      bootstrapQueryCount,
    ).toBeGreaterThan(1);

    await ensureRouletteGlobalTableStorage();

    expect(
      query,
    ).toHaveBeenCalledTimes(
      bootstrapQueryCount,
    );
  });
});
