import type {
  BlackjackInitialDealCoordinatorResult,
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackShoe, BlackjackTable } from "./domain";

export type BlackjackRoundRuntimeTransitionType =
  | "BETTING_LOCKED"
  | "INITIAL_DEAL_COMMITTED"
  | "PLAYER_TURN_TIMEOUT_COMMITTED";

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
  | "DEALER_TURN_READY";

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

async function startDealFromLockedBetting(
  coordinator: BlackjackPlayerActionCoordinator,
  nowMs: number,
  createFreshShoe: (() => BlackjackShoe) | undefined,
  transitions: BlackjackRoundRuntimeTransition[],
): Promise<BlackjackRoundRuntimeTickResult> {
  const locked = await coordinator.closeBettingWindow(nowMs);
  if (locked.participants.length === 0) {
    return finish(
      "BETTING_CLOSED_EMPTY",
      coordinator.getTable(),
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

  return finish("ROUND_STARTED", dealt.table, transitions);
}

export async function runBlackjackRoundRuntimeTick(
  coordinator: BlackjackPlayerActionCoordinator,
  input: {
    nowMs: number;
    createFreshShoe?: () => BlackjackShoe;
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
      return finish("BETTING_CLOSED_EMPTY", table, transitions);
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

    return finish(
      table.phase==="DEALER_TURN"
        ? "DEALER_TURN_READY"
        : "PLAYER_TURN_ADVANCED",
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
      input.createFreshShoe,
      transitions,
    );
  }

  return finish("NOOP", table, transitions);
}
