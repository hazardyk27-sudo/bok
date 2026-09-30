import { type PoolClient } from "@workspace/db";
import {
  MARKET_CONFIG,
  TICKET_MICRO_UNITS,
} from "../../../cascade-8/src/idle/config";
import type {
  IdleTicketSaleResponse,
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";
import {
  INITIAL_SHARED_BALANCE_CENTS,
  SHARED_WALLET_TABLE,
} from "../platform/wallet";
import {
  MARKET_MICRODOLLARS_PER_CENT,
  bigintToSafeNumber,
  requireSafeNonNegativeInteger,
  settleMarketMicrodollarsToWalletCents,
} from "./fixedPoint";
import {
  ticketMarketPersistence,
} from "./marketPersistence";
import {
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
  type StadiumStorageState,
} from "./stadiumRepository";
import {
  runCheckpointedStadiumMutation,
} from "./stadiumMutation";
import { reserveStadiumActionReceipt } from "./stadiumActionReceipt";

const TICKET_SALE_ACTION = "TICKET_SALE" as const;

type TicketSaleReceiptRow = {
  session_id: string;
  action_type: string;
  requested_quantity: number | null;
  sold_tickets: number;
  execution_price_microdollars: number;
  gross_sale_microdollars: number;
  wallet_credit_cents: number;
  sale_remainder_microdollars: number;
  balance_cents: number;
  market_source: string | null;
  market_feed_status: string | null;
  market_tick_at: Date | null;
};

export type WholeTicketSaleQuote = {
  soldTickets: number;
  soldMicroTickets: number;
  resultingStoredMicroTickets: number;
  executionPriceMicrodollars: number;
  grossSaleMicrodollars: number;
  walletCreditCents: number;
  saleRemainderMicrodollars: number;
};

function requirePositiveTicketQuantity(
  quantityTickets: number,
) {
  if (
    !Number.isSafeInteger(quantityTickets)
    || quantityTickets <= 0
  ) {
    throw new Error("INVALID_IDLE_TICKET_SALE_QUANTITY");
  }
  return quantityTickets;
}

function requireValidExecutionPrice(
  priceMicrodollars: number,
) {
  if (
    !Number.isSafeInteger(priceMicrodollars)
    || priceMicrodollars
      < MARKET_CONFIG.minTicketPriceMicrodollars
    || priceMicrodollars
      > MARKET_CONFIG.maxTicketPriceMicrodollars
  ) {
    throw new Error("INVALID_IDLE_TICKET_PRICE");
  }
  return priceMicrodollars;
}

function parseMarketSource(
  source: string | null,
): TicketMarketSource {
  if (
    source === "binance-btcusdt"
    || source === "coinbase-btc-usd"
    || source === "none"
  ) {
    return source;
  }

  throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
}

function parseMarketFeedStatus(
  status: string | null,
): TicketMarketFeedStatus {
  if (
    status === "CONNECTING"
    || status === "REBASELINING"
    || status === "LIVE"
    || status === "STALE"
    || status === "FROZEN"
  ) {
    return status;
  }

  throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
}

function requireReceiptDate(value: Date | null) {
  if (
    !(value instanceof Date)
    || !Number.isFinite(value.getTime())
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }
  return value;
}

async function ensureSharedWalletForUpdate(
  client: PoolClient,
  sessionId: string,
) {
  await client.query(
    `INSERT INTO ${SHARED_WALLET_TABLE} (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  const result = await client.query<{ balance_cents: number }>(
    `SELECT balance_cents
       FROM ${SHARED_WALLET_TABLE}
      WHERE session_id = $1
      FOR UPDATE`,
    [sessionId],
  );

  const balanceCents = Number(
    result.rows[0]?.balance_cents
      ?? INITIAL_SHARED_BALANCE_CENTS,
  );

  if (
    !Number.isSafeInteger(balanceCents)
    || balanceCents < 0
  ) {
    throw new Error("INVALID_IDLE_WALLET_BALANCE");
  }

  return balanceCents;
}

/**
 * Part 21 sells whole tickets only. Inventory itself remains persisted in
 * microtickets so production precision is not lost; fractional-ticket selling
 * can be introduced explicitly later without changing inventory storage.
 *
 * Market-price × whole-ticket quantity is exact in microdollars. The Part 14
 * settlement helper carries any sub-cent value forward into Stadium state.
 */
export function quoteWholeTicketSale(input: {
  state: Pick<
    StadiumStorageState,
    "storedMicroTickets" | "saleRemainderMicrodollars"
  >;
  quantityTickets: number;
  executionPriceMicrodollars: number;
}): WholeTicketSaleQuote {
  const quantityTickets = requirePositiveTicketQuantity(
    input.quantityTickets,
  );
  const executionPriceMicrodollars =
    requireValidExecutionPrice(
      input.executionPriceMicrodollars,
    );

  const storedMicroTickets =
    requireSafeNonNegativeInteger(
      input.state.storedMicroTickets,
      "INVALID_IDLE_STORED_MICROTICKETS",
    );
  const priorRemainderMicrodollars =
    requireSafeNonNegativeInteger(
      input.state.saleRemainderMicrodollars,
      "INVALID_IDLE_SALE_REMAINDER",
    );

  if (
    priorRemainderMicrodollars >=
    MARKET_MICRODOLLARS_PER_CENT
  ) {
    throw new Error("INVALID_IDLE_SALE_REMAINDER");
  }

  const soldMicroTicketsBig =
    BigInt(quantityTickets) * BigInt(TICKET_MICRO_UNITS);
  const storedMicroTicketsBig =
    BigInt(storedMicroTickets);

  if (soldMicroTicketsBig > storedMicroTicketsBig) {
    throw new Error("INSUFFICIENT_IDLE_TICKETS");
  }

  const grossSaleMicrodollarsBig =
    BigInt(quantityTickets)
    * BigInt(executionPriceMicrodollars);

  const soldMicroTickets = bigintToSafeNumber(
    soldMicroTicketsBig,
    "IDLE_TICKET_SALE_QUANTITY_OVERFLOW",
  );
  const grossSaleMicrodollars = bigintToSafeNumber(
    grossSaleMicrodollarsBig,
    "IDLE_GROSS_SALE_OVERFLOW",
  );

  const settlement =
    settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars,
      priorRemainderMicrodollars,
    });

  return {
    soldTickets: quantityTickets,
    soldMicroTickets,
    resultingStoredMicroTickets:
      storedMicroTickets - soldMicroTickets,
    executionPriceMicrodollars,
    grossSaleMicrodollars,
    walletCreditCents:
      settlement.walletCreditCents,
    saleRemainderMicrodollars:
      settlement.saleRemainderMicrodollars,
  };
}

function assertTicketSaleReplay(
  receipt: TicketSaleReceiptRow,
  sessionId: string,
  requestedQuantity: number,
) {
  if (
    receipt.session_id !== sessionId
    || receipt.action_type !== TICKET_SALE_ACTION
    || Number(receipt.requested_quantity)
      !== requestedQuantity
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  const soldTickets = Number(receipt.sold_tickets);
  const executionPriceMicrodollars = Number(
    receipt.execution_price_microdollars,
  );
  const grossSaleMicrodollars = Number(
    receipt.gross_sale_microdollars,
  );
  const walletCreditCents = Number(
    receipt.wallet_credit_cents,
  );
  const saleRemainderMicrodollars = Number(
    receipt.sale_remainder_microdollars,
  );
  const balanceCents = Number(receipt.balance_cents);

  if (
    !Number.isSafeInteger(soldTickets)
    || soldTickets !== requestedQuantity
    || !Number.isSafeInteger(executionPriceMicrodollars)
    || executionPriceMicrodollars
      < MARKET_CONFIG.minTicketPriceMicrodollars
    || executionPriceMicrodollars
      > MARKET_CONFIG.maxTicketPriceMicrodollars
    || !Number.isSafeInteger(grossSaleMicrodollars)
    || grossSaleMicrodollars < 0
    || !Number.isSafeInteger(walletCreditCents)
    || walletCreditCents < 0
    || !Number.isSafeInteger(saleRemainderMicrodollars)
    || saleRemainderMicrodollars < 0
    || saleRemainderMicrodollars
      >= MARKET_MICRODOLLARS_PER_CENT
    || !Number.isSafeInteger(balanceCents)
    || balanceCents < walletCreditCents
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }

  const expectedGross =
    BigInt(soldTickets)
    * BigInt(executionPriceMicrodollars);

  if (
    expectedGross !== BigInt(grossSaleMicrodollars)
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }

  const impliedPriorRemainder =
    BigInt(walletCreditCents)
    * BigInt(MARKET_MICRODOLLARS_PER_CENT)
    + BigInt(saleRemainderMicrodollars)
    - BigInt(grossSaleMicrodollars);

  if (
    impliedPriorRemainder < 0n
    || impliedPriorRemainder
      >= BigInt(MARKET_MICRODOLLARS_PER_CENT)
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }
}

/**
 * Atomically sells stored tickets at the authoritative persisted global market
 * price observed while processing the request.
 *
 * Transaction order:
 *   1. checkpoint/lock Stadium production under old economy state,
 *   2. reserve/resolve idempotency receipt,
 *   3. SELECT global market state FOR SHARE,
 *   4. lock shared wallet,
 *   5. credit wallet + decrement ticket inventory + persist sale receipt,
 *   6. commit via the Stadium mutation boundary.
 *
 * No client-submitted price is accepted.
 */
export async function sellStadiumTickets(
  sessionId: string,
  quantityTickets: number,
  idempotencyKey: string,
  serverNow = new Date(),
): Promise<IdleTicketSaleResponse> {
  requirePositiveTicketQuantity(quantityTickets);

  const mutation = await runCheckpointedStadiumMutation(
    sessionId,
    serverNow,
    async ({ client, settledState }) => {
      const reservation = await reserveStadiumActionReceipt(
        client,
        {
          sessionId,
          actionType: "TICKET_SALE",
          idempotencyKey,
          requestedQuantity: quantityTickets,
        },
      );

      if (!reservation.created) {
        const replayResult =
          await client.query<TicketSaleReceiptRow>(
            `SELECT session_id, action_type, requested_quantity,
                    sold_tickets, execution_price_microdollars,
                    gross_sale_microdollars, wallet_credit_cents,
                    sale_remainder_microdollars, balance_cents,
                    market_source, market_feed_status, market_tick_at
               FROM idle_stadium_action_receipts
              WHERE idempotency_key = $1`,
            [idempotencyKey],
          );

        const receipt = replayResult.rows[0];
        if (!receipt) {
          throw new Error("IDLE_STADIUM_RECEIPT_MISSING");
        }

        assertTicketSaleReplay(
          receipt,
          sessionId,
          quantityTickets,
        );

        const currentBalanceCents =
          await ensureSharedWalletForUpdate(
            client,
            sessionId,
          );

        const marketTickAt =
          requireReceiptDate(receipt.market_tick_at);

        return {
          patch: {},
          result: {
            soldTickets: Number(receipt.sold_tickets),
            executionPriceMicrodollars:
              Number(
                receipt.execution_price_microdollars,
              ),
            grossSaleMicrodollars:
              Number(receipt.gross_sale_microdollars),
            walletCreditCents:
              Number(receipt.wallet_credit_cents),
            saleRemainderMicrodollars:
              Number(
                receipt.sale_remainder_microdollars,
              ),
            balanceCents:
              currentBalanceCents,
            market: {
              priceMicrodollars:
                Number(
                  receipt.execution_price_microdollars,
                ),
              source:
                parseMarketSource(receipt.market_source),
              feedStatus:
                parseMarketFeedStatus(
                  receipt.market_feed_status,
                ),
              tickAt: marketTickAt.toISOString(),
            },
            replayed: true,
          },
        };
      }

      const market =
        await ticketMarketPersistence
          .getCurrentStateForShareOnClient(client);

      if (!market) {
        throw new Error("IDLE_MARKET_STATE_MISSING");
      }

      const quote = quoteWholeTicketSale({
        state: settledState,
        quantityTickets,
        executionPriceMicrodollars:
          market.priceMicrodollars,
      });

      const balanceBeforeCents =
        await ensureSharedWalletForUpdate(
          client,
          sessionId,
        );

      const balanceCents = bigintToSafeNumber(
        BigInt(balanceBeforeCents)
          + BigInt(quote.walletCreditCents),
        "IDLE_WALLET_BALANCE_OVERFLOW",
      );

      await client.query(
        `UPDATE ${SHARED_WALLET_TABLE}
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      const receiptUpdate = await client.query<{ id: string }>(
        `UPDATE idle_stadium_action_receipts
            SET sold_tickets = $2,
                execution_price_microdollars = $3,
                gross_sale_microdollars = $4,
                wallet_credit_cents = $5,
                sale_remainder_microdollars = $6,
                balance_cents = $7,
                market_source = $8,
                market_feed_status = $9,
                market_tick_at = $10
          WHERE idempotency_key = $1
            AND session_id = $11
            AND action_type = $12
        RETURNING id`,
        [
          idempotencyKey,
          quote.soldTickets,
          quote.executionPriceMicrodollars,
          quote.grossSaleMicrodollars,
          quote.walletCreditCents,
          quote.saleRemainderMicrodollars,
          balanceCents,
          market.source,
          market.feedStatus,
          market.tickAt,
          sessionId,
          TICKET_SALE_ACTION,
        ],
      );

      if (!receiptUpdate.rows[0]) {
        throw new Error("IDLE_STADIUM_RECEIPT_UPDATE_CONFLICT");
      }

      return {
        patch: {
          storedMicroTickets:
            quote.resultingStoredMicroTickets,
          saleRemainderMicrodollars:
            quote.saleRemainderMicrodollars,
        },
        result: {
          soldTickets: quote.soldTickets,
          executionPriceMicrodollars:
            quote.executionPriceMicrodollars,
          grossSaleMicrodollars:
            quote.grossSaleMicrodollars,
          walletCreditCents:
            quote.walletCreditCents,
          saleRemainderMicrodollars:
            quote.saleRemainderMicrodollars,
          balanceCents,
          market: {
            priceMicrodollars:
              market.priceMicrodollars,
            source: market.source,
            feedStatus: market.feedStatus,
            tickAt: market.tickAt.toISOString(),
          },
          replayed: false,
        },
      };
    },
  );

  const settledProjection =
    projectPersistedStadiumState(
      mutation.state,
      mutation.state.productionCheckpointAt,
    );

  return {
    serverTime: serverNow.toISOString(),
    soldTickets: mutation.result.soldTickets,
    executionPriceMicrodollars:
      mutation.result.executionPriceMicrodollars,
    grossSaleMicrodollars:
      mutation.result.grossSaleMicrodollars,
    walletCreditCents:
      mutation.result.walletCreditCents,
    saleRemainderMicrodollars:
      mutation.result.saleRemainderMicrodollars,
    balanceCents: mutation.result.balanceCents,
    replayed: mutation.result.replayed,
    stadium:
      stadiumProjectionToServerState(
        settledProjection,
      ),
    market: mutation.result.market,
  };
}
