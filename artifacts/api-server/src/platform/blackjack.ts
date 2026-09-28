import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool, type PoolClient } from "@workspace/db";
import {
  BlackjackJournalRepository,
  BlackjackSnapshotRepository,
  createBlackjackReservationBook,
  createBlackjackWalletLedgerState,
  createShuffledBlackjackShoe,
  initializeAndAttachBlackjackServerRuntime,
  parseBlackjackDurableSnapshot,
  type BlackjackAttachedServerRuntime,
  type BlackjackCoordinatorAccount,
  type BlackjackDurableSnapshot,
  type BlackjackRealtimeIdentity,
  type BlackjackSnapshotDatabase,
} from "../blackjack";
import { SESSION_COOKIE } from "./session";
import { INITIAL_SHARED_BALANCE_CENTS } from "./wallet";

export const BLACKJACK_MAIN_TABLE_ID = "blackjack-main-table" as const;
const SESSION_PATTERN = /^[a-f0-9-]{20,80}$/i;

type Queryable = Readonly<{
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: readonly Record<string, unknown>[] }>>;
}>;

function databaseFrom(queryable: Queryable): BlackjackSnapshotDatabase {
  return Object.freeze({
    query: (sql, params = []) => queryable.query(sql, params),
  });
}

function poolQueryable(): Queryable {
  return Object.freeze({
    query: async (sql, params = []) => {
      const result = await pool.query(sql, [...params]);
      return Object.freeze({
        rows: result.rows as readonly Record<string, unknown>[],
      });
    },
  });
}

function clientQueryable(client: PoolClient): Queryable {
  return Object.freeze({
    query: async (sql, params = []) => {
      const result = await client.query(sql, [...params]);
      return Object.freeze({
        rows: result.rows as readonly Record<string, unknown>[],
      });
    },
  });
}

function validSessionId(value: string | undefined): value is string {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}

function parseCookieHeader(
  header: string | undefined,
  cookieName: string,
): string | null {
  if (!header) return null;

  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    const name = trimmed.slice(0, equalsAt);
    if (name !== cookieName) continue;
    const raw = trimmed.slice(equalsAt + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return null;
}

function readRequestSessionId(request: IncomingMessage): string | null {
  const sessionId = parseCookieHeader(
    request.headers.cookie,
    SESSION_COOKIE,
  );
  return validSessionId(sessionId ?? undefined) ? sessionId : null;
}

function getOrCreateHttpSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (validSessionId(existing)) return existing;

  const sessionId = randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return sessionId;
}

async function ensureSharedWallet(sessionId: string): Promise<number> {
  const result = await pool.query<{ balance_cents: number }>(
    `INSERT INTO shared_wallets
       (session_id, balance_cents, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (session_id) DO UPDATE
       SET balance_cents = shared_wallets.balance_cents
     RETURNING balance_cents`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );
  return Number(result.rows[0]?.balance_cents ?? INITIAL_SHARED_BALANCE_CENTS);
}

export function resolveBlackjackRealtimeIdentity(
  request: IncomingMessage,
): BlackjackRealtimeIdentity | null {
  const sessionId = readRequestSessionId(request);
  if (sessionId === null) return null;

  return Object.freeze({
    userId: sessionId,
    playerId: "blackjack-player:" + sessionId,
    sessionId,
  });
}

export async function loadBlackjackSeatAccount(
  identity: BlackjackRealtimeIdentity,
): Promise<BlackjackCoordinatorAccount> {
  if (identity.userId !== identity.sessionId) {
    throw new Error("Blackjack identity user/session mismatch");
  }

  const balanceCents = await ensureSharedWallet(identity.sessionId);

  return Object.freeze({
    playerId: identity.playerId,
    userId: identity.userId,
    wallet: createBlackjackWalletLedgerState({
      userId: identity.userId,
      totalBalanceCents: balanceCents,
    }),
    book: createBlackjackReservationBook(identity.userId),
  });
}

class SharedBlackjackSnapshotRepository {
  async load(tableId: string): Promise<BlackjackDurableSnapshot | null> {
    return new BlackjackSnapshotRepository(
      databaseFrom(poolQueryable()),
    ).load(tableId);
  }

  async save(
    snapshot: BlackjackDurableSnapshot,
    expectedPreviousStateVersion: number | null,
  ): Promise<BlackjackDurableSnapshot> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const queryable = clientQueryable(client);
      const database = databaseFrom(queryable);
      const repository = new BlackjackSnapshotRepository(database);

      const previousRow = await client.query<{ snapshot: unknown }>(
        `SELECT snapshot
           FROM blackjack_table_snapshots
          WHERE table_id = $1
          FOR UPDATE`,
        [snapshot.tableId],
      );
      const previous = previousRow.rows[0]
        ? parseBlackjackDurableSnapshot(previousRow.rows[0].snapshot)
        : null;

      const saved = await repository.save(
        snapshot,
        expectedPreviousStateVersion,
      );

      const previousWallets = new Map(
        previous?.payload.wallets.map((wallet) => [
          wallet.userId,
          wallet,
        ] as const) ?? [],
      );

      for (const wallet of saved.payload.wallets) {
        const prior = previousWallets.get(wallet.userId);

        if (!prior) {
          const shared = await client.query<{ balance_cents: number }>(
            `SELECT balance_cents
               FROM shared_wallets
              WHERE session_id = $1
              FOR UPDATE`,
            [wallet.userId],
          );
          const current = shared.rows[0];
          if (!current) {
            throw new Error(
              "BLACKJACK_SHARED_WALLET_MISSING",
            );
          }
          if (Number(current.balance_cents) !== wallet.availableBalanceCents) {
            throw new Error(
              "BLACKJACK_SHARED_WALLET_CHANGED",
            );
          }
          continue;
        }

        if (
          prior.availableBalanceCents ===
          wallet.availableBalanceCents
        ) {
          continue;
        }

        const updated = await client.query<{ balance_cents: number }>(
          `UPDATE shared_wallets
              SET balance_cents = $2,
                  updated_at = now()
            WHERE session_id = $1
              AND balance_cents = $3
            RETURNING balance_cents`,
          [
            wallet.userId,
            wallet.availableBalanceCents,
            prior.availableBalanceCents,
          ],
        );

        if (!updated.rows[0]) {
          throw new Error(
            "BLACKJACK_SHARED_WALLET_CHANGED",
          );
        }
      }

      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const blackjackPlatformRouter: IRouter = Router();

blackjackPlatformRouter.get(
  "/blackjack/session",
  async (req, res) => {
    try {
      const sessionId = getOrCreateHttpSessionId(req, res);
      await ensureSharedWallet(sessionId);
      res.json({ ready: true });
    } catch {
      res.status(503).json({ error: "BLACKJACK_SESSION_UNAVAILABLE" });
    }
  },
);

export async function attachBlackjackPlatformRuntime(
  server: Server,
): Promise<BlackjackAttachedServerRuntime> {
  const snapshotRepository = new SharedBlackjackSnapshotRepository();
  const journalRepository = new BlackjackJournalRepository(
    databaseFrom(poolQueryable()),
  );

  const createFreshShoe = () =>
    createShuffledBlackjackShoe({
      shoeId: randomUUID(),
      createdAtMs: Date.now(),
    });

  return initializeAndAttachBlackjackServerRuntime({
    server,
    tableId: BLACKJACK_MAIN_TABLE_ID,
    snapshotRepository,
    journalRepository,
    recoveredAtMs: Date.now(),
    nowMs: Date.now,
    resolveIdentity: resolveBlackjackRealtimeIdentity,
    loadSeatAccount: loadBlackjackSeatAccount,
    createInitialShoe: createFreshShoe,
    createFreshShoe,
  });
}
