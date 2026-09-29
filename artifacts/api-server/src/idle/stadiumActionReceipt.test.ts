import { describe, expect, it } from "vitest";
import {
  reserveStadiumActionReceipt,
} from "./stadiumActionReceipt";

type QueryResult = {
  rows: any[];
};

function fakeClient(results: QueryResult[]) {
  const sql: string[] = [];
  const params: unknown[][] = [];

  return {
    sql,
    params,
    client: {
      async query(
        statement: string,
        values: unknown[] = [],
      ) {
        sql.push(statement);
        params.push(values);
        const next = results.shift();
        if (!next) {
          throw new Error("UNEXPECTED_FAKE_QUERY");
        }
        return next;
      },
    },
  };
}

describe("Stadium action receipt reservation", () => {
  it("creates a globally unique receipt reservation on the first request", async () => {
    const fake = fakeClient([
      { rows: [{ id: "receipt" }] },
    ]);

    await expect(reserveStadiumActionReceipt(
      fake.client as any,
      {
        sessionId: "session-a",
        actionType: "SEAT_PURCHASE",
        idempotencyKey: "key-1",
        requestedQuantity: 10,
      },
    )).resolves.toEqual({ created: true });

    expect(fake.sql).toHaveLength(1);
    expect(fake.sql[0]).toContain(
      "ON CONFLICT (idempotency_key) DO NOTHING",
    );
  });

  it("locks the committed receipt row before accepting an exact replay", async () => {
    const fake = fakeClient([
      { rows: [] },
      {
        rows: [{
          session_id: "session-a",
          action_type: "TICKET_SALE",
          requested_quantity: 25,
        }],
      },
    ]);

    await expect(reserveStadiumActionReceipt(
      fake.client as any,
      {
        sessionId: "session-a",
        actionType: "TICKET_SALE",
        idempotencyKey: "key-2",
        requestedQuantity: 25,
      },
    )).resolves.toEqual({ created: false });

    expect(fake.sql).toHaveLength(2);
    expect(fake.sql[1]).toContain("FOR UPDATE");
  });

  it("rejects same-key reuse across sessions, action types, or quantities", async () => {
    for (const existing of [
      {
        session_id: "session-b",
        action_type: "SEAT_PURCHASE",
        requested_quantity: 10,
      },
      {
        session_id: "session-a",
        action_type: "TICKET_SALE",
        requested_quantity: 10,
      },
      {
        session_id: "session-a",
        action_type: "SEAT_PURCHASE",
        requested_quantity: 11,
      },
    ]) {
      const fake = fakeClient([
        { rows: [] },
        { rows: [existing] },
      ]);

      await expect(reserveStadiumActionReceipt(
        fake.client as any,
        {
          sessionId: "session-a",
          actionType: "SEAT_PURCHASE",
          idempotencyKey: "same-key",
          requestedQuantity: 10,
        },
      )).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
    }
  });

  it("preserves null quantity semantics for upgrade actions", async () => {
    const exact = fakeClient([
      { rows: [] },
      {
        rows: [{
          session_id: "session-a",
          action_type: "SPEED_UPGRADE",
          requested_quantity: null,
        }],
      },
    ]);

    await expect(reserveStadiumActionReceipt(
      exact.client as any,
      {
        sessionId: "session-a",
        actionType: "SPEED_UPGRADE",
        idempotencyKey: "upgrade-key",
      },
    )).resolves.toEqual({ created: false });

    const malformed = fakeClient([
      { rows: [] },
      {
        rows: [{
          session_id: "session-a",
          action_type: "SPEED_UPGRADE",
          requested_quantity: 0,
        }],
      },
    ]);

    await expect(reserveStadiumActionReceipt(
      malformed.client as any,
      {
        sessionId: "session-a",
        actionType: "SPEED_UPGRADE",
        idempotencyKey: "upgrade-key",
      },
    )).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("fails closed if the conflicting receipt cannot be loaded", async () => {
    const fake = fakeClient([
      { rows: [] },
      { rows: [] },
    ]);

    await expect(reserveStadiumActionReceipt(
      fake.client as any,
      {
        sessionId: "session-a",
        actionType: "STORAGE_UPGRADE",
        idempotencyKey: "missing-key",
      },
    )).rejects.toThrow("IDLE_STADIUM_RECEIPT_MISSING");
  });
});
