import {
  isBlackjackSeatNumber,
} from "./seats";

export type BlackjackSeatClaimRequest = Readonly<{
  type:"CLAIM_SEAT";
  requestId:string;
  seatNumber:1|2|3|4|5;
}>;

export type BlackjackSeatClaimAccepted = Readonly<{
  type:"SEAT_CLAIM_ACCEPTED";
  requestId:string;
  seatNumber:1|2|3|4|5;
  replayed:boolean;
  stateVersion:number;
  eventSequence:number;
}>;

function isRecord(value: unknown): value is Record<string,unknown> {
  return typeof value==="object" && value!==null;
}

export function parseBlackjackSeatClaimRequest(
  value: unknown,
): BlackjackSeatClaimRequest | null {
  if(!isRecord(value) || value.type!=="CLAIM_SEAT") return null;
  if(
    typeof value.requestId!=="string" ||
    !value.requestId.trim() ||
    typeof value.seatNumber!=="number" ||
    !isBlackjackSeatNumber(value.seatNumber)
  ){
    throw new RangeError("Blackjack seat claim payload is invalid");
  }
  return Object.freeze({
    type:"CLAIM_SEAT",
    requestId:value.requestId,
    seatNumber:value.seatNumber,
  });
}
