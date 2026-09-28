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
    snapshot.phase === "BETTING" &&
    localPlayer !== null &&
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

  return Object.freeze({
    phaseLabel: formatPhaseLabel(snapshot.phase),
    balanceLabel,
    betLabel: formatCreditsFromCents(localBettingCents),
    turnLabel: resolveTurnLabel(snapshot, localSeatNumber),
    dealerTotalLabel: resolveDealerLabel(snapshot),
    dealerCards: Object.freeze(
      (snapshot.round?.dealer.cards ?? []).map((card) =>
        card === null
          ? null
          : Object.freeze({ rank: card.rank, suit: card.suit }),
      ),
    ),
    enabledActions: getBlackjackAvailablePlayerActions(snapshot, context),
    actionStatusLabel: context.actionStatusLabel ?? null,
    actionStatusTone: context.actionStatusTone ?? "neutral",
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
