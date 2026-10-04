export const BLACKJACK_SESSION_ENDPOINT="/api/blackjack/session";
export const BLACKJACK_AUTH_ME_ENDPOINT="/api/auth/me";
export const BLACKJACK_SESSION_MAX_ATTEMPTS=4;
export const BLACKJACK_SESSION_ATTEMPT_TIMEOUT_MS=4_000;
export const BLACKJACK_SESSION_RETRY_DELAY_MS=750;
export const BLACKJACK_SESSION_REPAIR_AUTH_TIMEOUT_MS=4_000;

const TRANSIENT_STATUSES=new Set([502,503,504]);

export class BlackjackSessionBootstrapError extends Error{
  readonly code:string;
  readonly status:number|null;

  constructor(code:string,status:number|null=null){
    super(code);
    this.name="BlackjackSessionBootstrapError";
    this.code=code;
    this.status=status;
  }
}

type FetchLike=(
  input:string,
  init?:RequestInit,
)=>Promise<Response>;

export type BlackjackSessionBootstrapOptions=Readonly<{
  fetchImpl?:FetchLike;
  endpoint?:string;
  maxAttempts?:number;
  retryUntilReady?:boolean;
  attemptTimeoutMs?:number;
  retryDelayMs?:number;
  delay?:(ms:number)=>Promise<void>;
}>;

export type BlackjackSessionRepairOptions=Readonly<{
  fetchImpl?:FetchLike;
  authEndpoint?:string;
  authTimeoutMs?:number;
  sessionOptions?:Omit<BlackjackSessionBootstrapOptions,"fetchImpl">;
}>;

function positiveInteger(value:number,label:string):number{
  if(!Number.isSafeInteger(value) || value<1){
    throw new RangeError(label+" must be a positive integer");
  }
  return value;
}

export async function waitForBlackjackSession(
  options:BlackjackSessionBootstrapOptions={},
):Promise<void>{
  const fetchImpl=options.fetchImpl ?? fetch;
  const endpoint=options.endpoint ?? BLACKJACK_SESSION_ENDPOINT;
  const maxAttempts=positiveInteger(
    options.maxAttempts ?? BLACKJACK_SESSION_MAX_ATTEMPTS,
    "maxAttempts",
  );
  const retryUntilReady=
    options.retryUntilReady ?? (options.maxAttempts===undefined);
  const attemptTimeoutMs=positiveInteger(
    options.attemptTimeoutMs ?? BLACKJACK_SESSION_ATTEMPT_TIMEOUT_MS,
    "attemptTimeoutMs",
  );
  const retryDelayMs=Math.max(
    0,
    options.retryDelayMs ?? BLACKJACK_SESSION_RETRY_DELAY_MS,
  );
  const delay=options.delay ?? (
    (ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms))
  );

  let lastError:unknown=null;

  for(
    let attempt=1;
    retryUntilReady || attempt<=maxAttempts;
    attempt+=1
  ){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),attemptTimeoutMs);

    try{
      const response=await fetchImpl(endpoint,{
        method:"GET",
        credentials:"same-origin",
        cache:"no-store",
        headers:{Accept:"application/json"},
        signal:controller.signal,
      });

      if(response.ok) return;

      if(!TRANSIENT_STATUSES.has(response.status)){
        throw new BlackjackSessionBootstrapError(
          "BLACKJACK_SESSION_HTTP_"+response.status,
          response.status,
        );
      }

      lastError=new BlackjackSessionBootstrapError(
        "BLACKJACK_SESSION_TRANSIENT_"+response.status,
        response.status,
      );
    }catch(error){
      if(error instanceof BlackjackSessionBootstrapError){
        if(
          error.status!==null &&
          !TRANSIENT_STATUSES.has(error.status)
        ){
          throw error;
        }
        lastError=error;
      }else{
        lastError=error;
      }
    }finally{
      clearTimeout(timeout);
    }

    if(
      (retryUntilReady || attempt<maxAttempts) &&
      retryDelayMs>0
    ){
      await delay(retryDelayMs);
    }
  }

  throw new BlackjackSessionBootstrapError(
    lastError instanceof Error && lastError.name==="AbortError"
      ? "BLACKJACK_SESSION_TIMEOUT"
      : "BLACKJACK_SESSION_UNAVAILABLE",
  );
}

export async function repairBlackjackSessionIdentity(
  options:BlackjackSessionRepairOptions={},
):Promise<void>{
  const fetchImpl=options.fetchImpl ?? fetch;
  const authEndpoint=options.authEndpoint ?? BLACKJACK_AUTH_ME_ENDPOINT;
  const authTimeoutMs=positiveInteger(
    options.authTimeoutMs ?? BLACKJACK_SESSION_REPAIR_AUTH_TIMEOUT_MS,
    "authTimeoutMs",
  );

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),authTimeoutMs);
  try{
    // A valid account session rewrites game_session to its canonical wallet.
    // Anonymous browsers simply receive {user:null}. Either way, the follow-up
    // Blackjack session bootstrap then clears legacy scoped cookies and ensures
    // the selected shared wallet exists before realtime reconnects.
    await fetchImpl(authEndpoint,{
      method:"GET",
      credentials:"same-origin",
      cache:"no-store",
      headers:{Accept:"application/json"},
      signal:controller.signal,
    });
  }catch{
    // The Blackjack session bootstrap below remains authoritative. Auth refresh
    // is best-effort so an anonymous browser is never blocked by this repair.
  }finally{
    clearTimeout(timeout);
  }

  await waitForBlackjackSession({
    ...options.sessionOptions,
    fetchImpl,
  });
}
