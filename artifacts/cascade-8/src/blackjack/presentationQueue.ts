import type { BlackjackPublicSnapshotViewSource } from "./snapshotView";

type BlackjackPresentationCard = Readonly<{
  suit: "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
  rank:
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
}>;

type BlackjackPresentationMeta = Readonly<{
  eventSequence: number;
  stateVersion: number;
  roundId: string | null;
}>;

export type BlackjackPresentationEvent =
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "ROUND_CHANGED";
        previousRoundId: string | null;
        nextRoundId: string | null;
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "PHASE_CHANGED";
        previousPhase: BlackjackPublicSnapshotViewSource["phase"];
        nextPhase: BlackjackPublicSnapshotViewSource["phase"];
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "HAND_CREATED";
        playerId: string;
        seatNumber: 1 | 2 | 3 | 4 | 5;
        handId: string;
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "PLAYER_CARD_DEALT";
        playerId: string;
        seatNumber: 1 | 2 | 3 | 4 | 5;
        handId: string;
        cardIndex: number;
        card: BlackjackPresentationCard;
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "DEALER_CARD_DEALT";
        cardIndex: number;
        hidden: boolean;
        card: BlackjackPresentationCard | null;
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "DEALER_HOLE_REVEALED";
        cardIndex: number;
        card: BlackjackPresentationCard;
      }>)
  | (BlackjackPresentationMeta &
      Readonly<{
        type: "HAND_SETTLED";
        playerId: string;
        seatNumber: 1 | 2 | 3 | 4 | 5;
        handId: string;
        result: "WIN" | "LOSS" | "PUSH" | "BLACKJACK_WIN";
        betCents: number;
        payoutCents: number;
      }>);

export type BlackjackPresentationEventPlayer = (
  event: BlackjackPresentationEvent,
) => void | Promise<void>;

export type BlackjackPresentationQueue = Readonly<{
  enqueue: (events: readonly BlackjackPresentationEvent[]) => void;
  clear: () => void;
  getPendingCount: () => number;
  isRunning: () => boolean;
  whenIdle: () => Promise<void>;
}>;

export const BLACKJACK_PRESENTATION_EVENT_NAME =
  "blackjack:presentation" as const;

function roundIdOf(snapshot: BlackjackPublicSnapshotViewSource): string | null {
  const roundId=snapshot.round?.roundId;
  return typeof roundId === "string" && roundId.length > 0 ? roundId : null;
}

function cardEquals(
  left: BlackjackPresentationCard | null | undefined,
  right: BlackjackPresentationCard | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.suit === right.suit && left.rank === right.rank;
}

function snapshotMeta(
  snapshot: BlackjackPublicSnapshotViewSource,
): BlackjackPresentationMeta {
  return Object.freeze({
    eventSequence:snapshot.eventSequence,
    stateVersion:snapshot.stateVersion,
    roundId:roundIdOf(snapshot),
  });
}

export function deriveBlackjackPresentationEvents(
  previous: BlackjackPublicSnapshotViewSource,
  next: BlackjackPublicSnapshotViewSource,
): readonly BlackjackPresentationEvent[] {
  const events: BlackjackPresentationEvent[]=[];
  const meta=snapshotMeta(next);
  const previousRoundId=roundIdOf(previous);
  const nextRoundId=roundIdOf(next);

  if(previousRoundId!==nextRoundId){
    events.push(Object.freeze({
      ...meta,
      type:"ROUND_CHANGED" as const,
      previousRoundId,
      nextRoundId,
    }));
  }

  if(previous.phase!==next.phase){
    events.push(Object.freeze({
      ...meta,
      type:"PHASE_CHANGED" as const,
      previousPhase:previous.phase,
      nextPhase:next.phase,
    }));
  }

  if(next.round===null) return Object.freeze(events);

  const previousHands=new Map(
    (previous.round?.hands ?? []).map((hand)=>[hand.handId,hand] as const),
  );
  const nextHands=[...next.round.hands].sort((left,right)=>
    left.seatNumber-right.seatNumber || left.handId.localeCompare(right.handId),
  );
  const splitLikeTransition=
    previous.phase==="PLAYER_TURNS" && next.phase==="PLAYER_TURNS";

  for(const hand of nextHands){
    if(!previousHands.has(hand.handId)){
      events.push(Object.freeze({
        ...meta,
        type:"HAND_CREATED" as const,
        playerId:hand.playerId,
        seatNumber:hand.seatNumber,
        handId:hand.handId,
      }));
    }
  }

  const maxPlayerCards=nextHands.reduce(
    (maximum,hand)=>Math.max(maximum,hand.cards.length),
    0,
  );
  const dealerCards=next.round.dealer.cards;
  const maxDealIndex=Math.max(maxPlayerCards,dealerCards.length);

  for(let cardIndex=0;cardIndex<maxDealIndex;cardIndex+=1){
    for(const hand of nextHands){
      const card=hand.cards[cardIndex];
      if(card===undefined) continue;
      const previousHand=previousHands.get(hand.handId);
      if(previousHand===undefined && splitLikeTransition) continue;
      const previousCard=previousHand?.cards[cardIndex];
      if(cardEquals(previousCard,card)) continue;
      if(previousCard!==undefined) continue;

      events.push(Object.freeze({
        ...meta,
        type:"PLAYER_CARD_DEALT" as const,
        playerId:hand.playerId,
        seatNumber:hand.seatNumber,
        handId:hand.handId,
        cardIndex,
        card:Object.freeze({ suit:card.suit, rank:card.rank }),
      }));
    }

    const nextDealerCard=dealerCards[cardIndex];
    if(nextDealerCard===undefined) continue;
    const previousDealerCard=previous.round?.dealer.cards[cardIndex];

    if(previousDealerCard===null && nextDealerCard!==null){
      events.push(Object.freeze({
        ...meta,
        type:"DEALER_HOLE_REVEALED" as const,
        cardIndex,
        card:Object.freeze({
          suit:nextDealerCard.suit,
          rank:nextDealerCard.rank,
        }),
      }));
      continue;
    }

    if(cardEquals(previousDealerCard,nextDealerCard)) continue;
    if(previousDealerCard!==undefined) continue;

    events.push(Object.freeze({
      ...meta,
      type:"DEALER_CARD_DEALT" as const,
      cardIndex,
      hidden:nextDealerCard===null,
      card:
        nextDealerCard===null
          ? null
          : Object.freeze({
              suit:nextDealerCard.suit,
              rank:nextDealerCard.rank,
            }),
    }));
  }

  for(const hand of nextHands){
    if(
      hand.status!=="COMPLETE" ||
      hand.result===null ||
      hand.result===undefined ||
      hand.payoutCents===undefined
    ){
      continue;
    }

    const previousHand=previousHands.get(hand.handId);
    const alreadyPresented=
      previousHand?.status==="COMPLETE" &&
      previousHand.result===hand.result &&
      previousHand.betCents===hand.betCents &&
      previousHand.payoutCents===hand.payoutCents;
    if(alreadyPresented) continue;

    events.push(Object.freeze({
      ...meta,
      type:"HAND_SETTLED" as const,
      playerId:hand.playerId,
      seatNumber:hand.seatNumber,
      handId:hand.handId,
      result:hand.result,
      betCents:hand.betCents,
      payoutCents:hand.payoutCents,
    }));
  }

  return Object.freeze(events);
}

export function createBlackjackPresentationQueue(input: Readonly<{
  play: BlackjackPresentationEventPlayer;
  onError?: (error: unknown, event: BlackjackPresentationEvent) => void;
}>): BlackjackPresentationQueue {
  const pending: BlackjackPresentationEvent[]=[];
  const idleResolvers=new Set<()=>void>();
  let running=false;
  let generation=0;

  const resolveIdle=()=>{
    if(running || pending.length>0) return;
    for(const resolve of idleResolvers) resolve();
    idleResolvers.clear();
  };

  const pump=()=>{
    if(running || pending.length===0){
      resolveIdle();
      return;
    }
    running=true;
    const ownGeneration=generation;

    void (async()=>{
      while(ownGeneration===generation && pending.length>0){
        const event=pending.shift();
        if(event===undefined) break;
        try {
          await input.play(event);
        } catch(error) {
          try {
            input.onError?.(error,event);
          } catch {
            // Presentation failures must never poison the authoritative game loop.
          }
        }
      }
      running=false;
      if(pending.length>0) pump();
      else resolveIdle();
    })();
  };

  return Object.freeze({
    enqueue:(events)=>{
      if(events.length===0) return;
      pending.push(...events);
      pump();
    },
    clear:()=>{
      generation+=1;
      pending.length=0;
      if(!running) resolveIdle();
    },
    getPendingCount:()=>pending.length,
    isRunning:()=>running,
    whenIdle:()=>{
      if(!running && pending.length===0) return Promise.resolve();
      return new Promise<void>((resolve)=>{ idleResolvers.add(resolve); });
    },
  });
}
