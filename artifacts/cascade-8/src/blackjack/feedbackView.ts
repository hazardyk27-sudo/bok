export type BlackjackFeedbackTone = "neutral" | "success" | "error";

export type BlackjackUiFeedback = Readonly<{
  label: string;
  tone: BlackjackFeedbackTone;
}>;

function normalizedCode(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}

export function blackjackErrorFeedback(
  error: unknown,
): BlackjackUiFeedback {
  const code=normalizedCode(error);

  if (/SESSION_REPLACED/.test(code)) {
    return { label:"SESSION REPLACED", tone:"error" };
  }
  if (
    /BLACKJACK_IDENTITY_UNAVAILABLE|BLACKJACK_AUTH_REQUIRED|AUTH_REQUIRED/.test(
      code,
    )
  ) {
    return { label:"SESSION UNAVAILABLE · RELOAD", tone:"error" };
  }
  if (
    /BLACKJACK_SNAPSHOT_UNAVAILABLE|BLACKJACK_CONNECTION_UNAVAILABLE|BLACKJACK_ACTION_PROTOCOL_NOT_READY|authoritative snapshot|reconnecting/i.test(
      code,
    )
  ) {
    return { label:"TABLE SYNCING · TRY AGAIN", tone:"neutral" };
  }
  if (/STALE_ACTION/.test(code)) {
    return { label:"TABLE UPDATED · TRY AGAIN", tone:"error" };
  }
  if (/SEAT_UNAVAILABLE/.test(code)) {
    return { label:"SEAT JUST TAKEN", tone:"error" };
  }
  if (/SEATING_NOT_READY/.test(code)) {
    return { label:"SEATING NOT READY", tone:"neutral" };
  }
  if (/SEAT_LEAVE_NOT_AVAILABLE/.test(code)) {
    return { label:"CANNOT LEAVE RIGHT NOW", tone:"error" };
  }
  if (/INVALID_SEAT_CLAIM|INVALID_SEAT_LEAVE/.test(code)) {
    return { label:"SEAT NOT AVAILABLE", tone:"error" };
  }
  if (/BETTING_STATE_UNAVAILABLE/.test(code)) {
    return { label:"BET SYNCING · TRY AGAIN", tone:"neutral" };
  }
  if (/BETTING phase|BETTING CLOSED|betting action requires/i.test(code)) {
    return { label:"BETTING CLOSED", tone:"error" };
  }
  if (/already pending/i.test(code)) {
    return { label:"REQUEST ALREADY PROCESSING", tone:"neutral" };
  }
  if (/not currently available|INVALID_ACTION/.test(code)) {
    return { label:"ACTION NOT AVAILABLE", tone:"error" };
  }
  if (/valid chipValueCents|chip/i.test(code)) {
    return { label:"CHIP NOT AVAILABLE", tone:"error" };
  }
  if (/detached|CONNECTION ERROR|BLACKJACK_ACTION_ERROR/i.test(code)) {
    return { label:"CONNECTION ERROR · TRY AGAIN", tone:"error" };
  }

  return { label:"REQUEST COULD NOT BE SENT", tone:"error" };
}

export function blackjackAcceptedFeedback(
  scope: "ACTION" | "BET" | "SEAT" | "LEAVE",
  detail?: string,
): BlackjackUiFeedback {
  if(scope==="ACTION"){
    return {
      label:(detail ?? "ACTION") + " · CONFIRMED",
      tone:"success",
    };
  }
  if(scope==="BET"){
    return {
      label:detail==="READY" ? "BET READY" : "BET UPDATED",
      tone:"success",
    };
  }
  if(scope==="SEAT"){
    return { label:"SEAT TAKEN", tone:"success" };
  }
  return { label:"LEFT TABLE", tone:"success" };
}
