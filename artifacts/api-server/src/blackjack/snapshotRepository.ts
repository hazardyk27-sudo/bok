import { createHash, randomUUID } from "node:crypto";
import {
  parseBlackjackDurableSnapshot,
  verifyBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
} from "./snapshotState";

export const BLACKJACK_RUNTIME_LEASE_MS = 6_000 as const;
export const BLACKJACK_RUNTIME_LEASE_HEARTBEAT_MS = 2_000 as const;
export const BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_DEVELOPMENT = 10 as const;
export const BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION = 100 as const;

const BLACKJACK_RUNTIME_AUTHORITY_KEY = "_runtimeAuthority" as const;
const BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_ENV =
  "BLACKJACK_RUNTIME_AUTHORITY_PRIORITY" as const;
const DEFAULT_RUNTIME_ROLE =
  process.env.NODE_ENV === "production" ? "production" : "development";
const DEFAULT_RUNTIME_OWNER_ID =
  `blackjack-runtime:${DEFAULT_RUNTIME_ROLE}:${process.pid}:${randomUUID()}`;

export type BlackjackSnapshotQueryResult = Readonly<{
  rows: readonly Record<string, unknown>[];
}>;

export type BlackjackSnapshotDatabase = Readonly<{
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<BlackjackSnapshotQueryResult>;
}>;

export type BlackjackRuntimeAuthorityLease = Readonly<{
  ownerId: string;
  fencingToken: string;
  leaseUntilMs: number;
  priority: number;
  checksum: string;
}>;

type BlackjackSnapshotRepositoryOptions = Readonly<{
  ownerId?: string;
  leaseDurationMs?: number;
  nowMs?: () => number;
  authorityPriority?: number;
}>;

type LocalLeaseEpoch = Readonly<{
  fencingToken: string;
  leaseUntilMs: number;
}>;

const localLeaseEpochs = new Map<string, LocalLeaseEpoch>();

export class BlackjackSnapshotConflictError extends Error {
  readonly code = "BLACKJACK_SNAPSHOT_CONFLICT";

  constructor(tableId: string) {
    super("Blackjack snapshot compare-and-swap conflict for table " + tableId);
    this.name = "BlackjackSnapshotConflictError";
  }
}

export class BlackjackRuntimeLeaseConflictError extends Error {
  readonly code = "BLACKJACK_RUNTIME_LEASE_CONFLICT";

  constructor(
    readonly tableId: string,
    readonly ownerId: string,
    readonly leaseUntilMs: number,
    readonly fencingToken: string,
    readonly ownerPriority = 0,
  ) {
    super(
      "Blackjack runtime lease is owned by another writer for table " +
        tableId +
        " (owner=" +
        ownerId +
        ", priority=" +
        ownerPriority +
        ")",
    );
    this.name = "BlackjackRuntimeLeaseConflictError";
  }
}

function assertExpectedVersion(value: number | null): void {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new RangeError(
      "Blackjack expectedPreviousStateVersion must be null or a non-negative safe integer",
    );
  }
}

function assertLeaseDurationMs(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Blackjack runtime lease duration must be a positive safe integer",
    );
  }
}

function assertNowMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack runtime lease clock must return a non-negative safe integer",
    );
  }
}

function assertOwnerId(value: string): void {
  if (!value.trim()) {
    throw new RangeError("Blackjack runtime ownerId must be non-empty");
  }
}

function assertAuthorityPriority(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack runtime authority priority must be a non-negative safe integer",
    );
  }
}

function resolveDefaultRuntimeAuthorityPriority(): number {
  const explicit = process.env[BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_ENV]?.trim();
  if (explicit) {
    if (!/^\d+$/.test(explicit)) {
      throw new Error(
        "BLACKJACK_RUNTIME_AUTHORITY_PRIORITY must be a non-negative integer",
      );
    }
    const priority = Number(explicit);
    assertAuthorityPriority(priority);
    return priority;
  }

  return process.env.NODE_ENV === "production"
    ? BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION
    : BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_DEVELOPMENT;
}

const DEFAULT_RUNTIME_AUTHORITY_PRIORITY =
  resolveDefaultRuntimeAuthorityPriority();

function parseDatabaseNowMs(value: unknown): number {
  const text =
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "string"
      ? String(value)
      : "";
  if (!/^\d+$/.test(text)) {
    throw new Error("Blackjack database lease clock is invalid");
  }
  const nowMs = Number(text);
  assertNowMs(nowMs);
  return nowMs;
}

function legacyAuthorityChecksum(input: {
  tableId: string;
  ownerId: string;
  fencingToken: string;
  leaseUntilMs: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.tableId,
        input.ownerId,
        input.fencingToken,
        input.leaseUntilMs,
      ]),
    )
    .digest("hex");
}

function authorityChecksum(input: {
  tableId: string;
  ownerId: string;
  fencingToken: string;
  leaseUntilMs: number;
  priority: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.tableId,
        input.ownerId,
        input.fencingToken,
        input.leaseUntilMs,
        input.priority,
      ]),
    )
    .digest("hex");
}

function buildAuthorityLease(input: {
  tableId: string;
  ownerId: string;
  fencingToken: string;
  leaseUntilMs: number;
  priority: number;
}): BlackjackRuntimeAuthorityLease {
  return Object.freeze({
    ownerId: input.ownerId,
    fencingToken: input.fencingToken,
    leaseUntilMs: input.leaseUntilMs,
    priority: input.priority,
    checksum: authorityChecksum(input),
  });
}

function parseAuthorityLease(
  tableId: string,
  snapshotValue: unknown,
): BlackjackRuntimeAuthorityLease | null {
  if (typeof snapshotValue !== "object" || snapshotValue === null) return null;
  const raw = (snapshotValue as Record<string, unknown>)[
    BLACKJACK_RUNTIME_AUTHORITY_KEY
  ];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    throw new Error("Blackjack runtime authority lease shape is invalid");
  }

  const candidate = raw as Partial<BlackjackRuntimeAuthorityLease>;
  if (
    typeof candidate.ownerId !== "string" ||
    !candidate.ownerId.trim() ||
    typeof candidate.fencingToken !== "string" ||
    !candidate.fencingToken.trim() ||
    typeof candidate.leaseUntilMs !== "number" ||
    !Number.isSafeInteger(candidate.leaseUntilMs) ||
    candidate.leaseUntilMs < 0 ||
    typeof candidate.checksum !== "string"
  ) {
    throw new Error("Blackjack runtime authority lease shape is invalid");
  }

  const isLegacy = candidate.priority === undefined;
  const priority = isLegacy ? 0 : candidate.priority;
  if (
    typeof priority !== "number" ||
    !Number.isSafeInteger(priority) ||
    priority < 0
  ) {
    throw new Error("Blackjack runtime authority priority is invalid");
  }

  const expected = isLegacy
    ? legacyAuthorityChecksum({
        tableId,
        ownerId: candidate.ownerId,
        fencingToken: candidate.fencingToken,
        leaseUntilMs: candidate.leaseUntilMs,
      })
    : authorityChecksum({
        tableId,
        ownerId: candidate.ownerId,
        fencingToken: candidate.fencingToken,
        leaseUntilMs: candidate.leaseUntilMs,
        priority,
      });
  if (candidate.checksum !== expected) {
    throw new Error("Blackjack runtime authority lease checksum mismatch");
  }

  return Object.freeze({
    ownerId: candidate.ownerId,
    fencingToken: candidate.fencingToken,
    leaseUntilMs: candidate.leaseUntilMs,
    priority,
    checksum: candidate.checksum,
  });
}

function snapshotWithAuthority(
  snapshot: BlackjackDurableSnapshot,
  authority: BlackjackRuntimeAuthorityLease,
): Record<string, unknown> {
  return {
    ...snapshot,
    [BLACKJACK_RUNTIME_AUTHORITY_KEY]: authority,
  };
}

function localLeaseKey(ownerId: string, tableId: string): string {
  return ownerId + "\u0000" + tableId;
}

export function releaseBlackjackRuntimeLeaseEpoch(
  tableId: string,
  ownerId = DEFAULT_RUNTIME_OWNER_ID,
): void {
  localLeaseEpochs.delete(localLeaseKey(ownerId, tableId));
}

export class BlackjackSnapshotRepository {
  private readonly ownerId: string;
  private readonly leaseDurationMs: number;
  private readonly injectedNowMs: (() => number) | null;
  private readonly authorityPriority: number;

  constructor(
    private readonly database: BlackjackSnapshotDatabase,
    options: BlackjackSnapshotRepositoryOptions = {},
  ) {
    this.ownerId = options.ownerId ?? DEFAULT_RUNTIME_OWNER_ID;
    this.leaseDurationMs =
      options.leaseDurationMs ?? BLACKJACK_RUNTIME_LEASE_MS;
    this.injectedNowMs = options.nowMs ?? null;
    this.authorityPriority =
      options.authorityPriority ?? DEFAULT_RUNTIME_AUTHORITY_PRIORITY;
    assertOwnerId(this.ownerId);
    assertLeaseDurationMs(this.leaseDurationMs);
    assertAuthorityPriority(this.authorityPriority);
  }

  private async currentLeaseTimeMs(): Promise<number> {
    if (this.injectedNowMs !== null) {
      const nowMs = this.injectedNowMs();
      assertNowMs(nowMs);
      return nowMs;
    }

    const result = await this.database.query(
      `SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
    );
    return parseDatabaseNowMs(result.rows[0]?.now_ms);
  }

  private candidateAuthority(
    tableId: string,
    nowMs: number,
  ): BlackjackRuntimeAuthorityLease {
    const key = localLeaseKey(this.ownerId, tableId);
    const previous = localLeaseEpochs.get(key);
    const previousStillLocal =
      previous !== undefined && previous.leaseUntilMs > nowMs;
    const fencingToken = previousStillLocal
      ? previous.fencingToken
      : randomUUID();
    const leaseUntilMs = Math.max(
      nowMs + this.leaseDurationMs,
      previousStillLocal ? previous.leaseUntilMs : 0,
    );
    return buildAuthorityLease({
      tableId,
      ownerId: this.ownerId,
      fencingToken,
      leaseUntilMs,
      priority: this.authorityPriority,
    });
  }

  private confirmLocalLease(
    tableId: string,
    authority: BlackjackRuntimeAuthorityLease,
  ): void {
    localLeaseEpochs.set(
      localLeaseKey(this.ownerId, tableId),
      Object.freeze({
        fencingToken: authority.fencingToken,
        leaseUntilMs: authority.leaseUntilMs,
      }),
    );
  }

  private async loadRaw(tableId: string): Promise<Readonly<{
    snapshot: BlackjackDurableSnapshot;
    authority: BlackjackRuntimeAuthorityLease | null;
  }> | null> {
    const result = await this.database.query(
      `SELECT snapshot
         FROM blackjack_table_snapshots
        WHERE table_id = $1
        LIMIT 1`,
      [tableId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const snapshot = parseBlackjackDurableSnapshot(row.snapshot);
    const authority = parseAuthorityLease(tableId, row.snapshot);
    return Object.freeze({ snapshot, authority });
  }

  private throwConflictFromCurrent(
    tableId: string,
    nowMs: number,
    attemptedFencingToken: string,
    current: Readonly<{
      snapshot: BlackjackDurableSnapshot;
      authority: BlackjackRuntimeAuthorityLease | null;
    }> | null,
  ): never {
    const authority = current?.authority ?? null;
    if (
      authority !== null &&
      authority.leaseUntilMs > nowMs &&
      authority.priority >= this.authorityPriority &&
      (
        authority.ownerId !== this.ownerId ||
        authority.fencingToken !== attemptedFencingToken
      )
    ) {
      throw new BlackjackRuntimeLeaseConflictError(
        tableId,
        authority.ownerId,
        authority.leaseUntilMs,
        authority.fencingToken,
        authority.priority,
      );
    }
    throw new BlackjackSnapshotConflictError(tableId);
  }

  async load(tableId: string): Promise<BlackjackDurableSnapshot | null> {
    if (!tableId.trim()) {
      throw new RangeError("Blackjack tableId must be a non-empty string");
    }
    return (await this.loadRaw(tableId))?.snapshot ?? null;
  }

  async save(
    snapshot: BlackjackDurableSnapshot,
    expectedPreviousStateVersion: number | null,
  ): Promise<BlackjackDurableSnapshot> {
    verifyBlackjackDurableSnapshot(snapshot);
    assertExpectedVersion(expectedPreviousStateVersion);

    if (
      expectedPreviousStateVersion !== null &&
      snapshot.stateVersion < expectedPreviousStateVersion
    ) {
      throw new RangeError(
        "Blackjack snapshot stateVersion cannot move backwards",
      );
    }

    const nowMs = await this.currentLeaseTimeMs();
    const authority = this.candidateAuthority(snapshot.tableId, nowMs);
    const storedSnapshot = snapshotWithAuthority(snapshot, authority);
    const commonParams = [
      snapshot.tableId,
      snapshot.schemaVersion,
      snapshot.stateVersion,
      snapshot.eventSequence,
      snapshot.payload.table.phase,
      JSON.stringify(storedSnapshot),
      snapshot.checksum,
      new Date(snapshot.savedAtMs),
    ] as const;

    const result =
      expectedPreviousStateVersion === null
        ? await this.database.query(
            `INSERT INTO blackjack_table_snapshots
               (table_id, schema_version, state_version, event_sequence, phase,
                snapshot, checksum, saved_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now())
             ON CONFLICT (table_id) DO NOTHING
             RETURNING snapshot`,
            commonParams,
          )
        : await this.database.query(
            `UPDATE blackjack_table_snapshots
                SET schema_version = $2,
                    state_version = $3,
                    event_sequence = $4,
                    phase = $5,
                    snapshot = $6::jsonb,
                    checksum = $7,
                    saved_at = $8,
                    updated_at = now()
              WHERE table_id = $1
                AND state_version = $9
                AND (
                  snapshot->'_runtimeAuthority' IS NULL
                  OR (
                    snapshot->'_runtimeAuthority'->>'ownerId' = $10
                    AND snapshot->'_runtimeAuthority'->>'fencingToken' = $12
                  )
                  OR COALESCE(
                    (snapshot->'_runtimeAuthority'->>'leaseUntilMs')::bigint,
                    0
                  ) <= $11
                  OR COALESCE(
                    (snapshot->'_runtimeAuthority'->>'priority')::bigint,
                    0
                  ) < $13::bigint
                )
              RETURNING snapshot`,
            [
              ...commonParams,
              expectedPreviousStateVersion,
              this.ownerId,
              nowMs,
              authority.fencingToken,
              this.authorityPriority,
            ],
          );

    const row = result.rows[0];
    if (!row) {
      const current = await this.loadRaw(snapshot.tableId);
      this.throwConflictFromCurrent(
        snapshot.tableId,
        nowMs,
        authority.fencingToken,
        current,
      );
    }

    const saved = parseBlackjackDurableSnapshot(row.snapshot);
    const savedAuthority = parseAuthorityLease(snapshot.tableId, row.snapshot);
    if (
      savedAuthority === null ||
      savedAuthority.ownerId !== this.ownerId ||
      savedAuthority.fencingToken !== authority.fencingToken ||
      savedAuthority.priority !== this.authorityPriority
    ) {
      throw new Error("Blackjack runtime authority lease confirmation failed");
    }
    this.confirmLocalLease(snapshot.tableId, savedAuthority);
    return saved;
  }
}
