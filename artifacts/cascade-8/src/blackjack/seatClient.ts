import type {
  BlackjackRealtimeSocketLike,
} from "./realtimeClient";

export type BlackjackSeatCommandPending = Readonly<{
  requestId:string;
  type:"CLAIM_SEAT"|"LEAVE_SEAT";
  seatNumber:number|null;
  acceptedStateVersion:number|null;
  acceptedEventSequence:number|null;
}>;

export type BlackjackConfirmedSeat = Readonly<{
  playerId:string;
  seatNumber:1|2|3|4|5;
  availableBalanceCents:number;
  reservedBalanceCents:number;
}>;

export type BlackjackSeatCommandClient = Readonly<{
  claim:(seatNumber:1|2|3|4|5)=>void;
  leave:()=>void;
  receive:(rawMessage:unknown)=>void;
  getPending:()=>BlackjackSeatCommandPending|null;
  getConfirmed:()=>BlackjackConfirmedSeat|null;
  detach:()=>void;
}>;

function isRecord(value:unknown): value is Record<string,unknown>{
  return typeof value==="object" && value!==null;
}

function parse(raw:unknown):unknown{
  if(typeof raw!=="string") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function snapshotCursor(message:unknown):
  {stateVersion:number;eventSequence:number}|null {
  if(!isRecord(message)) return null;
  const candidate=
    message.type==="snapshot" || message.type==="FULL_TABLE_SNAPSHOT"
      ? message.snapshot
      : null;
  if(!isRecord(candidate)) return null;
  if(
    typeof candidate.stateVersion!=="number" ||
    !Number.isSafeInteger(candidate.stateVersion) ||
    candidate.stateVersion<0 ||
    typeof candidate.eventSequence!=="number" ||
    !Number.isSafeInteger(candidate.eventSequence) ||
    candidate.eventSequence<0
  ) return null;
  return {
    stateVersion:candidate.stateVersion,
    eventSequence:candidate.eventSequence,
  };
}

function parseConfirmedSeat(
  message:Record<string,unknown>,
):BlackjackConfirmedSeat|null{
  if(
    message.type!=="SEAT_CLAIM_ACCEPTED" ||
    typeof message.playerId!=="string" ||
    !message.playerId.trim() ||
    typeof message.seatNumber!=="number" ||
    !Number.isInteger(message.seatNumber) ||
    message.seatNumber<1 ||
    message.seatNumber>5 ||
    typeof message.availableBalanceCents!=="number" ||
    !Number.isSafeInteger(message.availableBalanceCents) ||
    message.availableBalanceCents<0 ||
    typeof message.reservedBalanceCents!=="number" ||
    !Number.isSafeInteger(message.reservedBalanceCents) ||
    message.reservedBalanceCents<0
  ){
    return null;
  }

  return Object.freeze({
    playerId:message.playerId,
    seatNumber:message.seatNumber as 1|2|3|4|5,
    availableBalanceCents:message.availableBalanceCents,
    reservedBalanceCents:message.reservedBalanceCents,
  });
}

export function createBlackjackSeatCommandClient(input:{
  socket:BlackjackRealtimeSocketLike;
  createRequestId:()=>string;
  onPendingChange?:()=>void;
}):BlackjackSeatCommandClient{
  let pending:BlackjackSeatCommandPending|null=null;
  let confirmed:BlackjackConfirmedSeat|null=null;
  let detached=false;
  const changed=()=>input.onPendingChange?.();

  const start=(
    type:"CLAIM_SEAT"|"LEAVE_SEAT",
    seatNumber:number|null,
  )=>{
    if(detached) throw new Error("Blackjack seat client is detached");
    if(pending) throw new Error("Blackjack seat command is already pending");
    const requestId=input.createRequestId();
    if(!requestId.trim()) throw new Error("Blackjack seat requestId is empty");
    pending=Object.freeze({
      requestId,type,seatNumber,
      acceptedStateVersion:null,
      acceptedEventSequence:null,
    });
    changed();
    input.socket.send(JSON.stringify({
      type,
      requestId,
      ...(seatNumber===null?{}:{seatNumber}),
    }));
  };

  const receive=(rawMessage:unknown)=>{
    if(detached) return;
    const message=parse(rawMessage);
    if(!isRecord(message)) return;

    if(
      pending!==null &&
      (
        message.type==="SEAT_CLAIM_REJECTED" ||
        message.type==="SEAT_LEAVE_REJECTED"
      ) &&
      (
        message.requestId===undefined ||
        message.requestId===pending.requestId
      )
    ){
      pending=null;
      changed();
      return;
    }

    if(
      pending!==null &&
      message.type==="SEAT_CLAIM_ACCEPTED" &&
      message.requestId===pending.requestId &&
      typeof message.stateVersion==="number" &&
      Number.isSafeInteger(message.stateVersion) &&
      message.stateVersion>=0 &&
      typeof message.eventSequence==="number" &&
      Number.isSafeInteger(message.eventSequence) &&
      message.eventSequence>=0
    ){
      const nextConfirmed=parseConfirmedSeat(message);
      if(nextConfirmed===null) return;
      confirmed=nextConfirmed;
      pending=Object.freeze({
        ...pending,
        acceptedStateVersion:message.stateVersion,
        acceptedEventSequence:message.eventSequence,
      });
      changed();
      return;
    }

    if(
      pending!==null &&
      message.type==="SEAT_LEAVE_ACCEPTED" &&
      message.requestId===pending.requestId &&
      typeof message.stateVersion==="number" &&
      Number.isSafeInteger(message.stateVersion) &&
      message.stateVersion>=0 &&
      typeof message.eventSequence==="number" &&
      Number.isSafeInteger(message.eventSequence) &&
      message.eventSequence>=0
    ){
      pending=Object.freeze({
        ...pending,
        acceptedStateVersion:message.stateVersion,
        acceptedEventSequence:message.eventSequence,
      });
      changed();
      return;
    }

    if(
      message.type==="SESSION_REPLACED" ||
      message.type==="error"
    ){
      if(pending!==null){
        pending=null;
        changed();
      }
      return;
    }

    if(pending===null) return;
    const cursor=snapshotCursor(message);
    if(
      cursor &&
      pending.acceptedStateVersion!==null &&
      pending.acceptedEventSequence!==null &&
      cursor.stateVersion>=pending.acceptedStateVersion &&
      cursor.eventSequence>=pending.acceptedEventSequence
    ){
      if(pending.type==="LEAVE_SEAT"){
        confirmed=null;
      }
      pending=null;
      changed();
    }
  };

  const onMessage=(event:MessageEvent<unknown>)=>receive(event.data);
  input.socket.addEventListener("message",onMessage);

  return Object.freeze({
    claim:(seatNumber)=>{
      if(!Number.isInteger(seatNumber) || seatNumber<1 || seatNumber>5){
        throw new RangeError("Blackjack seatNumber must be 1-5");
      }
      start("CLAIM_SEAT",seatNumber);
    },
    leave:()=>start("LEAVE_SEAT",null),
    receive,
    getPending:()=>pending,
    getConfirmed:()=>confirmed,
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      pending=null;
      confirmed=null;
    },
  });
}
