import type {
  BlackjackInitialDealCoordinatorResult,
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackShoe, BlackjackTable } from "./domain";

export const BLACKJACK_ROUND_END_HOLD_MS = 3_000 as const;

export type BlackjackRoundRuntimeTransitionType =
  | "BETTING_LOCKED"
  | "EMPTY_BETTING_WINDOW_RECYCLED"
  | "INITIAL_DEAL_COMMITTED"
  | "PLAYER_TURN_TIMEOUT_COMMITTED"
  | "DISCONNECTED_AUTO_STAND_COMMITTED"
  | "DEALER_TURN_COMMITTED"
  | "ROUND_SETTLED"
  | "NEXT_BETTING_ROUND_COMMITTED";

export type BlackjackRoundRuntimeTransition = Readonly<{
  type: BlackjackRoundRuntimeTransitionType;
  table: BlackjackTable;
}>;

export type BlackjackRoundRuntimeTickStatus =
  | "NOOP"
  | "WAITING_FOR_BETTING_DEADLINE"
  | "BETTING_CLOSED_EMPTY"
  | "ROUND_STARTED"
  | "WAITING_FOR_PLAYER_TURN"
  | "PLAYER_TURN_ADVANCED"
  | "DEALER_TURN_READY"
  | "ROUND_ENDED"
  | "NEXT_BETTING_ROUND_STARTED"
  | "WAITING_FOR_NEXT_ROUND"
  | "ROUND_END_IDLE";

export type BlackjackRoundRuntimeTickResult = Readonly<{
  status: BlackjackRoundRuntimeTickStatus;
  table: BlackjackTable;
  transitions: readonly BlackjackRoundRuntimeTransition[];
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack round runtime nowMs must be a non-negative safe integer",
    );
  }
}

function freezeTransition(
  type: BlackjackRoundRuntimeTransitionType,
  table: BlackjackTable,
): BlackjackRoundRuntimeTransition {
  return Object.freeze({ type, table });
}

function finish(
  status: BlackjackRoundRuntimeTickStatus,
  table: BlackjackTable,
  transitions: readonly BlackjackRoundRuntimeTransition[],
): BlackjackRoundRuntimeTickResult {
  return Object.freeze({
    status,
    table,
    transitions: Object.freeze([...transitions]),
  });
}

async function recycleEmptyBettingWindow(
  coordinator: BlackjackPlayerActionCoordinator,
  nowMs: number,
  bettingWindowMs: number | undefined,
  createFreshShoe: (() => BlackjackShoe) | undefined,
  transitions: BlackjackRoundRuntimeTransition[],
): Promise<BlackjackRoundRuntimeTickResult> {
  const next=await coordinator.startNextBettingRound(
    nowMs,
    {
      bettingWindowMs,
      createFreshShoe,
    },
  );
  if(!next.replayed){
    transitions.push(
      freezeTransition(
        "EMPTY_BETTING_WINDOW_RECYCLED",
        next.table,
      ),
    );
  }

  return finish(
    next.table.phase==="TABLE_IDLE"
      ? "BETTING_CLOSED_EMPTY"
      : "NEXT_BETTING_ROUND_STARTED",
    next.table,
    transitions,
  );
}

async function startDealFromLockedBetting(
  coordinator: BlackjackPlayerActionCoordinator,
  nowMs: number,
  bettingWindowMs: number | undefined,
  createFreshShoe: (() => BlackjackShoe) | undefined,
  transitions: BlackjackRoundRuntimeTransition[],
): Promise<BlackjackRoundRuntimeTickResult> {
  const locked = await coordinator.closeBettingWindow(nowMs);
  if (locked.participants.length === 0) {
    return recycleEmptyBettingWindow(
      coordinator,
      nowMs,
      bettingWindowMs,
      createFreshShoe,
      transitions,
    );
  }

  const dealt: BlackjackInitialDealCoordinatorResult =
    await coordinator.startInitialDeal(nowMs, createFreshShoe);

  if (!dealt.replayed) {
    transitions.push(
      freezeTransition("INITIAL_DEAL_COMMITTED", dealt.table),
    );
  }

  if(dealt.table.phase==="DEALER_TURN"){
    return finishDealerAndSettlement(
      coordinator,
      nowMs,
      transitions,
    );
  }

  return finish("ROUND_STARTED", dealt.table, transitions);
}

async function finishDealerAndSettlement(
  coordinator: BlackjackPlayerActionCoordinator,
  nowMs: number,
  transitions: BlackjackRoundRuntimeTransition[],
): Promise<BlackjackRoundRuntimeTickResult> {
  let table=coordinator.getTable();

  if(table.phase==="DEALER_TURN"){
    const dealer=await coordinator.runDealerTurn(nowMs);
    table=dealer.table;
    if(!dealer.replayed){
      transitions.push(
        freezeTransition("DEALER_TURN_COMMITTED",dealer.table),
      );
    }
  }

  if(table.phase!=="SETTLEMENT"){
    throw new Error(
      "Blackjack round runtime dealer resolution did not reach SETTLEMENT",
    );
  }

  const settled=await coordinator.settleCurrentRound(nowMs);
  table=settled.table;
  if(!settled.replayed){
    transitions.push(
      freezeTransition("ROUND_SETTLED",settled.table),
    );
  }

  return finish("ROUND_ENDED",table,transitions);
}

export async function runBlackjackRoundRuntimeTick(
  coordinator: BlackjackPlayerActionCoordinator,
  input: {
    nowMs: number;
    createFreshShoe?: () => BlackjackShoe;
    bettingWindowMs?: number;
  },
): Promise<BlackjackRoundRuntimeTickResult> {
  assertNowMs(input.nowMs);

  const transitions: BlackjackRoundRuntimeTransition[] = [];
  let table = coordinator.getTable();

  if (table.phase === "BETTING") {
    const round = table.round;
    if (round === null || round.phase !== "BETTING") {
      throw new Error(
        "Blackjack round runtime found inconsistent BETTING state",
      );
    }
    if (round.bettingClosesAtMs === null) {
      throw new Error(
        "Blackjack round runtime BETTING phase requires deadline",
      );
    }
    if (input.nowMs < round.bettingClosesAtMs) {
      return finish(
        "WAITING_FOR_BETTING_DEADLINE",
        table,
        transitions,
      );
    }

    const closed = await coordinator.closeBettingWindow(input.nowMs);
    table = closed.table;
    if (!closed.replayed) {
      transitions.push(
        freezeTransition("BETTING_LOCKED", closed.table),
      );
    }

    if (closed.participants.length === 0) {
      return recycleEmptyBettingWindow(
        coordinator,
        input.nowMs,
        input.bettingWindowMs,
        input.createFreshShoe,
        transitions,
      );
    }

    const dealt = await coordinator.startInitialDeal(
      input.nowMs,
      input.createFreshShoe,
    );
    if (!dealt.replayed) {
      transitions.push(
        freezeTransition("INITIAL_DEAL_COMMITTED", dealt.table),
      );
    }
    if(dealt.table.phase==="DEALER_TURN"){
      return finishDealerAndSettlement(
        coordinator,
        input.nowMs,
        transitions,
      );
    }
    return finish("ROUND_STARTED", dealt.table, transitions);
  }

  if (table.phase === "PLAYER_TURNS") {
    const round=table.round;
    if(
      round===null ||
      round.phase!=="PLAYER_TURNS" ||
      round.currentTurn===null
    ){
      throw new Error(
        "Blackjack round runtime found inconsistent PLAYER_TURNS state",
      );
    }

    const disconnected=await coordinator.applyDisconnectedTurnPolicy(
      input.nowMs,
    );
    if(!disconnected.replayed){
      table=disconnected.table;
      transitions.push(
        freezeTransition(
          "DISCONNECTED_AUTO_STAND_COMMITTED",
          disconnected.table,
        ),
      );

      if(table.phase==="DEALER_TURN"){
        return finishDealerAndSettlement(
          coordinator,
          input.nowMs,
          transitions,
        );
      }

      return finish(
        "PLAYER_TURN_ADVANCED",
        table,
        transitions,
      );
    }

    if(input.nowMs < round.currentTurn.endsAtMs){
      return finish(
        "WAITING_FOR_PLAYER_TURN",
        table,
        transitions,
      );
    }

    const timedOut=await coordinator.timeoutCurrentTurn(input.nowMs);
    table=timedOut.table;
    if(!timedOut.replayed){
      transitions.push(
        freezeTransition(
          "PLAYER_TURN_TIMEOUT_COMMITTED",
          timedOut.table,
        ),
      );
    }

    if(table.phase==="DEALER_TURN"){
      return finishDealerAndSettlement(
        coordinator,
        input.nowMs,
        transitions,
      );
    }

    return finish(
      "PLAYER_TURN_ADVANCED",
      table,
      transitions,
    );
  }

  if(table.phase==="DEALER_TURN" || table.phase==="SETTLEMENT"){
    return finishDealerAndSettlement(
      coordinator,
      input.nowMs,
      transitions,
    );
  }

  if(table.phase==="ROUND_END"){
    const connectedPlayers=table.players.filter(
      (player)=>player.connected && player.status!=="DISCONNECTED",
    );
    if(connectedPlayers.length===0){
      return finish(
        "ROUND_END_IDLE",
        table,
        transitions,
      );
    }

    const finishedAtMs=table.round?.finishedAtMs;
    if(
      finishedAtMs===null ||
      finishedAtMs===undefined
    ){
      throw new Error(
        "Blackjack ROUND_END requires finishedAtMs",
      );
    }
    const nextRoundAtMs=finishedAtMs+BLACKJACK_ROUND_END_HOLD_MS;
    if(!Number.isSafeInteger(nextRoundAtMs)){
      throw new RangeError(
        "Blackjack next-round hold deadline exceeds safe integer range",
      );
    }
    if(input.nowMs<nextRoundAtMs){
      return finish(
        "WAITING_FOR_NEXT_ROUND",
        table,
        transitions,
      );
    }

    const next=await coordinator.startNextBettingRound(
      input.nowMs,
      {
        bettingWindowMs:input.bettingWindowMs,
        createFreshShoe:input.createFreshShoe,
      },
    );
    table=next.table;
    if(!next.replayed){
      transitions.push(
        freezeTransition(
          "NEXT_BETTING_ROUND_COMMITTED",
          next.table,
        ),
      );
    }

    return finish(
      "NEXT_BETTING_ROUND_STARTED",
      table,
      transitions,
    );
  }

  if (table.phase === "BETTING_LOCKED") {
    const round = table.round;
    if (round === null || round.phase !== "BETTING_LOCKED") {
      throw new Error(
        "Blackjack round runtime found inconsistent BETTING_LOCKED state",
      );
    }

    return startDealFromLockedBetting(
      coordinator,
      input.nowMs,
      input.bettingWindowMs,
      input.createFreshShoe,
      transitions,
    );
  }

  return finish("NOOP", table, transitions);
}
