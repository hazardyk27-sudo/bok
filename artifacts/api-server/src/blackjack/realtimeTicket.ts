import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { BlackjackRealtimeIdentity } from "./realtime";

export const BLACKJACK_REALTIME_TICKET_QUERY = "ticket" as const;
export const BLACKJACK_REALTIME_TICKET_TTL_MS = 2 * 60 * 60 * 1000;

export type BlackjackRealtimeTicketRecord = Readonly<{
  ticket: string;
  identity: BlackjackRealtimeIdentity;
  username: string;
  expiresAtMs: number;
}>;

const tickets = new Map<string, BlackjackRealtimeTicketRecord>();

function cleanupExpiredBlackjackRealtimeTickets(nowMs: number): void {
  for (const [ticket, record] of tickets) {
    if (record.expiresAtMs <= nowMs) tickets.delete(ticket);
  }
}

export function issueBlackjackRealtimeTicket(
  input: Readonly<{
    identity: BlackjackRealtimeIdentity;
    username: string;
    nowMs?: number;
    createTicket?: () => string;
  }>,
): BlackjackRealtimeTicketRecord {
  const nowMs = input.nowMs ?? Date.now();
  cleanupExpiredBlackjackRealtimeTickets(nowMs);

  const ticket = (input.createTicket ?? randomUUID)();
  if (!ticket || ticket.length < 20 || ticket.length > 200) {
    throw new Error("BLACKJACK_REALTIME_TICKET_INVALID");
  }
  if (!input.username.trim()) {
    throw new Error("BLACKJACK_REALTIME_USERNAME_INVALID");
  }

  const record = Object.freeze({
    ticket,
    identity: input.identity,
    username: input.username,
    expiresAtMs: nowMs + BLACKJACK_REALTIME_TICKET_TTL_MS,
  });
  tickets.set(ticket, record);
  return record;
}

export function resolveBlackjackRealtimeTicket(
  request: IncomingMessage,
  nowMs = Date.now(),
): BlackjackRealtimeIdentity | null {
  cleanupExpiredBlackjackRealtimeTickets(nowMs);

  let ticket: string | null = null;
  try {
    const url = new URL(request.url ?? "/", "http://blackjack.local");
    ticket = url.searchParams.get(BLACKJACK_REALTIME_TICKET_QUERY);
  } catch {
    return null;
  }

  if (!ticket) return null;
  const record = tickets.get(ticket);
  if (!record || record.expiresAtMs <= nowMs) {
    tickets.delete(ticket);
    return null;
  }

  return record.identity;
}

export function clearBlackjackRealtimeTicketsForTests(): void {
  tickets.clear();
}
