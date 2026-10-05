import "./soundPresentation.css";
import type { BlackjackPresentationEvent } from "./presentationQueue";

export const BLACKJACK_SOUND_STORAGE_KEY="blackjack-sound-enabled-v1" as const;

export type BlackjackSoundCue=
  | "ACTION"
  | "CHIP"
  | "CARD"
  | "FLIP"
  | "WIN"
  | "BLACKJACK"
  | "LOSS"
  | "PUSH";

export type BlackjackSoundEngine=Readonly<{
  unlock:()=>Promise<boolean>;
  play:(cue:BlackjackSoundCue)=>void;
  destroy:()=>void;
}>;

export type BlackjackSoundPresentation=Readonly<{
  play:(event:BlackjackPresentationEvent)=>void;
  isEnabled:()=>boolean;
  setEnabled:(enabled:boolean)=>void;
  destroy:()=>void;
}>;

type BlackjackSoundPresentationOptions=Readonly<{
  engine?:BlackjackSoundEngine;
  storage?:Pick<Storage,"getItem"|"setItem"> | null;
}>;

type WebAudioWindow=Window & typeof globalThis & Readonly<{
  webkitAudioContext?:typeof AudioContext;
}>;

function soundCueForEvent(event:BlackjackPresentationEvent): BlackjackSoundCue | null {
  switch(event.type){
    case "PLAYER_CARD_DEALT":
    case "DEALER_CARD_DEALT":
      return "CARD";
    case "DEALER_HOLE_REVEALED":
      return "FLIP";
    case "HAND_SETTLED":
      if(event.result==="BLACKJACK_WIN") return "BLACKJACK";
      if(event.result==="WIN") return "WIN";
      if(event.result==="LOSS") return "LOSS";
      return "PUSH";
    default:
      return null;
  }
}

function tone(
  context:AudioContext,
  frequency:number,
  delaySeconds:number,
  durationSeconds:number,
  peakGain:number,
  type:OscillatorType="sine",
): OscillatorNode {
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  const start=context.currentTime+delaySeconds;
  const end=start+durationSeconds;
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(0.0001,start);
  gain.gain.exponentialRampToValueAtTime(peakGain,start+Math.min(.018,durationSeconds/3));
  gain.gain.exponentialRampToValueAtTime(0.0001,end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end+.01);
  return oscillator;
}

function playWebAudioCue(context:AudioContext,cue:BlackjackSoundCue): void {
  switch(cue){
    case "ACTION":
      tone(context,420,0,.045,.025,"triangle");
      return;
    case "CHIP":
      tone(context,760,0,.035,.026,"square");
      tone(context,1080,.018,.028,.018,"triangle");
      return;
    case "CARD":
      tone(context,620,0,.032,.018,"triangle");
      tone(context,390,.025,.045,.014,"sine");
      return;
    case "FLIP":
      tone(context,360,0,.05,.018,"triangle");
      tone(context,690,.045,.06,.022,"triangle");
      return;
    case "WIN":
      tone(context,523,0,.10,.025,"sine");
      tone(context,659,.085,.12,.024,"sine");
      tone(context,784,.17,.15,.022,"sine");
      return;
    case "BLACKJACK":
      tone(context,523,0,.10,.026,"sine");
      tone(context,784,.075,.13,.026,"sine");
      tone(context,1047,.16,.19,.024,"sine");
      return;
    case "LOSS":
      tone(context,260,0,.12,.021,"triangle");
      tone(context,196,.09,.17,.018,"sine");
      return;
    case "PUSH":
      tone(context,392,0,.08,.019,"triangle");
      tone(context,392,.09,.08,.016,"triangle");
      return;
  }
}

function createWebAudioEngine(app:HTMLElement): BlackjackSoundEngine {
  let context:AudioContext | null=null;
  let destroyed=false;

  const getWindow=(): WebAudioWindow | null => {
    const ownWindow=app.ownerDocument?.defaultView;
    if(ownWindow!==null && ownWindow!==undefined){
      return ownWindow as WebAudioWindow;
    }
    if(typeof window!=="undefined") return window as WebAudioWindow;
    return null;
  };

  const getContext=(): AudioContext | null => {
    if(destroyed) return null;
    if(context!==null) return context;
    const ownWindow=getWindow();
    if(ownWindow===null) return null;
    const Context=ownWindow.AudioContext ?? ownWindow.webkitAudioContext;
    if(typeof Context!=="function") return null;
    try {
      context=new Context();
      return context;
    } catch {
      return null;
    }
  };

  return Object.freeze({
    unlock:async()=>{
      const audio=getContext();
      if(audio===null) return false;
      if(audio.state==="running") return true;
      try {
        await audio.resume();
        return audio.state==="running";
      } catch {
        return false;
      }
    },
    play:(cue)=>{
      const audio=context;
      if(destroyed || audio===null || audio.state!=="running") return;
      try {
        playWebAudioCue(audio,cue);
      } catch {
        // Sound is presentation-only and must never affect table state.
      }
    },
    destroy:()=>{
      if(destroyed) return;
      destroyed=true;
      const audio=context;
      context=null;
      if(audio!==null && audio.state!=="closed"){
        void audio.close().catch(()=>{});
      }
    },
  });
}

function readStoredEnabled(storage:BlackjackSoundPresentationOptions["storage"]): boolean {
  if(storage===null || storage===undefined) return true;
  try {
    return storage.getItem(BLACKJACK_SOUND_STORAGE_KEY)!=="off";
  } catch {
    return true;
  }
}

function writeStoredEnabled(
  storage:BlackjackSoundPresentationOptions["storage"],
  enabled:boolean,
): void {
  if(storage===null || storage===undefined) return;
  try {
    storage.setItem(BLACKJACK_SOUND_STORAGE_KEY,enabled ? "on" : "off");
  } catch {
    // Private/hardened browsing can reject localStorage writes.
  }
}

function isDocumentHidden(app:HTMLElement): boolean {
  return app.ownerDocument?.visibilityState==="hidden";
}

function closestSoundTarget(target:EventTarget | null): Element | null {
  if(!(target instanceof Element)) return null;
  return target.closest(
    "[data-blackjack-chip], [data-blackjack-bet-action], [data-blackjack-action]",
  );
}

export function createBlackjackSoundPresentation(
  app:HTMLElement,
  options:BlackjackSoundPresentationOptions={},
): BlackjackSoundPresentation {
  const candidate=app as unknown as Readonly<{
    addEventListener?:unknown;
    removeEventListener?:unknown;
    querySelector?:unknown;
    ownerDocument?:Document;
  }>;
  if(
    typeof candidate.addEventListener!=="function" ||
    typeof candidate.removeEventListener!=="function" ||
    typeof candidate.querySelector!=="function"
  ){
    return Object.freeze({
      play:()=>{},
      isEnabled:()=>false,
      setEnabled:()=>{},
      destroy:()=>{},
    });
  }

  const storage=options.storage===undefined
    ? (()=>{
        try {
          return app.ownerDocument?.defaultView?.localStorage ?? null;
        } catch {
          return null;
        }
      })()
    : options.storage;
  const engine=options.engine ?? createWebAudioEngine(app);
  let enabled=readStoredEnabled(storage);
  let unlocked=false;
  let unlockPending=false;
  let destroyed=false;

  const dock=app.querySelector<HTMLElement>(".blackjack-dock-actions");
  const toggle=dock===null ? null : app.ownerDocument.createElement("button");
  if(toggle!==null){
    toggle.type="button";
    toggle.className="blackjack-sound-toggle";
    toggle.dataset.blackjackSoundToggle="true";
    toggle.textContent="SOUND";
    dock.append(toggle);
  }

  const syncToggle=()=>{
    if(toggle===null) return;
    toggle.setAttribute("aria-pressed",enabled ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      enabled ? "Mute Blackjack sound effects" : "Enable Blackjack sound effects",
    );
    toggle.title=enabled ? "Sound effects on" : "Sound effects muted";
  };

  const requestUnlock=()=>{
    if(destroyed || !enabled || unlocked || unlockPending) return;
    unlockPending=true;
    void engine.unlock().then((didUnlock)=>{
      if(!destroyed) unlocked=didUnlock;
    }).catch(()=>{}).finally(()=>{
      unlockPending=false;
    });
  };

  const setEnabled=(next:boolean)=>{
    if(destroyed || enabled===next) return;
    enabled=next;
    writeStoredEnabled(storage,enabled);
    syncToggle();
    if(enabled) requestUnlock();
  };

  const onPointerDown=()=>{ requestUnlock(); };
  const onKeyDown=()=>{ requestUnlock(); };
  const onClick=(event:Event)=>{
    if(toggle!==null && event.target===toggle){
      setEnabled(!enabled);
      return;
    }
    if(!enabled || !unlocked || isDocumentHidden(app)) return;
    const target=closestSoundTarget(event.target);
    if(target===null) return;
    engine.play(
      target.hasAttribute("data-blackjack-action") ? "ACTION" : "CHIP",
    );
  };

  syncToggle();
  app.addEventListener("pointerdown",onPointerDown);
  app.addEventListener("keydown",onKeyDown);
  app.addEventListener("click",onClick);

  return Object.freeze({
    play:(event)=>{
      if(destroyed || !enabled || !unlocked || isDocumentHidden(app)) return;
      const cue=soundCueForEvent(event);
      if(cue!==null) engine.play(cue);
    },
    isEnabled:()=>enabled,
    setEnabled,
    destroy:()=>{
      if(destroyed) return;
      destroyed=true;
      app.removeEventListener("pointerdown",onPointerDown);
      app.removeEventListener("keydown",onKeyDown);
      app.removeEventListener("click",onClick);
      toggle?.remove();
      engine.destroy();
    },
  });
}
