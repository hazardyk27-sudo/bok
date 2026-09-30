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
    rows: [
      {
        schema_ready: true,
      },
    ],
    rowCount: 1,
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

    expect(
      query,
    ).toHaveBeenCalledTimes(1);

    const sql =
      String(
        query.mock.calls[0]?.[0] ??
          "",
      );

    expect(
      sql,
    ).toContain(
      "information_schema.columns",
    );
    expect(
      sql,
    ).not.toMatch(
      /CREATE|ALTER|DROP|TRUNCATE/i,
    );

    await ensureRouletteGlobalTableStorage();

    expect(
      query,
    ).toHaveBeenCalledTimes(1);
  });
});
