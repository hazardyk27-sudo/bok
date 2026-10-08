import type {
  BlackjackServerActionRequest,
  BlackjackServerSnapshot,
} from "./serverContract";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `BLACKJACK_HTTP_${response.status}`);
  }
  return payload;
}

export async function fetchBlackjackServerState(): Promise<BlackjackServerSnapshot> {
  const response = await fetch("/api/blackjack/state", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return readJson<BlackjackServerSnapshot>(response);
}

export async function sendBlackjackServerAction(
  request: BlackjackServerActionRequest,
): Promise<BlackjackServerSnapshot> {
  const response = await fetch("/api/blackjack/action", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return readJson<BlackjackServerSnapshot>(response);
}
