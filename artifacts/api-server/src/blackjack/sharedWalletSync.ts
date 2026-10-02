import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
} from "./snapshotState";
import {
  rebaseBlackjackWalletAvailableBalance,
} from "./walletLedger";

export type BlackjackSharedWalletMutation = Readonly<{
  userId: string;
  previousSnapshotBalanceCents: number | null;
  candidateSnapshotBalanceCents: number;
  sharedBalanceBeforeCents: number;
  deltaCents: number;
  sharedBalanceAfterCents: number;
}>;

function assertMoney(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack shared-wallet " + label +
      " must be a non-negative safe integer",
    );
  }
}

function safeSignedDelta(next: number, previous: number): number {
  assertMoney("candidate balance", next);
  assertMoney("previous snapshot balance", previous);
  const delta=next-previous;
  if(!Number.isSafeInteger(delta)){
    throw new RangeError(
      "Blackjack shared-wallet delta exceeds safe integer range",
    );
  }
  return delta;
}

export function rebaseBlackjackSnapshotAgainstSharedWallets(input: {
  previous: BlackjackDurableSnapshot | null;
  candidate: BlackjackDurableSnapshot;
  sharedBalances: ReadonlyMap<string, number>;
}): Readonly<{
  snapshot: BlackjackDurableSnapshot;
  mutations: readonly BlackjackSharedWalletMutation[];
}> {
  const previousByUser=new Map(
    input.previous?.payload.wallets.map(
      (wallet)=>[wallet.userId,wallet] as const,
    ) ?? [],
  );

  const mutations: BlackjackSharedWalletMutation[]=[];
  const wallets=input.candidate.payload.wallets.map((wallet)=>{
    const sharedBalance=input.sharedBalances.get(wallet.userId);
    if(sharedBalance===undefined){
      throw new Error(
        "BLACKJACK_SHARED_WALLET_MISSING:" + wallet.userId,
      );
    }
    assertMoney("current balance",sharedBalance);

    const previous=previousByUser.get(wallet.userId);
    const delta=previous
      ? safeSignedDelta(
          wallet.availableBalanceCents,
          previous.availableBalanceCents,
        )
      : 0;
    const nextShared=sharedBalance+delta;
    if(
      !Number.isSafeInteger(nextShared) ||
      nextShared<0
    ){
      throw new Error(
        "BLACKJACK_SHARED_WALLET_INSUFFICIENT_AFTER_EXTERNAL_CHANGE",
      );
    }

    mutations.push(Object.freeze({
      userId:wallet.userId,
      previousSnapshotBalanceCents:
        previous?.availableBalanceCents ?? null,
      candidateSnapshotBalanceCents:
        wallet.availableBalanceCents,
      sharedBalanceBeforeCents:sharedBalance,
      deltaCents:delta,
      sharedBalanceAfterCents:nextShared,
    }));

    return rebaseBlackjackWalletAvailableBalance(
      wallet,
      nextShared,
    );
  });

  const snapshot=createBlackjackDurableSnapshot(
    Object.freeze({
      ...input.candidate.payload,
      wallets:Object.freeze(wallets),
    }),
    input.candidate.savedAtMs,
  );

  return Object.freeze({
    snapshot,
    mutations:Object.freeze(mutations),
  });
}
