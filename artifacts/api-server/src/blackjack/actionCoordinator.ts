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
import {
  clearBlackjackBet,
  createBlackjackBettingPosition,
  getBlackjackBetTotalCents,
  markBlackjackBetReady,
  placeBlackjackBetChip,
  type BlackjackBettingPosition,
} from "./betting";
import { BLACKJACK_BASE_CHIP_VALUES_CENTS } from "./chips";
import { doubleBlackjackCurrentHand } from "./double";
import { hitBlackjackCurrentHand } from "./hit";
import { commitBlackjackServerEvent } from "./eventStream";
import type { BlackjackShoe, BlackjackTable } from "./domain";
import type { BlackjackReservationBook } from "./reservations";
import { splitBlackjackCurrentHand } from "./split";
import {
  closeBlackjackBettingWindow,
  startBlackjackInitialDeal,
  type BlackjackRoundFlowAccount,
} from "./roundFlow";
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

type BettingActionEnvelope = BlackjackActionEnvelope & Readonly<{
  type: "PLACE_BET" | "CLEAR_BET" | "READY";
  roundId: string;
  handId: null;
  seatNumber: 1 | 2 | 3 | 4 | 5;
}>;

export type BlackjackCoordinatedPlayerAction = Readonly<{
  envelope: PlayerActionEnvelope;
  nowMs: number;
  reservationId?: string;
  reserveTransactionId?: string;
}>;

export type BlackjackCoordinatedBettingAction = Readonly<{
  envelope: BettingActionEnvelope;
  nowMs: number;
  chipValueCents?: number;
  reservationId?: string;
  reserveTransactionId?: string;
  clearTransactionId?: string;
}>;

export type BlackjackCoordinatedAction = Readonly<{
  envelope: PlayerActionEnvelope | BettingActionEnvelope;
  nowMs: number;
  chipValueCents?: number;
  reservationId?: string;
  reserveTransactionId?: string;
  clearTransactionId?: string;
}>;

export type BlackjackCoordinatorBettingState = Readonly<{
  roundId: string;
  status: BlackjackBettingPosition["status"];
  betCents: number;
  availableBalanceCents: number;
}>;

export type BlackjackBettingWindowCloseCoordinatorResult = Readonly<{
  table: BlackjackTable;
  participants: readonly Readonly<{
    playerId: string;
    seatNumber: 1 | 2 | 3 | 4 | 5;
    betCents: number;
  }>[];
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackInitialDealCoordinatorResult = Readonly<{
  table: BlackjackTable;
  participants: readonly Readonly<{
    playerId: string;
    seatNumber: 1 | 2 | 3 | 4 | 5;
    betCents: number;
  }>[];
  dealEvents: readonly Readonly<{
    sequence: number;
    recipient: "PLAYER" | "DEALER";
    pass: 1 | 2;
    cardId: string;
    faceUp: boolean;
    seatNumber?: 1 | 2 | 3 | 4 | 5;
  }>[];
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackCoordinatorResult = Readonly<{
  table: BlackjackTable;
  protocol: BlackjackActionProtocolState;
  account: BlackjackCoordinatorAccount;
  queueSequence: number;
  replayed: boolean;
  betting: BlackjackCoordinatorBettingState | null;
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
  private readonly bettingPositions = new Map<string, BlackjackBettingPosition>();
  private readonly queue: BlackjackActionQueue;
  private readonly minBetCents: number;
  private readonly maxBetCents: number | null;

  constructor(input: {
    table: BlackjackTable;
    accounts: readonly BlackjackCoordinatorAccount[];
    protocol?: BlackjackActionProtocolState;
    queue?: BlackjackActionQueue;
    bettingPositions?: readonly BlackjackBettingPosition[];
    bettingLimits?: Readonly<{
      minBetCents: number;
      maxBetCents: number | null;
    }>;
  }) {
    this.tableState = input.table;
    this.protocolState =
      input.protocol ?? createBlackjackActionProtocolState();
    this.queue = input.queue ?? createBlackjackActionQueue();
    this.minBetCents =
      input.bettingLimits?.minBetCents ?? BLACKJACK_BASE_CHIP_VALUES_CENTS[0];
    this.maxBetCents = input.bettingLimits?.maxBetCents ?? null;

    if (!Number.isSafeInteger(this.minBetCents) || this.minBetCents <= 0) {
      throw new RangeError("Blackjack coordinator minBetCents must be positive");
    }
    if (
      this.maxBetCents !== null &&
      (!Number.isSafeInteger(this.maxBetCents) ||
        this.maxBetCents < this.minBetCents)
    ) {
      throw new RangeError("Blackjack coordinator maxBetCents is invalid");
    }

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

    for (const position of input.bettingPositions ?? []) {
      if (this.bettingPositions.has(position.playerId)) {
        throw new Error("Blackjack coordinator contains duplicate betting position");
      }
      this.bettingPositions.set(position.playerId, position);
    }
  }

  getTable(): BlackjackTable {
    return this.tableState;
  }

  getProtocol(): BlackjackActionProtocolState {
    return this.protocolState;
  }

  getBettingPosition(playerId: string): BlackjackBettingPosition | null {
    return this.bettingPositions.get(playerId) ?? null;
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

  closeBettingWindow(
    nowMs: number,
  ): Promise<BlackjackBettingWindowCloseCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const result=closeBlackjackBettingWindow({
        table:this.tableState,
        accounts:Object.freeze(
          Array.from(this.accounts.values()) as BlackjackRoundFlowAccount[],
        ),
        positions:Object.freeze(Array.from(this.bettingPositions.values())),
        nowMs,
      });

      this.tableState=result.table;
      for(const account of result.accounts){
        this.accounts.set(account.playerId,freezeAccount(account));
      }
      for(const position of result.positions){
        this.bettingPositions.set(position.playerId,position);
      }

      return Object.freeze({
        table:this.tableState,
        participants:result.participants,
        queueSequence,
        replayed:result.replayed,
      });
    });
  }

  startInitialDeal(
    nowMs: number,
    createFreshShoe?: () => BlackjackShoe,
  ): Promise<BlackjackInitialDealCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const result=startBlackjackInitialDeal({
        table:this.tableState,
        accounts:Object.freeze(
          Array.from(this.accounts.values()) as BlackjackRoundFlowAccount[],
        ),
        positions:Object.freeze(Array.from(this.bettingPositions.values())),
        nowMs,
        createFreshShoe,
      });

      this.tableState=result.table;
      for(const account of result.accounts){
        this.accounts.set(account.playerId,freezeAccount(account));
      }

      return Object.freeze({
        table:this.tableState,
        participants:result.participants,
        dealEvents:result.dealEvents,
        queueSequence,
        replayed:result.replayed,
      });
    });
  }

  submit(
    action: BlackjackCoordinatedAction,
  ): Promise<BlackjackCoordinatorResult> {
    assertNowMs(action.nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const pending = {
        account: null as BlackjackCoordinatorAccount | null,
        bettingPosition: null as BlackjackBettingPosition | null,
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
          let players = table.players;

          const requireBettingPosition = (): BlackjackBettingPosition => {
            if (table.phase !== "BETTING" || round.phase !== "BETTING") {
              throw new Error("Blackjack betting action requires BETTING phase");
            }
            if (round.bettingClosesAtMs === null) {
              throw new Error("Blackjack betting action requires betting deadline");
            }

            const existing = this.bettingPositions.get(
              action.envelope.actorPlayerId,
            );
            if (existing) {
              if (
                existing.roundId !== round.roundId ||
                existing.seatNumber !== action.envelope.seatNumber
              ) {
                throw new Error("Blackjack betting position targets stale round");
              }
              return existing;
            }

            return createBlackjackBettingPosition({
              roundId: round.roundId,
              playerId: action.envelope.actorPlayerId,
              userId: account.userId,
              seatNumber: action.envelope.seatNumber,
              bettingClosesAtMs: round.bettingClosesAtMs,
              minBetCents: this.minBetCents,
              maxBetCents: this.maxBetCents,
            });
          };

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

            case "PLACE_BET": {
              if (
                action.chipValueCents === undefined ||
                !Number.isSafeInteger(action.chipValueCents) ||
                action.chipValueCents <= 0
              ) {
                throw new RangeError(
                  "Blackjack coordinator chipValueCents must be positive",
                );
              }
              const result = placeBlackjackBetChip(
                account.wallet,
                account.book,
                requireBettingPosition(),
                {
                  reservationId: assertNonEmptyId(
                    "reservationId",
                    action.reservationId,
                  ),
                  reserveTransactionId: assertNonEmptyId(
                    "reserveTransactionId",
                    action.reserveTransactionId,
                  ),
                  chipValueCents: action.chipValueCents,
                  nowMs: action.nowMs,
                },
              );
              pending.account = freezeAccount({
                ...account,
                wallet: result.wallet,
                book: result.book,
              });
              pending.bettingPosition = result.position;
              break;
            }

            case "CLEAR_BET": {
              const result = clearBlackjackBet(
                account.wallet,
                account.book,
                requireBettingPosition(),
                {
                  clearTransactionId: assertNonEmptyId(
                    "clearTransactionId",
                    action.clearTransactionId,
                  ),
                  nowMs: action.nowMs,
                },
              );
              pending.account = freezeAccount({
                ...account,
                wallet: result.wallet,
                book: result.book,
              });
              pending.bettingPosition = result.position;
              break;
            }

            case "READY": {
              const position = markBlackjackBetReady(
                requireBettingPosition(),
                action.nowMs,
              );
              pending.bettingPosition = position;
              players = Object.freeze(
                table.players.map((player) =>
                  player.playerId === action.envelope.actorPlayerId
                    ? Object.freeze({ ...player, status: "READY" as const })
                    : player,
                ),
              );
              break;
            }
          }

          return Object.freeze({
            ...table,
            phase: round.phase,
            round,
            shoe,
            players,
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
      if (!committed.replayed && pending.bettingPosition !== null) {
        this.bettingPositions.set(
          pending.bettingPosition.playerId,
          pending.bettingPosition,
        );
      }

      const finalAccount=this.getAccount(action.envelope.actorPlayerId);
      const finalPosition=this.bettingPositions.get(
        action.envelope.actorPlayerId,
      );
      const betting =
        finalPosition && finalPosition.roundId === this.tableState.round?.roundId
          ? Object.freeze({
              roundId: finalPosition.roundId,
              status: finalPosition.status,
              betCents: getBlackjackBetTotalCents(finalPosition),
              availableBalanceCents: finalAccount.wallet.availableBalanceCents,
            })
          : null;

      return Object.freeze({
        table: this.tableState,
        protocol: this.protocolState,
        account: finalAccount,
        queueSequence,
        replayed: committed.replayed,
        betting,
      });
    });
  }
}
