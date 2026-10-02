import { describe, expect, it } from "vitest";
import {
  blackjackAcceptedFeedback,
  blackjackErrorFeedback,
} from "./feedbackView";

describe("blackjack safe user feedback mapping",()=>{
  it("maps protocol errors to short user-facing messages",()=>{
    expect(blackjackErrorFeedback("STALE_ACTION")).toEqual({
      label:"TABLE UPDATED · TRY AGAIN",
      tone:"error",
    });
    expect(blackjackErrorFeedback("SEAT_UNAVAILABLE")).toEqual({
      label:"SEAT JUST TAKEN",
      tone:"error",
    });
    expect(
      blackjackErrorFeedback("BLACKJACK_SNAPSHOT_UNAVAILABLE"),
    ).toEqual({
      label:"TABLE SYNCING · TRY AGAIN",
      tone:"neutral",
    });
  });

  it("does not expose unknown internal errors",()=>{
    const feedback=blackjackErrorFeedback(
      new Error("postgres duplicate key on blackjack_table_snapshots"),
    );
    expect(feedback).toEqual({
      label:"REQUEST COULD NOT BE SENT",
      tone:"error",
    });
    expect(feedback.label).not.toContain("postgres");
  });

  it("provides concise accepted feedback by interaction type",()=>{
    expect(blackjackAcceptedFeedback("ACTION","DOUBLE").label)
      .toBe("DOUBLE · CONFIRMED");
    expect(blackjackAcceptedFeedback("BET","READY").label)
      .toBe("BET READY");
    expect(blackjackAcceptedFeedback("SEAT").label)
      .toBe("SEAT TAKEN");
    expect(blackjackAcceptedFeedback("LEAVE").label)
      .toBe("LEFT TABLE");
  });
});
