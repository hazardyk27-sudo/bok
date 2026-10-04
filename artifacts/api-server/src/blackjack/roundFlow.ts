import {
  expireBlackjackOpenBet,
  bindBlackjackBetPositionToHand,
  getInitialDealParticipantFromBet,
  lockBlackjackReadyBet,
  type BlackjackBettingPosition,
} from "./betting";
import type {
  BlackjackPlayer,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { commitBlackjackServerEvent } from "./eventStream";
import {
  dealInitialBlackjackCards,
  type BlackjackInitialDealEvent,
  type BlackjackInitialDealParticipant,
} from "./initialDeal";
import type { BlackjackReservationBook } from "./reservations";
import {
  prepareBlackjackShoeBeforeRound,
  shouldReshuffleBlackjackBeforeRound,
} from "./lifecycle";

export const BLACKJACK_BETTING_WINDOW_MS = 10_000 as const;
const BLACKJACK_MAX_INITIAL_DEAL_CARDS = 12 as const;
import { startBlackjackPlayerTurns } from "./turnEngine";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export type BlackjackRoundFlowAccount = Readonly<{
  playerId: string;
  userId: string;
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
}>;

export type BlackjackBettingWindowCloseResult = Readonly<{
  table: BlackjackTable;
  accounts: readonly BlackjackRoundFlowAccount[];
  positions: readonly BlackjackBettingPosition[];
  participants: readonly BlackjackInitialDealParticipant[];
  replayed: boolean;
}>;

export type BlackjackInitialDealFlowResult = Readonly<{
  table: BlackjackTable;
  accounts: readonly BlackjackRoundFlowAccount[];
  participants: readonly BlackjackInitialDealParticipant[];
  dealEvents: readonly BlackjackInitialDealEvent[];
  replayed: boolean;
}>;

export type BlackjackNextBettingRoundResult = Readonly<{
  table: BlackjackTable;
  bettingPositions: readonly BlackjackBettingPosition[];
  replayed: boolean;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack round flow nowMs must be a non-negative safe integer",
    );
  }
}

function nextStateVersion(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Blackjack round flow stateVersion cannot advance");
  }
  return value + 1;
}

function freezeAccount(
  account: BlackjackRoundFlowAccount,
): BlackjackRoundFlowAccount {
  return Object.freeze({ ...account });
}

function currentLockedParticipants(
  roundId: string,
  positions: readonly BlackjackBettingPosition[],
): readonly BlackjackInitialDealParticipant[] {
  return Object.freeze(
    positions
      .filter(
        (position) =>
          position.roundId === roundId && position.status === "LOCKED",
      )
      .map(getInitialDealParticipantFromBet)
      .sort((left, right) => left.seatNumber - right.seatNumber),
  );
}

function reopenEmptyBlackjackBettingWindow(input: {
  table: BlackjackTable;
  accounts: readonly BlackjackRoundFlowAccount[];
  positions: readonly BlackjackBettingPosition[];
  nowMs: number;
}): BlackjackBettingWindowCloseResult {
  const round=input.table.round;
  if(
    round===null ||
    (round.phase!=="BETTING" && round.phase!=="BETTING_LOCKED") ||
    round.bettingClosesAtMs===null
  ){
    throw new Error(
      "Blackjack empty betting recovery requires a closed betting round",
    );
  }

  const bettingWindowMs=round.bettingClosesAtMs-round.startedAtMs;
  if(!Number.isSafeInteger(bettingWindowMs) || bettingWindowMs<=0){
    throw new RangeError(
      "Blackjack empty betting recovery window is invalid",
    );
  }
  const nextRoundNumber=round.roundNumber+1;
  if(!Number.isSafeInteger(nextRoundNumber) || nextRoundNumber<1){
    throw new RangeError(
      "Blackjack empty betting recovery roundNumber cannot advance safely",
    );
  }
  const bettingClosesAtMs=input.nowMs+bettingWindowMs;
  if(!Number.isSafeInteger(bettingClosesAtMs)){
    throw new RangeError(
      "Blackjack empty betting recovery deadline exceeds safe integer range",
    );
  }

  const reopenedRound=Object.freeze({
    ...round,
    roundId:input.table.tableId+":round-"+nextRoundNumber,
    roundNumber:nextRoundNumber,
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
    input.table.players.map((player): BlackjackPlayer =>
      player.status==="DISCONNECTED"
        ? player
        : Object.freeze({
            ...player,
            status:"BETTING" as const,
            handIds:Object.freeze([]),
          }),
    ),
  );
  const reopened=commitBlackjackServerEvent(
    Object.freeze({
      ...input.table,
      phase:"BETTING" as const,
      round:reopenedRound,
      players,
      stateVersion:nextStateVersion(input.table.stateVersion),
    }),
    {
      type:"ROUND_PHASE_CHANGED",
      actionId:null,
      createdAtMs:input.nowMs,
    },
  ).table;

  return Object.freeze({
    table:reopened,
    accounts:Object.freeze([...input.accounts]),
    positions:Object.freeze(
      input.positions.filter(
        (position)=>position.roundId!==round.roundId,
      ),
    ),
    participants:Object.freeze([]),
    replayed:false,
  });
}

export function closeBlackjackBettingWindow(input: {
  table: BlackjackTable;
  accounts: readonly BlackjackRoundFlowAccount[];
  positions: readonly BlackjackBettingPosition[];
  nowMs: number;
}): BlackjackBettingWindowCloseResult {
  assertNowMs(input.nowMs);

  const round=input.table.round;
  if (round === null) {
    throw new Error("Blackjack betting close requires an active round");
  }

  if (
    input.table.phase === "BETTING_LOCKED" &&
    round.phase === "BETTING_LOCKED"
  ) {
    const participants=currentLockedParticipants(
      round.roundId,
      input.positions,
    );
    if(participants.length===0){
      return reopenEmptyBlackjackBettingWindow({
        table:input.table,
        accounts:input.accounts,
        positions:input.positions,
        nowMs:input.nowMs,
      });
    }
    return Object.freeze({
      table:input.table,
      accounts:Object.freeze([...input.accounts]),
      positions:Object.freeze([...input.positions]),
      participants,
      replayed:true,
    });
  }

  if (input.table.phase !== "BETTING" || round.phase !== "BETTING") {
    throw new Error("Blackjack betting close requires BETTING phase");
  }
  if (round.bettingClosesAtMs === null) {
    throw new Error("Blackjack betting close requires a deadline");
  }
  if (input.nowMs < round.bettingClosesAtMs) {
    throw new Error("Blackjack betting window is still open");
  }

  const accountsByPlayer=new Map(
    input.accounts.map((account)=>[account.playerId,account] as const),
  );
  const playersById=new Map(
    input.table.players.map((player)=>[player.playerId,player] as const),
  );
  const nextPositions: BlackjackBettingPosition[]=[];
  const readyPlayerIds=new Set<string>();

  for(const position of input.positions){
    if(position.roundId!==round.roundId){
      nextPositions.push(position);
      continue;
    }

    const player=playersById.get(position.playerId);
    const account=accountsByPlayer.get(position.playerId);
    if(!player || !account){
      throw new Error("Blackjack betting close found orphan betting position");
    }
    if(
      player.seatNumber!==position.seatNumber ||
      account.userId!==position.userId
    ){
      throw new Error("Blackjack betting close position ownership mismatch");
    }

    if(position.status==="READY" || position.status==="LOCKED"){
      const locked =
        position.status==="LOCKED"
          ? position
          : lockBlackjackReadyBet(position);
      nextPositions.push(locked);
      readyPlayerIds.add(position.playerId);
      continue;
    }

    const expired=expireBlackjackOpenBet(
      account.wallet,
      account.book,
      position,
      {
        expireTransactionId:
          "blackjack:" +
          input.table.tableId +
          ":" +
          round.roundId +
          ":" +
          position.playerId +
          ":bet-expire",
        nowMs:input.nowMs,
      },
    );
    accountsByPlayer.set(
      position.playerId,
      freezeAccount({
        ...account,
        wallet:expired.wallet,
        book:expired.book,
      }),
    );
    nextPositions.push(expired.position);
  }

  if(readyPlayerIds.size===0){
    return reopenEmptyBlackjackBettingWindow({
      table:input.table,
      accounts:Object.freeze(
        input.accounts.map((account)=>
          accountsByPlayer.get(account.playerId) ?? account,
        ),
      ),
      positions:Object.freeze([...nextPositions]),
      nowMs:input.nowMs,
    });
  }

  const players=Object.freeze(
    input.table.players.map((player): BlackjackPlayer => {
      if(player.status==="DISCONNECTED") return player;
      if(readyPlayerIds.has(player.playerId)){
        return Object.freeze({ ...player, status:"READY" as const });
      }
      if(player.status==="BETTING" || player.status==="READY"){
        return Object.freeze({
          ...player,
          status:"SEATED_WAITING" as const,
          handIds:Object.freeze([]),
        });
      }
      return player;
    }),
  );

  const lockedRound=Object.freeze({
    ...round,
    phase:"BETTING_LOCKED" as const,
    currentTurn:null,
  });
  const versionedTable: BlackjackTable=Object.freeze({
    ...input.table,
    phase:"BETTING_LOCKED" as const,
    round:lockedRound,
    players,
    stateVersion:nextStateVersion(input.table.stateVersion),
  });
  const committed=commitBlackjackServerEvent(versionedTable,{
    type:"ROUND_PHASE_CHANGED",
    actionId:null,
    createdAtMs:input.nowMs,
  });

  const frozenPositions=Object.freeze([...nextPositions]);
  const participants=currentLockedParticipants(
    round.roundId,
    frozenPositions,
  );

  return Object.freeze({
    table:committed.table,
    accounts:Object.freeze(
      input.accounts.map((account)=>
        accountsByPlayer.get(account.playerId) ?? account,
      ),
    ),
    positions:frozenPositions,
    participants,
    replayed:false,
  });
}


function hasInitialHandForParticipant(
  table: BlackjackTable,
  participant: BlackjackInitialDealParticipant,
): boolean {
  const expectedHandId =
    table.round?.roundId +
    ":seat-" +
    participant.seatNumber +
    ":initial";
  return (
    table.round?.hands.some(
      (hand) =>
        hand.handId === expectedHandId &&
        hand.playerId === participant.playerId &&
        hand.seatNumber === participant.seatNumber,
    ) ?? false
  );
}

export function startBlackjackInitialDeal(input: {
  table: BlackjackTable;
  accounts: readonly BlackjackRoundFlowAccount[];
  positions: readonly BlackjackBettingPosition[];
  nowMs: number;
  createFreshShoe?: () => BlackjackShoe;
}): BlackjackInitialDealFlowResult {
  assertNowMs(input.nowMs);

  const round=input.table.round;
  if(round===null){
    throw new Error("Blackjack initial deal requires an active round");
  }

  const participants=currentLockedParticipants(
    round.roundId,
    input.positions,
  );

  if(
    (input.table.phase==="PLAYER_TURNS" ||
      input.table.phase==="DEALER_TURN") &&
    input.table.phase===round.phase &&
    participants.length>0 &&
    participants.every((participant)=>
      hasInitialHandForParticipant(input.table,participant),
    )
  ){
    return Object.freeze({
      table:input.table,
      accounts:Object.freeze([...input.accounts]),
      participants,
      dealEvents:Object.freeze([]),
      replayed:true,
    });
  }

  if(
    input.table.phase!=="BETTING_LOCKED" ||
    round.phase!=="BETTING_LOCKED"
  ){
    throw new Error(
      "Blackjack initial deal requires BETTING_LOCKED phase",
    );
  }
  if(participants.length===0){
    throw new Error(
      "Blackjack initial deal requires at least one locked betting participant",
    );
  }

  const minimumCardsRequired=participants.length*2+2;
  let shoe=input.table.shoe;
  if(
    shouldReshuffleBlackjackBeforeRound(
      shoe,
      minimumCardsRequired,
    )
  ){
    if(!input.createFreshShoe){
      throw new Error(
        "Blackjack initial deal requires a fresh shoe before this round",
      );
    }
    shoe=prepareBlackjackShoeBeforeRound({
      currentShoe:shoe,
      minimumCardsRequired,
      createFreshShoe:input.createFreshShoe,
    });
  }

  const deal=dealInitialBlackjackCards({
    roundId:round.roundId,
    shoe,
    participants,
  });

  const accountsByPlayer=new Map(
    input.accounts.map((account)=>[account.playerId,account] as const),
  );
  for(const hand of deal.hands){
    const position=input.positions.find(
      (candidate)=>
        candidate.roundId===round.roundId &&
        candidate.playerId===hand.playerId &&
        candidate.seatNumber===hand.seatNumber &&
        candidate.status==="LOCKED",
    );
    const account=accountsByPlayer.get(hand.playerId);
    if(!position || !account){
      throw new Error(
        "Blackjack initial deal cannot bind a locked bet to its hand",
      );
    }

    const boundBook=bindBlackjackBetPositionToHand(
      account.book,
      position,
      hand.handId,
    );
    accountsByPlayer.set(
      hand.playerId,
      freezeAccount({
        ...account,
        book:boundBook,
      }),
    );
  }

  const handIdsByPlayer=new Map<string,string[]>();
  for(const hand of deal.hands){
    const ids=handIdsByPlayer.get(hand.playerId) ?? [];
    ids.push(hand.handId);
    handIdsByPlayer.set(hand.playerId,ids);
  }

  const players=Object.freeze(
    input.table.players.map((player): BlackjackPlayer => {
      const handIds=handIdsByPlayer.get(player.playerId);
      if(!handIds) {
        if(
          player.status==="BETTING" ||
          player.status==="READY"
        ){
          return Object.freeze({
            ...player,
            status:"SEATED_WAITING" as const,
            handIds:Object.freeze([]),
          });
        }
        return player;
      }

      return Object.freeze({
        ...player,
        status:
          player.status==="DISCONNECTED"
            ? "DISCONNECTED" as const
            : "PLAYING" as const,
        handIds:Object.freeze([...handIds]),
      });
    }),
  );

  const initialRound=Object.freeze({
    ...round,
    phase:"INITIAL_DEAL" as const,
    activeSeatOrder:deal.activeSeatOrder,
    hands:deal.hands,
    dealer:deal.dealer,
    currentTurn:null,
    finishedAtMs:null,
  });
  const startedRound=startBlackjackPlayerTurns(
    initialRound,
    input.nowMs,
  );

  const versionedTable: BlackjackTable=Object.freeze({
    ...input.table,
    phase:startedRound.phase,
    players,
    shoe:deal.shoe,
    round:startedRound,
    stateVersion:nextStateVersion(input.table.stateVersion),
  });
  const committed=commitBlackjackServerEvent(versionedTable,{
    type:"ROUND_PHASE_CHANGED",
    actionId:null,
    createdAtMs:input.nowMs,
  });

  return Object.freeze({
    table:committed.table,
    accounts:Object.freeze(
      input.accounts.map((account)=>
        accountsByPlayer.get(account.playerId) ?? account,
      ),
    ),
    participants,
    dealEvents:deal.events,
    replayed:false,
  });
}


function safeAddMs(startMs: number, durationMs: number): number {
  const value=startMs+durationMs;
  if(!Number.isSafeInteger(value)){
    throw new RangeError("Blackjack betting deadline exceeds safe integer range");
  }
  return value;
}

export function startBlackjackNextBettingRound(input: {
  table: BlackjackTable;
  bettingPositions: readonly BlackjackBettingPosition[];
  nowMs: number;
  bettingWindowMs?: number;
  createFreshShoe?: () => BlackjackShoe;
}): BlackjackNextBettingRoundResult {
  assertNowMs(input.nowMs);

  if(input.table.phase==="BETTING"){
    const round=input.table.round;
    if(round===null || round.phase!=="BETTING"){
      throw new Error("Blackjack next-round flow found inconsistent BETTING state");
    }
    return Object.freeze({
      table:input.table,
      bettingPositions:Object.freeze([...input.bettingPositions]),
      replayed:true,
    });
  }

  if(input.table.phase!=="ROUND_END"){
    throw new Error("Blackjack next betting round requires ROUND_END phase");
  }
  const previousRound=input.table.round;
  if(
    previousRound===null ||
    previousRound.phase!=="ROUND_END" ||
    previousRound.currentTurn!==null ||
    previousRound.hands.some((hand)=>hand.status!=="COMPLETE")
  ){
    throw new Error("Blackjack next betting round requires a settled round");
  }

  const activePlayers=input.table.players.filter(
    (player)=>player.connected && player.status!=="DISCONNECTED",
  );
  if(activePlayers.length===0){
    return Object.freeze({
      table:input.table,
      bettingPositions:Object.freeze(
        input.bettingPositions.filter(
          (position)=>position.roundId!==previousRound.roundId,
        ),
      ),
      replayed:true,
    });
  }

  const bettingWindowMs=input.bettingWindowMs ?? BLACKJACK_BETTING_WINDOW_MS;
  if(!Number.isSafeInteger(bettingWindowMs) || bettingWindowMs<=0){
    throw new RangeError(
      "Blackjack bettingWindowMs must be a positive safe integer",
    );
  }

  let shoe=input.table.shoe;
  if(
    shouldReshuffleBlackjackBeforeRound(
      shoe,
      BLACKJACK_MAX_INITIAL_DEAL_CARDS,
    )
  ){
    if(!input.createFreshShoe){
      throw new Error(
        "Blackjack next betting round requires a fresh shoe",
      );
    }
    shoe=prepareBlackjackShoeBeforeRound({
      currentShoe:shoe,
      minimumCardsRequired:BLACKJACK_MAX_INITIAL_DEAL_CARDS,
      createFreshShoe:input.createFreshShoe,
    });
  }

  const roundNumber=previousRound.roundNumber+1;
  if(!Number.isSafeInteger(roundNumber) || roundNumber<1){
    throw new RangeError("Blackjack roundNumber cannot advance safely");
  }
  const roundId=input.table.tableId+":round-"+roundNumber;
  const bettingClosesAtMs=safeAddMs(input.nowMs,bettingWindowMs);

  const round=Object.freeze({
    roundId,
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
    input.table.players.map((player): BlackjackPlayer =>
      player.connected && player.status!=="DISCONNECTED"
        ? Object.freeze({
            ...player,
            status:"BETTING" as const,
            handIds:Object.freeze([]),
          })
        : player,
    ),
  );

  const versioned: BlackjackTable=Object.freeze({
    ...input.table,
    phase:"BETTING" as const,
    players,
    shoe,
    round,
    stateVersion:nextStateVersion(input.table.stateVersion),
  });
  const committed=commitBlackjackServerEvent(versioned,{
    type:"ROUND_PHASE_CHANGED",
    actionId:null,
    createdAtMs:input.nowMs,
  }).table;

  return Object.freeze({
    table:committed,
    bettingPositions:Object.freeze(
      input.bettingPositions.filter(
        (position)=>position.roundId!==previousRound.roundId,
      ),
    ),
    replayed:false,
  });
}
