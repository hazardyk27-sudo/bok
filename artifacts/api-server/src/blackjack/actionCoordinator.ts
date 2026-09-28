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
import type {
  BlackjackPlayer,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { leaveBlackjackSeat, seatBlackjackPlayer } from "./participation";
import { BLACKJACK_BETTING_WINDOW_MS } from "./roundFlow";
import type { BlackjackReservationBook } from "./reservations";
import {
  applyBlackjackDisconnectedTurnPolicy,
  createBlackjackReconnectRegistry,
  disconnectBlackjackPlayerForReconnect,
  reconnectBlackjackPlayer,
  type BlackjackReconnectRegistry,
} from "./reconnect";
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

export type BlackjackReconnectCoordinatorResult = Readonly<{
  table: BlackjackTable;
  reconnectRegistry: BlackjackReconnectRegistry;
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackDisconnectedPolicyCoordinatorResult = Readonly<{
  table: BlackjackTable;
  reconnectRegistry: BlackjackReconnectRegistry;
  queueSequence: number;
  replayed: boolean;
  reason: "NONE" | "TURN_TIMEOUT" | "RECONNECT_GRACE_EXPIRED";
}>;

export type BlackjackSeatLeaveCoordinatorResult = Readonly<{
  table: BlackjackTable;
  queueSequence: number;
  replayed: boolean;
}>;

export type BlackjackSeatClaimCoordinatorResult = Readonly<{
  table: BlackjackTable;
  account: BlackjackCoordinatorAccount;
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

function nextBlackjackFreshRoundNumber(
  table: BlackjackTable,
  protocol: BlackjackActionProtocolState,
): number {
  let highest=table.round?.roundNumber ?? 0;
  const prefix=table.tableId+":round-";

  for(const receipt of protocol.receipts){
    const roundId=receipt.roundId;
    if(roundId===null || !roundId.startsWith(prefix)) continue;
    const suffix=roundId.slice(prefix.length);
    if(!/^\d+$/.test(suffix)) continue;
    const parsed=Number(suffix);
    if(
      Number.isSafeInteger(parsed) &&
      parsed>highest
    ){
      highest=parsed;
    }
  }

  const next=highest+1;
  if(!Number.isSafeInteger(next) || next<1){
    throw new RangeError(
      "Blackjack fresh roundNumber cannot advance safely",
    );
  }
  return next;
}


export class BlackjackPlayerActionCoordinator {
  private tableState: BlackjackTable;
  private protocolState: BlackjackActionProtocolState;
  private readonly accounts = new Map<string, BlackjackCoordinatorAccount>();
  private readonly bettingPositions = new Map<string, BlackjackBettingPosition>();
  private reconnectRegistry: BlackjackReconnectRegistry;
  private readonly queue: BlackjackActionQueue;
  private readonly minBetCents: number;
  private readonly maxBetCents: number | null;

  constructor(input: {
    table: BlackjackTable;
    accounts: readonly BlackjackCoordinatorAccount[];
    protocol?: BlackjackActionProtocolState;
    queue?: BlackjackActionQueue;
    bettingPositions?: readonly BlackjackBettingPosition[];
    reconnectRegistry?: BlackjackReconnectRegistry;
    bettingLimits?: Readonly<{
      minBetCents: number;
      maxBetCents: number | null;
    }>;
  }) {
    this.tableState = input.table;
    this.protocolState =
      input.protocol ?? createBlackjackActionProtocolState();
    this.queue = input.queue ?? createBlackjackActionQueue();
    this.reconnectRegistry =
      input.reconnectRegistry ?? createBlackjackReconnectRegistry();
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

  getReconnectRegistry(): BlackjackReconnectRegistry {
    return this.reconnectRegistry;
  }

  leaveSeat(
    input: {
      playerId: string;
      nowMs: number;
    },
  ): Promise<BlackjackSeatLeaveCoordinatorResult> {
    assertNowMs(input.nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const player=this.tableState.players.find(
        (candidate)=>candidate.playerId===input.playerId,
      );
      if(!player){
        return Object.freeze({
          table:this.tableState,
          queueSequence,
          replayed:true,
        });
      }

      if(
        this.tableState.phase!=="TABLE_IDLE" &&
        this.tableState.phase!=="BETTING" &&
        this.tableState.phase!=="ROUND_END"
      ){
        throw new Error(
          "Blackjack seat leave is allowed only at a safe table boundary",
        );
      }
      if(player.handIds.length>0){
        throw new Error("Blackjack player cannot leave with active hands");
      }

      const position=this.bettingPositions.get(player.playerId);
      const settledRoundPosition=
        this.tableState.phase==="ROUND_END" &&
        this.tableState.round!==null &&
        position?.roundId===this.tableState.round.roundId;
      if(
        position &&
        !settledRoundPosition &&
        (
          position.status!=="OPEN" ||
          getBlackjackBetTotalCents(position)>0
        )
      ){
        throw new Error(
          "Blackjack player cannot leave with an active wager",
        );
      }

      let table=leaveBlackjackSeat(this.tableState,{
        playerId:player.playerId,
        nowMs:input.nowMs,
      });
      this.bettingPositions.delete(player.playerId);
      this.accounts.delete(player.playerId);

      if(
        table.players.length===0 &&
        (
          table.phase==="TABLE_IDLE" ||
          table.phase==="BETTING" ||
          table.phase==="ROUND_END"
        )
      ){
        table=Object.freeze({
          ...table,
          phase:"TABLE_IDLE" as const,
          round:null,
        });
      }

      const committed=commitBlackjackServerEvent(table,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:input.nowMs,
      }).table;
      this.tableState=committed;

      return Object.freeze({
        table:committed,
        queueSequence,
        replayed:false,
      });
    });
  }

  claimSeat(
    input: {
      account: BlackjackCoordinatorAccount;
      sessionId: string;
      seatNumber: 1 | 2 | 3 | 4 | 5;
      nowMs: number;
      bettingWindowMs?: number;
    },
  ): Promise<BlackjackSeatClaimCoordinatorResult> {
    assertNowMs(input.nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const existing=this.tableState.players.find(
        (player)=>
          player.playerId===input.account.playerId ||
          player.userId===input.account.userId,
      );
      if(existing){
        if(
          existing.playerId===input.account.playerId &&
          existing.userId===input.account.userId &&
          existing.seatNumber===input.seatNumber
        ){
          const account=this.accounts.get(existing.playerId);
          if(!account){
            throw new Error("Blackjack seated player account is missing");
          }
          return Object.freeze({
            table:this.tableState,
            account,
            queueSequence,
            replayed:true,
          });
        }
        throw new Error("Blackjack identity is already seated");
      }

      if(
        this.tableState.phase!=="TABLE_IDLE" &&
        this.tableState.phase!=="BETTING" &&
        this.tableState.phase!=="ROUND_END"
      ){
        throw new Error(
          "Blackjack seat claim is allowed only at a safe table boundary",
        );
      }
      if(input.account.wallet.userId!==input.account.userId){
        throw new Error("Blackjack seat account wallet owner mismatch");
      }
      if(input.account.book.userId!==input.account.userId){
        throw new Error("Blackjack seat account reservation owner mismatch");
      }

      let table=seatBlackjackPlayer(this.tableState,{
        playerId:input.account.playerId,
        userId:input.account.userId,
        sessionId:input.sessionId,
        seatNumber:input.seatNumber,
      });

      if(table.phase==="TABLE_IDLE"){
        const bettingWindowMs=
          input.bettingWindowMs ?? BLACKJACK_BETTING_WINDOW_MS;
        if(
          !Number.isSafeInteger(bettingWindowMs) ||
          bettingWindowMs<=0
        ){
          throw new RangeError(
            "Blackjack bettingWindowMs must be a positive safe integer",
          );
        }
        const bettingClosesAtMs=input.nowMs+bettingWindowMs;
        if(!Number.isSafeInteger(bettingClosesAtMs)){
          throw new RangeError(
            "Blackjack initial betting deadline exceeds safe integer range",
          );
        }
        const roundNumber=nextBlackjackFreshRoundNumber(
          table,
          this.protocolState,
        );
        const round=Object.freeze({
          roundId:table.tableId+":round-"+roundNumber,
          roundNumber,
          phase:"BETTING" as const,
          activeSeatOrder:Object.freeze([]),
          hands:Object.freeze([]),
          dealer:Object.freeze({
            cards:Object.freeze([]),
            holeCardRevealed:false,
          }),
          currentTurn:null,
          startedAtMs:input.nowMs,
          bettingClosesAtMs,
          finishedAtMs:null,
        });
        const players=Object.freeze(
          table.players.map((player): BlackjackPlayer =>
            player.connected
              ? Object.freeze({
                  ...player,
                  status:"BETTING" as const,
                })
              : player,
          ),
        );
        table=Object.freeze({
          ...table,
          phase:"BETTING" as const,
          round,
          players,
          stateVersion:nextStateVersion(table.stateVersion),
        });
      }

      const committed=commitBlackjackServerEvent(table,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:input.nowMs,
      }).table;
      const account=freezeAccount(input.account);
      this.accounts.set(account.playerId,account);
      this.tableState=committed;

      return Object.freeze({
        table:committed,
        account,
        queueSequence,
        replayed:false,
      });
    });
  }

  pendingCount(): number {
    return this.queue.pendingCount();
  }

  activeCount(): number {
    return this.queue.activeCount();
  }

  disconnectPlayerForReconnect(
    playerId: string,
    nowMs: number,
  ): Promise<BlackjackReconnectCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const player=this.tableState.players.find(
        (candidate)=>candidate.playerId===playerId,
      );
      if(!player){
        throw new Error("Blackjack disconnect player is not seated");
      }
      if(!player.connected && player.status==="DISCONNECTED"){
        return Object.freeze({
          table:this.tableState,
          reconnectRegistry:this.reconnectRegistry,
          queueSequence,
          replayed:true,
        });
      }

      const result=disconnectBlackjackPlayerForReconnect(
        this.tableState,
        this.reconnectRegistry,
        { playerId, nowMs },
      );
      const committed=commitBlackjackServerEvent(result.table,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:nowMs,
      }).table;

      this.tableState=committed;
      this.reconnectRegistry=result.registry;
      return Object.freeze({
        table:committed,
        reconnectRegistry:this.reconnectRegistry,
        queueSequence,
        replayed:false,
      });
    });
  }

  reconnectPlayerSession(
    input: {
      playerId: string;
      userId: string;
      sessionId: string;
      nowMs: number;
    },
  ): Promise<BlackjackReconnectCoordinatorResult> {
    assertNowMs(input.nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const player=this.tableState.players.find(
        (candidate)=>candidate.playerId===input.playerId,
      );
      if(!player){
        throw new Error("Blackjack reconnect player is not seated");
      }
      if(player.connected && player.status!=="DISCONNECTED"){
        return Object.freeze({
          table:this.tableState,
          reconnectRegistry:this.reconnectRegistry,
          queueSequence,
          replayed:true,
        });
      }

      const result=reconnectBlackjackPlayer(
        this.tableState,
        this.reconnectRegistry,
        input,
      );
      const committed=commitBlackjackServerEvent(result.table,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:input.nowMs,
      }).table;

      this.tableState=committed;
      this.reconnectRegistry=result.registry;
      return Object.freeze({
        table:committed,
        reconnectRegistry:this.reconnectRegistry,
        queueSequence,
        replayed:false,
      });
    });
  }

  applyDisconnectedTurnPolicy(
    nowMs: number,
  ): Promise<BlackjackDisconnectedPolicyCoordinatorResult> {
    assertNowMs(nowMs);

    return this.queue.enqueue(({ queueSequence }) => {
      const result=applyBlackjackDisconnectedTurnPolicy(
        this.tableState,
        this.reconnectRegistry,
        nowMs,
      );

      if(!result.autoStood){
        return Object.freeze({
          table:this.tableState,
          reconnectRegistry:this.reconnectRegistry,
          queueSequence,
          replayed:true,
          reason:result.reason,
        });
      }

      const committed=commitBlackjackServerEvent(result.table,{
        type:"TABLE_STATE_COMMITTED",
        actionId:null,
        createdAtMs:nowMs,
      }).table;
      this.tableState=committed;
      this.reconnectRegistry=result.registry;

      return Object.freeze({
        table:committed,
        reconnectRegistry:this.reconnectRegistry,
        queueSequence,
        replayed:false,
        reason:result.reason,
      });
    });
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
