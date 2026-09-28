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


export type BlackjackSeatLeaveRequest = Readonly<{
  type:"LEAVE_SEAT";
  requestId:string;
}>;

export type BlackjackSeatLeaveAccepted = Readonly<{
  type:"SEAT_LEAVE_ACCEPTED";
  requestId:string;
  replayed:boolean;
  stateVersion:number;
  eventSequence:number;
}>;

export function parseBlackjackSeatLeaveRequest(
  value: unknown,
): BlackjackSeatLeaveRequest | null {
  if(!isRecord(value) || value.type!=="LEAVE_SEAT") return null;
  if(
    typeof value.requestId!=="string" ||
    !value.requestId.trim()
  ){
    throw new RangeError("Blackjack seat leave payload is invalid");
  }
  return Object.freeze({
    type:"LEAVE_SEAT",
    requestId:value.requestId,
  });
}
