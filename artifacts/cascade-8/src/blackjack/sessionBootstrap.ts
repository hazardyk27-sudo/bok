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

export type BlackjackSessionBootstrapResult=Readonly<{
  realtimeAccessToken:string|null;
  realtimeAccessExpiresAtMs:number|null;
}>;

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

async function parseBootstrapResult(
  response:Response,
):Promise<BlackjackSessionBootstrapResult>{
  let payload:unknown;
  try{
    payload=await response.json();
  }catch{
    throw new BlackjackSessionBootstrapError(
      "BLACKJACK_SESSION_ACCESS_INVALID",
      response.status,
    );
  }

  if(typeof payload!=="object" || payload===null){
    throw new BlackjackSessionBootstrapError(
      "BLACKJACK_SESSION_ACCESS_INVALID",
      response.status,
    );
  }

  const token=
    "realtimeAccessToken" in payload
      ? (payload as {realtimeAccessToken?:unknown}).realtimeAccessToken
      : undefined;
  const expiresAtMs=
    "realtimeAccessExpiresAtMs" in payload
      ? (payload as {realtimeAccessExpiresAtMs?:unknown}).realtimeAccessExpiresAtMs
      : undefined;

  if(token===undefined && expiresAtMs===undefined){
    // Rolling-upgrade compatibility for an older HTTP bootstrap. The current
    // API always returns explicit realtime access; this fallback only keeps an
    // older server/test fixture usable while versions cross during startup.
    return Object.freeze({
      realtimeAccessToken:null,
      realtimeAccessExpiresAtMs:null,
    });
  }

  if(
    typeof token!=="string" ||
    token.length<20 ||
    !Number.isSafeInteger(expiresAtMs)
  ){
    throw new BlackjackSessionBootstrapError(
      "BLACKJACK_SESSION_ACCESS_INVALID",
      response.status,
    );
  }

  return Object.freeze({
    realtimeAccessToken:token,
    realtimeAccessExpiresAtMs:expiresAtMs as number,
  });
}

export async function waitForBlackjackSession(
  options:BlackjackSessionBootstrapOptions={},
):Promise<BlackjackSessionBootstrapResult>{
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

      if(response.ok){
        return await parseBootstrapResult(response);
      }

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
):Promise<BlackjackSessionBootstrapResult>{
  const fetchImpl=options.fetchImpl ?? fetch;
  const authEndpoint=options.authEndpoint ?? BLACKJACK_AUTH_ME_ENDPOINT;
  const authTimeoutMs=positiveInteger(
    options.authTimeoutMs ?? BLACKJACK_SESSION_REPAIR_AUTH_TIMEOUT_MS,
    "authTimeoutMs",
  );

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),authTimeoutMs);
  try{
    await fetchImpl(authEndpoint,{
      method:"GET",
      credentials:"same-origin",
      cache:"no-store",
      headers:{Accept:"application/json"},
      signal:controller.signal,
    });
  }catch{
    // The authenticated Blackjack session bootstrap below is authoritative.
  }finally{
    clearTimeout(timeout);
  }

  return waitForBlackjackSession({
    ...options.sessionOptions,
    fetchImpl,
  });
}
