import { getBlackjackAvailablePlayerActions } from "./playerActionsClient";
import { formatBlackjackChipCredits } from "./bettingView";
import type {
  BlackjackTableSeatViewModel,
  BlackjackTableViewModel,
} from "./tableView";

type BlackjackViewSeatNumber = 1 | 2 | 3 | 4 | 5;
type BlackjackViewRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";
type BlackjackViewHandStatus =
  | "WAITING"
  | "ACTIVE"
  | "STOOD"
  | "BUST"
  | "BLACKJACK"
  | "COMPLETE";
type BlackjackViewPhase =
  | "TABLE_IDLE"
  | "SHUFFLING"
  | "BETTING"
  | "BETTING_LOCKED"
  | "INITIAL_DEAL"
  | "PLAYER_TURNS"
  | "DEALER_TURN"
  | "SETTLEMENT"
  | "ROUND_END"
  | "RECOVERING";

export type BlackjackPublicSnapshotViewSource = Readonly<{
  serverTimeMs: number;
  tableId: string;
  phase: BlackjackViewPhase;
  maxSeats: 5;
  seats: readonly Readonly<{
    seatNumber: BlackjackViewSeatNumber;
    playerId: string | null;
  }>[];
  players: readonly Readonly<{
    playerId: string;
    seatNumber: BlackjackViewSeatNumber;
    status: "SEATED_WAITING" | "BETTING" | "READY" | "PLAYING" | "DISCONNECTED";
    connected: boolean;
  }>[];
  round: Readonly<{
    roundId?: string;
    phase:
      | "BETTING"
      | "BETTING_LOCKED"
      | "INITIAL_DEAL"
      | "PLAYER_TURNS"
      | "DEALER_TURN"
      | "SETTLEMENT"
      | "ROUND_END";
    hands: readonly Readonly<{
      handId: string;
      playerId: string;
      seatNumber: BlackjackViewSeatNumber;
      cards: readonly Readonly<{
        suit: "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
        rank: BlackjackViewRank;
      }>[];
      betCents: number;
      status: BlackjackViewHandStatus;
      result?: "WIN" | "LOSS" | "PUSH" | "BLACKJACK_WIN" | null;
      payoutCents?: number;
    }>[];
    dealer: Readonly<{
      cards: readonly (
        | Readonly<{
            suit: "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
            rank: BlackjackViewRank;
          }>
        | null
      )[];
      holeCardRevealed: boolean;
    }>;
    currentTurn: Readonly<{
      seatNumber: BlackjackViewSeatNumber;
      handId: string;
      startedAtMs: number;
      endsAtMs: number;
    }> | null;
    bettingClosesAtMs: number | null;
  }> | null;
  stateVersion: number;
  eventSequence: number;
}>;

type BlackjackSnapshotHand =
  NonNullable<BlackjackPublicSnapshotViewSource["round"]>["hands"][number];

export type BlackjackSnapshotViewContext = Readonly<{
  localPlayerId?: string | null;
  availableBalanceCents?: number | null;
  actionPending?: boolean;
  actionStatusLabel?: string | null;
  actionStatusTone?: "neutral" | "success" | "error";
  bettingBetCents?: number | null;
  bettingStatus?: "OPEN" | "READY" | "LOCKED" | null;
  bettingPending?: boolean;
  selectedChipCredits?: number;
  selectedSeatForClaim?: BlackjackViewSeatNumber | null;
  openDrawer?: "BET" | "INFO" | null;
  transportConnected?: boolean;
  seatCommandPending?: boolean;
  connectionState?:
    | "CONNECTING"
    | "READY"
    | "RECONNECTING"
    | "SESSION_REPLACED"
    | "ERROR";
}>;

function assertSafeNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack snapshot " + label + " must be a non-negative safe integer",
    );
  }
}

function assertCanonicalSeats(
  snapshot: BlackjackPublicSnapshotViewSource,
): void {
  if (snapshot.maxSeats !== 5 || snapshot.seats.length !== 5) {
    throw new Error("Blackjack public snapshot must contain exactly five seats");
  }

  const ordered = [...snapshot.seats]
    .map((seat) => seat.seatNumber)
    .sort((left, right) => left - right);

  if (ordered.some((seatNumber, index) => seatNumber !== index + 1)) {
    throw new Error("Blackjack public snapshot seats must be exactly 1-5");
  }
}

function rankValue(rank: BlackjackViewRank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
}

export function getBlackjackVisibleCardTotal(
  cards: readonly Readonly<{ rank: BlackjackViewRank }>[],
): number {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += rankValue(card.rank);
    if (card.rank === "A") aces += 1;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function formatCreditsFromCents(cents: number): string {
  assertSafeNonNegativeInteger("money cents", cents);
  if (cents % 100 !== 0) {
    throw new RangeError(
      "Blackjack snapshot money must represent whole credit units",
    );
  }

  const credits = cents / 100;
  return credits === 0 ? "0" : formatBlackjackChipCredits(credits);
}

function formatPhaseLabel(phase: BlackjackViewPhase): string {
  return phase.replaceAll("_", " ");
}

function remainingSeconds(serverTimeMs: number, endsAtMs: number): number {
  assertSafeNonNegativeInteger("serverTimeMs", serverTimeMs);
  assertSafeNonNegativeInteger("deadline", endsAtMs);
  return Math.max(0, Math.ceil((endsAtMs - serverTimeMs) / 1_000));
}

function resolveTurnLabel(
  snapshot: BlackjackPublicSnapshotViewSource,
  localSeatNumber: BlackjackViewSeatNumber | null,
): string {
  const round = snapshot.round;
  if (round?.currentTurn) {
    const seconds = remainingSeconds(
      snapshot.serverTimeMs,
      round.currentTurn.endsAtMs,
    );
    return round.currentTurn.seatNumber === localSeatNumber
      ? "YOUR TURN · " + seconds + "s"
      : "SEAT " + round.currentTurn.seatNumber + " TURN · " + seconds + "s";
  }

  if (
    snapshot.phase === "BETTING" &&
    round?.bettingClosesAtMs !== null &&
    round?.bettingClosesAtMs !== undefined
  ) {
    return (
      "BETTING · " +
      remainingSeconds(snapshot.serverTimeMs, round.bettingClosesAtMs) +
      "s"
    );
  }

  if (snapshot.phase === "DEALER_TURN") return "DEALER TURN";
  if (snapshot.phase === "SETTLEMENT") return "SETTLEMENT";
  if (snapshot.phase === "SHUFFLING") return "SHUFFLING";
  if (snapshot.phase === "RECOVERING") return "RECOVERING";
  if (snapshot.phase === "TABLE_IDLE") return "WAITING FOR PLAYERS";
  return "MULTIPLAYER TABLE";
}

function resolveDealerLabel(
  snapshot: BlackjackPublicSnapshotViewSource,
): string {
  const dealer = snapshot.round?.dealer;
  if (!dealer || dealer.cards.length === 0) return "DEALER";

  const visibleCards = dealer.cards.filter(
    (card): card is NonNullable<typeof card> => card !== null,
  );
  if (visibleCards.length === 0) return "DEALER";

  const total = getBlackjackVisibleCardTotal(visibleCards);
  if (dealer.cards.some((card) => card === null)) {
    return String(total) + " + ?";
  }
  return total > 21 ? "BUST " + total : String(total);
}

function displayHandStatus(
  status: BlackjackViewHandStatus,
): BlackjackTableSeatViewModel["status"] {
  return status === "COMPLETE" ? "STOOD" : status;
}

function buildLocalRoundResult(
  snapshot: BlackjackPublicSnapshotViewSource,
  localPlayerId: string | null,
): BlackjackTableViewModel["roundResult"] {
  if(
    snapshot.phase!=="ROUND_END" ||
    localPlayerId===null ||
    snapshot.round===null
  ){
    return null;
  }

  const hands=snapshot.round.hands.filter(
    (hand)=>hand.playerId===localPlayerId,
  );
  if(
    hands.length===0 ||
    hands.some(
      (hand)=>
        hand.status!=="COMPLETE" ||
        hand.result===null ||
        hand.result===undefined ||
        hand.payoutCents===undefined,
    )
  ){
    return null;
  }

  let totalBetCents=0;
  let payoutCents=0;
  for(const hand of hands){
    assertSafeNonNegativeInteger("hand result betCents",hand.betCents);
    assertSafeNonNegativeInteger(
      "hand result payoutCents",
      hand.payoutCents ?? 0,
    );
    totalBetCents+=hand.betCents;
    payoutCents+=hand.payoutCents ?? 0;
    if(
      !Number.isSafeInteger(totalBetCents) ||
      !Number.isSafeInteger(payoutCents)
    ){
      throw new RangeError(
        "Blackjack round result money exceeds safe integer range",
      );
    }
  }

  const netCents=payoutCents-totalBetCents;
  const blackjackWin=
    hands.length===1 && hands[0]?.result==="BLACKJACK_WIN";
  const title=
    blackjackWin
      ? "BLACKJACK!"
      : netCents>0
        ? "YOU WIN"
        : netCents===0
          ? "PUSH"
          : "DEALER WINS";
  const tone=
    netCents>0
      ? "win" as const
      : netCents===0
        ? "push" as const
        : "loss" as const;
  const netLabel=
    netCents===0
      ? "NET 0"
      : "NET " +
        (netCents>0 ? "+" : "−") +
        formatCreditsFromCents(Math.abs(netCents));

  return Object.freeze({
    title,
    detail:
      "RETURN " +
      formatCreditsFromCents(payoutCents) +
      " · " +
      netLabel,
    tone,
  });
}

function sumSeatBetsCents(
  hands: readonly BlackjackSnapshotHand[],
): number {
  let total = 0;
  for (const hand of hands) {
    assertSafeNonNegativeInteger("hand betCents", hand.betCents);
    total += hand.betCents;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Blackjack snapshot seat bet exceeds safe integer range");
    }
  }
  return total;
}

export function buildBlackjackTableViewModelFromSnapshot(
  snapshot: BlackjackPublicSnapshotViewSource,
  context: BlackjackSnapshotViewContext = {},
): BlackjackTableViewModel {
  assertSafeNonNegativeInteger("serverTimeMs", snapshot.serverTimeMs);
  assertSafeNonNegativeInteger("stateVersion", snapshot.stateVersion);
  assertSafeNonNegativeInteger("eventSequence", snapshot.eventSequence);
  assertCanonicalSeats(snapshot);

  const playersById = new Map(
    snapshot.players.map((player) => [player.playerId, player] as const),
  );
  const localPlayer =
    context.localPlayerId === null || context.localPlayerId === undefined
      ? null
      : playersById.get(context.localPlayerId) ?? null;
  const localSeatNumber = localPlayer?.seatNumber ?? null;
  const localHasCommittedBet =
    (context.bettingBetCents ?? 0) > 0 ||
    context.bettingStatus === "READY" ||
    context.bettingStatus === "LOCKED";
  const roundHands = snapshot.round?.hands ?? [];

  const seats = snapshot.seats
    .map((seat): BlackjackTableSeatViewModel => {
      const player =
        seat.playerId === null ? null : playersById.get(seat.playerId) ?? null;
      const hands = roundHands.filter(
        (hand) => hand.seatNumber === seat.seatNumber,
      );
      const currentHandId =
        snapshot.round?.currentTurn?.seatNumber === seat.seatNumber
          ? snapshot.round.currentTurn.handId
          : null;
      const primaryHand =
        hands.find((hand) => hand.handId === currentHandId) ??
        hands.find((hand) => hand.status === "ACTIVE") ??
        hands[0] ??
        null;
      const totalBetCents = sumSeatBetsCents(hands);
      const isLocal = seat.seatNumber === localSeatNumber;

      return Object.freeze({
        seatNumber: seat.seatNumber,
        label:
          seat.playerId === null
            ? "OPEN SEAT"
            : isLocal
              ? "YOUR SEAT"
              : "PLAYER " +
                seat.seatNumber +
                (player && !player.connected ? " · OFFLINE" : ""),
        status:
          seat.playerId === null
            ? "EMPTY"
            : primaryHand === null
              ? "WAITING"
              : displayHandStatus(primaryHand.status),
        total:
          primaryHand === null
            ? null
            : getBlackjackVisibleCardTotal(primaryHand.cards),
        betLabel:
          totalBetCents === 0 ? null : formatCreditsFromCents(totalBetCents),
        isLocal,
        canClaim:
          context.transportConnected !== false &&
          context.seatCommandPending !== true &&
          localPlayer===null &&
          seat.playerId===null &&
          (
            snapshot.phase==="TABLE_IDLE" ||
            snapshot.phase==="BETTING" ||
            snapshot.phase==="ROUND_END"
          ),
        isSelectedForClaim:
          seat.playerId===null &&
          context.selectedSeatForClaim===seat.seatNumber,
        isActiveTurn:
          snapshot.round?.currentTurn?.seatNumber===seat.seatNumber,
        canLeave:
          context.transportConnected !== false &&
          context.seatCommandPending !== true &&
          isLocal &&
          primaryHand===null &&
          !localHasCommittedBet &&
          (
            snapshot.phase==="TABLE_IDLE" ||
            snapshot.phase==="BETTING" ||
            snapshot.phase==="ROUND_END"
          ),
        cards: Object.freeze(
          (primaryHand?.cards ?? []).map((card) =>
            Object.freeze({ rank: card.rank, suit: card.suit }),
          ),
        ),
      });
    })
    .sort((left, right) => left.seatNumber - right.seatNumber);

  const localHands =
    localSeatNumber === null
      ? []
      : roundHands.filter((hand) => hand.seatNumber === localSeatNumber);
  const localBetCents = sumSeatBetsCents(localHands);
  const localBettingCents =
    snapshot.phase === "BETTING" &&
    context.bettingBetCents !== null &&
    context.bettingBetCents !== undefined
      ? context.bettingBetCents
      : localBetCents;

  const balanceLabel =
    context.availableBalanceCents === null ||
    context.availableBalanceCents === undefined
      ? "—"
      : formatCreditsFromCents(context.availableBalanceCents);

  const localBettingStatus =
    context.bettingStatus ??
    (localPlayer?.status === "READY" ? "READY" : "OPEN");
  const bettingOpen =
    context.transportConnected !== false &&
    snapshot.phase === "BETTING" &&
    localPlayer !== null &&
    localPlayer.connected &&
    localBettingStatus === "OPEN";
  const bettingPending=context.bettingPending === true;
  const bettingClosesLabel =
    snapshot.phase === "BETTING" &&
    snapshot.round?.bettingClosesAtMs !== null &&
    snapshot.round?.bettingClosesAtMs !== undefined
      ? remainingSeconds(
          snapshot.serverTimeMs,
          snapshot.round.bettingClosesAtMs,
        ) + "s"
      : "WAITING";

  const enabledActions=getBlackjackAvailablePlayerActions(
    snapshot,
    context,
  );
  const localTurn=
    localSeatNumber!==null &&
    snapshot.round?.currentTurn?.seatNumber===localSeatNumber;
  const interactionMode=
    localPlayer===null
      ? "SEAT" as const
      : snapshot.phase==="BETTING"
        ? "BETTING" as const
        : localTurn
          ? "TURN" as const
          : "WAIT" as const;
  const effectiveOpenDrawer=
    context.openDrawer==="BET" && interactionMode!=="BETTING"
      ? null
      : context.openDrawer ?? null;
  const occupiedSeats=snapshot.seats.filter(
    (seat)=>seat.playerId!==null,
  ).length;
  const interactionPrompt=
    interactionMode==="SEAT"
      ? context.selectedSeatForClaim
        ? "CONFIRM YOUR SEAT"
        : "CHOOSE AN OPEN SEAT"
      : interactionMode==="BETTING"
        ? localBettingStatus==="READY"
          ? "BET LOCKED · WAITING FOR DEAL"
          : "PLACE YOUR BET"
        : interactionMode==="TURN"
          ? "YOUR TURN"
          : snapshot.phase==="PLAYER_TURNS" && snapshot.round?.currentTurn
            ? "WAITING FOR SEAT " +
              snapshot.round.currentTurn.seatNumber
            : snapshot.phase==="DEALER_TURN"
              ? "DEALER PLAYING"
              : snapshot.phase==="SETTLEMENT"
                ? "SETTLING ROUND"
                : snapshot.phase==="ROUND_END"
                  ? "ROUND COMPLETE"
                  : snapshot.phase==="SHUFFLING"
                    ? "SHUFFLING"
                    : snapshot.phase==="RECOVERING"
                      ? "RECOVERING TABLE"
                      : localPlayer
                        ? "WAITING FOR NEXT ROUND"
                        : "CHOOSE AN OPEN SEAT";

  return Object.freeze({
    phaseLabel: formatPhaseLabel(snapshot.phase),
    balanceLabel,
    betLabel: formatCreditsFromCents(localBettingCents),
    turnLabel: resolveTurnLabel(snapshot, localSeatNumber),
    dealerTotalLabel: resolveDealerLabel(snapshot),
    dealerActive:snapshot.phase==="DEALER_TURN",
    dealerCards: Object.freeze(
      (snapshot.round?.dealer.cards ?? []).map((card) =>
        card === null
          ? null
          : Object.freeze({ rank: card.rank, suit: card.suit }),
      ),
    ),
    enabledActions,
    interactionMode,
    interactionPrompt,
    selectedSeatForClaim: context.selectedSeatForClaim ?? null,
    seatClaimPending: context.seatCommandPending === true,
    openDrawer: effectiveOpenDrawer,
    canOpenBetDrawer:
      interactionMode==="BETTING" &&
      localBettingStatus==="OPEN",
    occupiedSeatsLabel: occupiedSeats + " / 5 SEATED",
    actionStatusLabel: context.actionStatusLabel ?? null,
    actionStatusTone: context.actionStatusTone ?? "neutral",
    connectionStatus:Object.freeze(
      context.connectionState==="READY"
        ? {label:"LIVE",tone:"live" as const}
        : context.connectionState==="RECONNECTING"
          ? {label:"RECONNECTING",tone:"reconnecting" as const}
          : context.connectionState==="SESSION_REPLACED"
            ? {label:"SESSION REPLACED",tone:"error" as const}
            : context.connectionState==="ERROR"
              ? {label:"CONNECTION ERROR",tone:"error" as const}
              : {label:"CONNECTING",tone:"connecting" as const},
    ),
    roundResult:buildLocalRoundResult(
      snapshot,
      localPlayer?.playerId ?? null,
    ),
    bettingPanel: Object.freeze({
      selectedChipCredits: context.selectedChipCredits ?? 100,
      totalBetLabel: formatCreditsFromCents(localBettingCents),
      readyLabel: localBettingStatus === "READY" ? "READY ✓" : "READY",
      bettingClosesLabel,
      enabled: bettingOpen && !bettingPending,
      pending: bettingPending,
      canClear: bettingOpen && localBettingCents > 0 && !bettingPending,
      canReady: bettingOpen && localBettingCents > 0 && !bettingPending,
      availableBalanceCents: context.availableBalanceCents ?? null,
    }),
    seats: Object.freeze(seats),
  });
}
