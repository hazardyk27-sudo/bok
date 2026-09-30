import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

const enabled =
  process.env.IDLE_DB_INTEGRATION === "1";

describe.skipIf(!enabled)(
  "canonical Idle PostgreSQL integration",
  () => {
    let server: import("node:http").Server;
    let baseUrl = "";

    beforeAll(async () => {
      const appModule = await import("../app");
      server = appModule.default.listen(
        0,
        "127.0.0.1",
      );
      await once(server, "listening");

      const address = server.address();
      if (
        !address
        || typeof address === "string"
      ) {
        throw new Error(
          "IDLE_TEST_SERVER_ADDRESS_UNAVAILABLE",
        );
      }

      baseUrl =
        `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>(
        (resolve, reject) => {
          server.close((error) =>
            error ? reject(error) : resolve(),
          );
        },
      );
    });

    it("serves canonical Stadium + wallet + market state from /api/idle/state", async () => {
      const response = await fetch(
        `${baseUrl}/api/idle/state`,
      );

      expect(response.status).toBe(200);
      expect(
        response.headers.get("content-type"),
      ).toContain("application/json");
      expect(
        response.headers.get("set-cookie"),
      ).toMatch(
        /(?:game_session|roulette_session)=/,
      );

      const body = await response.json() as {
        sessionId: string;
        wallet: {
          sessionId: string;
          balanceCents: number;
        };
        stadium: {
          stadiumLevel: number;
          ownedSeats: number;
          speedLevel: number;
          storageLevel: number;
          storedMicroTickets: number;
        };
        market: {
          priceMicrodollars: number;
        };
      };

      expect(body.sessionId)
        .toMatch(/^[a-f0-9-]{20,80}$/);
      expect(body.wallet.sessionId)
        .toBe(body.sessionId);
      expect(body.wallet.balanceCents)
        .toBe(100_000);
      expect(body.stadium).toMatchObject({
        stadiumLevel: 1,
        ownedSeats: 0,
        speedLevel: 1,
        storageLevel: 1,
        storedMicroTickets: 0,
      });
      expect(body.market.priceMicrodollars)
        .toBeGreaterThan(0);
      expect(body).not.toHaveProperty(
        "businesses",
      );
    });

    it("serves two fresh browser sessions independently", async () => {
      const first = await fetch(
        `${baseUrl}/api/idle/state`,
      );
      const second = await fetch(
        `${baseUrl}/api/idle/state`,
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const firstBody = await first.json() as {
        sessionId: string;
      };
      const secondBody = await second.json() as {
        sessionId: string;
      };

      expect(firstBody.sessionId)
        .toMatch(/^[a-f0-9-]{20,80}$/);
      expect(secondBody.sessionId)
        .toMatch(/^[a-f0-9-]{20,80}$/);
      expect(firstBody.sessionId)
        .not.toBe(secondBody.sessionId);
    });

    it("buys seats idempotently through the canonical Stadium endpoint", async () => {
      const stateResponse = await fetch(
        `${baseUrl}/api/idle/state`,
      );
      const cookie =
        stateResponse.headers
          .get("set-cookie")
          ?.split(";")[0];

      expect(cookie).toBeTruthy();

      const idempotencyKey = randomUUID();
      const request = () => fetch(
        `${baseUrl}/api/idle/stadium/seats/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie ?? "",
          },
          body: JSON.stringify({
            quantity: 10,
            idempotencyKey,
          }),
        },
      );

      const first = await request();
      expect(first.status).toBe(200);

      const firstBody = await first.json() as {
        purchasedSeats: number;
        costCents: number;
        balanceCents: number;
        replayed: boolean;
        stadium: {
          ownedSeats: number;
        };
      };

      expect(firstBody).toMatchObject({
        purchasedSeats: 10,
        costCents: 1_000,
        balanceCents: 99_000,
        replayed: false,
      });
      expect(firstBody.stadium.ownedSeats)
        .toBe(10);

      const replay = await request();
      expect(replay.status).toBe(200);

      const replayBody =
        await replay.json() as typeof firstBody;

      expect(replayBody).toMatchObject({
        purchasedSeats: 10,
        costCents: 1_000,
        balanceCents: 99_000,
        replayed: true,
      });
      expect(replayBody.stadium.ownedSeats)
        .toBe(10);
    });

    it("keeps the canonical state snapshot internally consistent after a mutation", async () => {
      const stateResponse = await fetch(
        `${baseUrl}/api/idle/state`,
      );
      const cookie =
        stateResponse.headers
          .get("set-cookie")
          ?.split(";")[0];

      const purchase = await fetch(
        `${baseUrl}/api/idle/stadium/seats/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie ?? "",
          },
          body: JSON.stringify({
            quantity: 5,
            idempotencyKey: randomUUID(),
          }),
        },
      );

      expect(purchase.status).toBe(200);

      const snapshot = await fetch(
        `${baseUrl}/api/idle/state`,
        {
          headers: { Cookie: cookie ?? "" },
        },
      );

      expect(snapshot.status).toBe(200);
      const body = await snapshot.json() as {
        wallet: { balanceCents: number };
        stadium: { ownedSeats: number };
      };

      expect(body.wallet.balanceCents)
        .toBe(99_500);
      expect(body.stadium.ownedSeats)
        .toBe(5);
    });

    it("does not expose retired direct-cash mutation endpoints", async () => {
      const retiredEndpoints = [
        "/api/idle/collect-all",
        "/api/idle/businesses/stadium/collect",
        "/api/idle/businesses/stadium/upgrade",
        "/api/idle/businesses/stadium/vault/upgrade",
      ];

      for (const endpoint of retiredEndpoints) {
        const response = await fetch(
          `${baseUrl}${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              idempotencyKey: randomUUID(),
            }),
          },
        );

        expect(response.status).toBe(404);
      }
    });
  },
);
