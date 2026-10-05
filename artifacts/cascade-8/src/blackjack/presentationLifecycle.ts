export type BlackjackPresentationLifecycle=Readonly<{
  isSuppressed:()=>boolean;
  destroy:()=>void;
}>;

type EventDocument=Pick<Document,"visibilityState"|"addEventListener"|"removeEventListener"> & Readonly<{
  defaultView?:Window | null;
}>;

function getEventDocument(app:HTMLElement): EventDocument | null {
  const candidate=(app as unknown as {ownerDocument?:unknown}).ownerDocument;
  if(candidate===null || typeof candidate!=="object") return null;
  const documentCandidate=candidate as Partial<EventDocument>;
  if(
    typeof documentCandidate.addEventListener!=="function" ||
    typeof documentCandidate.removeEventListener!=="function"
  ){
    return null;
  }
  return documentCandidate as EventDocument;
}

export function installBlackjackPresentationLifecycle(
  app:HTMLElement,
  onSuspend:()=>void,
): BlackjackPresentationLifecycle {
  const document=getEventDocument(app);
  if(document===null){
    return Object.freeze({
      isSuppressed:()=>false,
      destroy:()=>{},
    });
  }

  let destroyed=false;
  let suppressed=document.visibilityState==="hidden";
  const window=document.defaultView ?? null;

  const suspend=()=>{
    if(destroyed) return;
    suppressed=true;
    onSuspend();
  };

  const onVisibilityChange=()=>{
    if(destroyed) return;
    const nextSuppressed=document.visibilityState==="hidden";
    if(nextSuppressed){
      suspend();
      return;
    }
    suppressed=false;
  };

  const onPageHide=()=>{ suspend(); };

  document.addEventListener("visibilitychange",onVisibilityChange);
  window?.addEventListener("pagehide",onPageHide);

  if(suppressed) onSuspend();

  return Object.freeze({
    isSuppressed:()=>suppressed,
    destroy:()=>{
      if(destroyed) return;
      destroyed=true;
      document.removeEventListener("visibilitychange",onVisibilityChange);
      window?.removeEventListener("pagehide",onPageHide);
    },
  });
}
