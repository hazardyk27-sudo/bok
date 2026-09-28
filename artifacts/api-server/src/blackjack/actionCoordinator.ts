import {
  applyBlackjackVersionedAction,
  createBlackjackActionProtocolState,
  type BlackjackActionEnvelope,
  type BlackjackActionProtocolState,
} from "./actionProtocol";
import {
  createBlackjackActionQueue,
  type BlackjackActionQueue,
} from "./actionQueue";
import { doubleBlackjackCurrentHand } from "./double";
import { hitBlackjackCurrentHand } from "./hit";
import { commitBlackjackServerEvent } from "./eventStream";
import type { BlackjackTable } from "./domain";
import type { BlackjackReservationBook } from "./reservations";
import { splitBlackjackCurrentHand } from "./split";
import { standBlackjackCurrentHand } from "./stand";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export type BlackjackCoordinatorAccount = Readonly<{
  playerId: string;
  userId: string;
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
}>;

type PlayerActionEnvelope = BlackjackActionEnvelope & Readonly<{
  type: "HIT" | "STAND" | "DOUBLE" | "SPLIT";
  roundId: string;
  handId: string;
  seatNumber: 1 | 2 | 3 | 4 | 5;
}>;

export type BlackjackCoordinatedPlayerAction = Readonly<{
  envelope: PlayerActionEnvelope;
  nowMs: number;
  reservationId?: string;
  reserveTransactionId?: string;
}>;

export type BlackjackCoordinatorResult = Readonly<{
  table: BlackjackTable;
  protocol: BlackjackActionProtocolState;
  account: BlackjackCoordinatorAccount;
  queueSequence: number;
  replayed: boolean;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack coordinator nowMs must be a non-negative safe integer",
    );
  }
}

function assertNonEmptyId(label: string, value: string | undefined): string {
  if (value === undefined || !value.trim()) {
    throw new RangeError(
      "Blackjack coordinator " + label + " must be a non-empty string",
    );
  }
  return value;
}

function freezeAccount(
  account: BlackjackCoordinatorAccount,
): BlackjackCoordinatorAccount {
  return Object.freeze({ ...account });
}

export class BlackjackPlayerActionCoordinator {
  private tableState: BlackjackTable;
  private protocolState: BlackjackActionProtocolState;
  private readonly accounts = new Map<string, BlackjackCoordinatorAccount>();
  private readonly queue: BlackjackActionQueue;

  constructor(input: {
    table: BlackjackTable;
    accounts: readonly BlackjackCoordinatorAccount[];
    protocol?: BlackjackActionProtocolState;
    queue?: BlackjackActionQueue;
  }) {
    this.tableState = input.table;
    this.protocolState =
      input.protocol ?? createBlackjackActionProtocolState();
    this.queue = input.queue ?? createBlackjackActionQueue();

    for (const account of input.accounts) {
      if (!account.playerId.trim() || !account.userId.trim()) {
        throw new RangeError(
          "Blackjack coordinator account IDs must be non-empty",
        );
      }
      if (this.accounts.has(account.playerId)) {
        throw new Error(
          "Blackjack coordinator contains duplicate player account",
        );
      }
      if (account.wallet.userId !== account.userId) {
        throw new Error(
          "Blackjack coordinator wallet owner does not match account",
        );
      }
      if (account.book.userId !== account.userId) {
        throw new Error(
          "Blackjack coordinator reservation owner does not match account",
        );
      }
      this.accounts.set(account.playerId, freezeAccount(account));
    }
  }

  getTable(): BlackjackTable {
    return this.tableState;
  }

  getProtocol(): BlackjackActionProtocolState {
    return this.protocolState;
  }

  getAccount(playerId: string): BlackjackCoordinatorAccount {
    const account = this.accounts.get(playerId);
    if (!account) {
      throw new Error("Blackjack coordinator account does not exist");
    }
    return account;
  }

  pendingCount(): number {
    return this.queue.pendingCount();
  }

  activeCount(): number {
    return this.queue.activeCount();
  }

  submit(
    action: BlackjackCoordinatedPlayerAction,
  ): Promise<BlackjackCoordinatorResult> {
    assertNowMs(action.nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const pending = {
        account: null as BlackjackCoordinatorAccount | null,
      };

      const committed = applyBlackjackVersionedAction(
        this.tableState,
        this.protocolState,
        action.envelope,
        (table) => {
          if (table.round === null) {
            throw new Error(
              "Blackjack coordinated player action requires an active round",
            );
          }

          const account = this.getAccount(action.envelope.actorPlayerId);
          let round = table.round;
          let shoe = table.shoe;

          switch (action.envelope.type) {
            case "HIT": {
              const result = hitBlackjackCurrentHand(round, shoe, {
                expectedHandId: action.envelope.handId,
                expectedSeatNumber: action.envelope.seatNumber,
                nowMs: action.nowMs,
              });
              round = result.round;
              shoe = result.shoe;
              break;
            }

            case "STAND": {
              round = standBlackjackCurrentHand(round, {
                expectedHandId: action.envelope.handId,
                expectedSeatNumber: action.envelope.seatNumber,
                nowMs: action.nowMs,
              }).round;
              break;
            }

            case "DOUBLE": {
              const result = doubleBlackjackCurrentHand(
                round,
                shoe,
                account.wallet,
                account.book,
                {
                  expectedHandId: action.envelope.handId,
                  expectedSeatNumber: action.envelope.seatNumber,
                  userId: account.userId,
                  reservationId: assertNonEmptyId(
                    "reservationId",
                    action.reservationId,
                  ),
                  reserveTransactionId: assertNonEmptyId(
                    "reserveTransactionId",
                    action.reserveTransactionId,
                  ),
                  nowMs: action.nowMs,
                },
              );
              round = result.round;
              shoe = result.shoe;
              pending.account = freezeAccount({
                ...account,
                wallet: result.wallet,
                book: result.book,
              });
              break;
            }

            case "SPLIT": {
              const result = splitBlackjackCurrentHand(
                round,
                shoe,
                account.wallet,
                account.book,
                {
                  expectedHandId: action.envelope.handId,
                  expectedSeatNumber: action.envelope.seatNumber,
                  userId: account.userId,
                  reservationId: assertNonEmptyId(
                    "reservationId",
                    action.reservationId,
                  ),
                  reserveTransactionId: assertNonEmptyId(
                    "reserveTransactionId",
                    action.reserveTransactionId,
                  ),
                  nowMs: action.nowMs,
                },
              );
              round = result.round;
              shoe = result.shoe;
              pending.account = freezeAccount({
                ...account,
                wallet: result.wallet,
                book: result.book,
              });
              break;
            }
          }

          return Object.freeze({
            ...table,
            phase: round.phase,
            round,
            shoe,
          });
        },
      );

      const tableAfterEvent = committed.replayed
        ? committed.table
        : commitBlackjackServerEvent(committed.table, {
            type: "TABLE_STATE_COMMITTED",
            actionId: action.envelope.actionId,
            createdAtMs: action.nowMs,
          }).table;

      this.tableState = tableAfterEvent;
      this.protocolState = committed.protocol;

      const pendingAccount = pending.account;
      if (!committed.replayed && pendingAccount !== null) {
        this.accounts.set(
          pendingAccount.playerId,
          pendingAccount,
        );
      }

      return Object.freeze({
        table: this.tableState,
        protocol: this.protocolState,
        account: this.getAccount(action.envelope.actorPlayerId),
        queueSequence,
        replayed: committed.replayed,
      });
    });
  }
}
