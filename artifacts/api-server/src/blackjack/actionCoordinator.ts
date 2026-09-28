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
import { playBlackjackDealerTurn } from "./dealer";
import { doubleBlackjackCurrentHand } from "./double";
import { hitBlackjackCurrentHand } from "./hit";
import { markBlackjackReshuffleAfterRound } from "./lifecycle";
import { commitBlackjackServerEvent } from "./eventStream";
import type { BlackjackShoe, BlackjackTable } from "./domain";
import type { BlackjackReservationBook } from "./reservations";
import {
  settleBlackjackRound,
  type BlackjackSettlementHandSummary,
} from "./settlement";
import { splitBlackjackCurrentHand } from "./split";
import {
  closeBlackjackBettingWindow,
  startBlackjackInitialDeal,
  startBlackjackNextBettingRound,
  type BlackjackRoundFlowAccount,
} from "./roundFlow";
import { standBlackjackCurrentHand } from "./stand";
import { applyBlackjackTurnTimeout } from "./turnEngine";
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

export type BlackjackTurnTimeoutCoordinatorResult = Readonly<{
  table: BlackjackTable;
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackDealerTurnCoordinatorResult = Readonly<{
  table: BlackjackTable;
  drawnCardIds: readonly string[];
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackSettlementCoordinatorResult = Readonly<{
  table: BlackjackTable;
  hands: readonly BlackjackSettlementHandSummary[];
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackNextBettingRoundCoordinatorResult = Readonly<{
  table: BlackjackTable;
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

function nextStateVersion(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Blackjack coordinator stateVersion cannot advance");
  }
  return value + 1;
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

  getAccounts(): readonly BlackjackCoordinatorAccount[] {
    return Object.freeze(Array.from(this.accounts.values()));
  }

  getBettingPositions(): readonly BlackjackBettingPosition[] {
    return Object.freeze(Array.from(this.bettingPositions.values()));
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

  runDealerTurn(
    nowMs: number,
  ): Promise<BlackjackDealerTurnCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const table=this.tableState;
      const round=table.round;

      if(
        (table.phase==="SETTLEMENT" || table.phase==="ROUND_END") &&
        round!==null &&
        table.phase===round.phase
      ){
        return Object.freeze({
          table,
          drawnCardIds:Object.freeze([]),
          queueSequence,
          replayed:true,
        });
      }

      if(
        table.phase!=="DEALER_TURN" ||
        round===null ||
        round.phase!=="DEALER_TURN"
      ){
        throw new Error(
          "Blackjack dealer runtime requires DEALER_TURN phase",
        );
      }

      const dealer=playBlackjackDealerTurn(round,table.shoe);
      const versioned: BlackjackTable=Object.freeze({
        ...table,
        phase:dealer.round.phase,
        round:dealer.round,
        shoe:dealer.shoe,
        stateVersion:nextStateVersion(table.stateVersion),
      });
      const committed=commitBlackjackServerEvent(versioned,{
        type:"ROUND_PHASE_CHANGED",
        actionId:null,
        createdAtMs:nowMs,
      }).table;

      this.tableState=committed;
      return Object.freeze({
        table:committed,
        drawnCardIds:Object.freeze(
          dealer.drawnCards.map((card)=>card.cardId),
        ),
        queueSequence,
        replayed:false,
      });
    });
  }

  settleCurrentRound(
    nowMs: number,
  ): Promise<BlackjackSettlementCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const table=this.tableState;
      const round=table.round;

      if(
        table.phase==="ROUND_END" &&
        round!==null &&
        round.phase==="ROUND_END" &&
        round.hands.every((hand)=>hand.status==="COMPLETE")
      ){
        return Object.freeze({
          table,
          hands:Object.freeze([]),
          queueSequence,
          replayed:true,
        });
      }

      if(
        table.phase!=="SETTLEMENT" ||
        round===null ||
        round.phase!=="SETTLEMENT"
      ){
        throw new Error(
          "Blackjack settlement runtime requires SETTLEMENT phase",
        );
      }

      const settled=settleBlackjackRound(
        round,
        Object.freeze(Array.from(this.accounts.values())),
        {
          transactionIdPrefix:
            "blackjack:" + table.tableId + ":settlement",
          nowMs,
        },
      );

      const players=Object.freeze(
        table.players.map((player)=>
          Object.freeze({
            ...player,
            status:
              player.status==="DISCONNECTED"
                ? "DISCONNECTED" as const
                : "SEATED_WAITING" as const,
            handIds:Object.freeze([]),
          }),
        ),
      );
      const shoe=markBlackjackReshuffleAfterRound(table.shoe);
      const versioned: BlackjackTable=Object.freeze({
        ...table,
        phase:"ROUND_END" as const,
        round:settled.round,
        players,
        shoe,
        stateVersion:nextStateVersion(table.stateVersion),
      });
      const committed=commitBlackjackServerEvent(versioned,{
        type:"ROUND_PHASE_CHANGED",
        actionId:null,
        createdAtMs:nowMs,
      }).table;

      this.tableState=committed;
      for(const account of settled.accounts){
        this.accounts.set(
          account.playerId,
          freezeAccount(account),
        );
      }

      return Object.freeze({
        table:committed,
        hands:settled.hands,
        queueSequence,
        replayed:false,
      });
    });
  }

  timeoutCurrentTurn(
    nowMs: number,
  ): Promise<BlackjackTurnTimeoutCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const table=this.tableState;
      const round=table.round;
      if(
        table.phase!=="PLAYER_TURNS" ||
        round===null ||
        round.phase!=="PLAYER_TURNS" ||
        round.currentTurn===null
      ){
        throw new Error(
          "Blackjack turn timeout requires an active PLAYER_TURNS state",
        );
      }

      if(nowMs < round.currentTurn.endsAtMs){
        return Object.freeze({
          table,
          queueSequence,
          replayed:true,
        });
      }

      const timedOutRound=applyBlackjackTurnTimeout(round,nowMs);
      const versioned: BlackjackTable=Object.freeze({
        ...table,
        phase:timedOutRound.phase,
        round:timedOutRound,
        stateVersion:nextStateVersion(table.stateVersion),
      });
      const committed=commitBlackjackServerEvent(versioned,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:nowMs,
      }).table;

      this.tableState=committed;
      return Object.freeze({
        table:committed,
        queueSequence,
        replayed:false,
      });
    });
  }

  startNextBettingRound(
    nowMs: number,
    input: {
      bettingWindowMs?: number;
      createFreshShoe?: () => BlackjackShoe;
    } = {},
  ): Promise<BlackjackNextBettingRoundCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const result=startBlackjackNextBettingRound({
        table:this.tableState,
        bettingPositions:Object.freeze(
          Array.from(this.bettingPositions.values()),
        ),
        nowMs,
        bettingWindowMs:input.bettingWindowMs,
        createFreshShoe:input.createFreshShoe,
      });

      this.tableState=result.table;
      if(!result.replayed){
        this.bettingPositions.clear();
        for(const position of result.bettingPositions){
          this.bettingPositions.set(position.playerId,position);
        }
      }

      return Object.freeze({
        table:this.tableState,
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
