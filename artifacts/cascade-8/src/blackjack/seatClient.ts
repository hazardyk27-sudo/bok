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

export type BlackjackSeatCommandFeedback = Readonly<{
  status:"ACCEPTED"|"REJECTED";
  requestId:string;
  type:"CLAIM_SEAT"|"LEAVE_SEAT";
  error:string|null;
}>;

export type BlackjackSeatCommandClient = Readonly<{
  claim:(seatNumber:1|2|3|4|5)=>void;
  leave:()=>void;
  receive:(rawMessage:unknown)=>void;
  getPending:()=>BlackjackSeatCommandPending|null;
  getFeedback:()=>BlackjackSeatCommandFeedback|null;
  clearFeedback:()=>void;
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
    typeof candidate.eventSequence!=="number" ||
    !Number.isSafeInteger(candidate.eventSequence)
  ) return null;
  return {
    stateVersion:candidate.stateVersion,
    eventSequence:candidate.eventSequence,
  };
}

export function createBlackjackSeatCommandClient(input:{
  socket:BlackjackRealtimeSocketLike;
  createRequestId:()=>string;
  onPendingChange?:()=>void;
  onFeedbackChange?:(feedback:BlackjackSeatCommandFeedback|null)=>void;
}):BlackjackSeatCommandClient{
  let pending:BlackjackSeatCommandPending|null=null;
  let feedback:BlackjackSeatCommandFeedback|null=null;
  let detached=false;
  const changed=()=>input.onPendingChange?.();
  const setFeedback=(next:BlackjackSeatCommandFeedback|null)=>{
    feedback=next;
    input.onFeedbackChange?.(feedback);
  };

  const start=(
    type:"CLAIM_SEAT"|"LEAVE_SEAT",
    seatNumber:number|null,
  )=>{
    if(detached) throw new Error("Blackjack seat client is detached");
    if(pending) throw new Error("Blackjack seat command is already pending");
    const requestId=input.createRequestId();
    if(!requestId.trim()) throw new Error("Blackjack seat requestId is empty");
    setFeedback(null);
    pending=Object.freeze({
      requestId,type,seatNumber,
      acceptedStateVersion:null,
      acceptedEventSequence:null,
    });
    changed();
    try {
      input.socket.send(JSON.stringify({
        type,
        requestId,
        ...(seatNumber===null?{}:{seatNumber}),
      }));
    } catch(error) {
      pending=null;
      changed();
      setFeedback(Object.freeze({
        status:"REJECTED",
        requestId,
        type,
        error:error instanceof Error ? error.message : "BLACKJACK_CONNECTION_ERROR",
      }));
      throw error;
    }
  };

  const receive=(rawMessage:unknown)=>{
    if(detached || pending===null) return;
    const message=parse(rawMessage);
    if(!isRecord(message)) return;

    if(
      (
        message.type==="SEAT_CLAIM_REJECTED" ||
        message.type==="SEAT_LEAVE_REJECTED"
      ) &&
      (
        message.requestId===undefined ||
        message.requestId===pending.requestId
      )
    ){
      const failed=pending;
      pending=null;
      changed();
      setFeedback(Object.freeze({
        status:"REJECTED",
        requestId:failed.requestId,
        type:failed.type,
        error:typeof message.error==="string"
          ? message.error
          : "SEAT_NOT_AVAILABLE",
      }));
      return;
    }

    if(
      (
        message.type==="SEAT_CLAIM_ACCEPTED" ||
        message.type==="SEAT_LEAVE_ACCEPTED"
      ) &&
      message.requestId===pending.requestId &&
      typeof message.stateVersion==="number" &&
      Number.isSafeInteger(message.stateVersion) &&
      typeof message.eventSequence==="number" &&
      Number.isSafeInteger(message.eventSequence)
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
      const failed=pending;
      pending=null;
      changed();
      setFeedback(Object.freeze({
        status:"REJECTED",
        requestId:failed.requestId,
        type:failed.type,
        error:
          message.type==="SESSION_REPLACED"
            ? "SESSION_REPLACED"
            : typeof message.error==="string"
              ? message.error
              : "BLACKJACK_CONNECTION_ERROR",
      }));
      return;
    }

    const cursor=snapshotCursor(message);
    if(
      cursor &&
      pending.acceptedStateVersion!==null &&
      pending.acceptedEventSequence!==null &&
      cursor.stateVersion>=pending.acceptedStateVersion &&
      cursor.eventSequence>=pending.acceptedEventSequence
    ){
      const completed=pending;
      pending=null;
      changed();
      setFeedback(Object.freeze({
        status:"ACCEPTED",
        requestId:completed.requestId,
        type:completed.type,
        error:null,
      }));
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
    getFeedback:()=>feedback,
    clearFeedback:()=>setFeedback(null),
    detach:()=>{
      if(detached) return;
      detached=true;
      input.socket.removeEventListener("message",onMessage);
      pending=null;
      feedback=null;
    },
  });
}
