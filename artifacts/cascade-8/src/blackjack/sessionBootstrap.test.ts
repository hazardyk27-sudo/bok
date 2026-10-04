import {describe,expect,it,vi} from "vitest";
import {
  BlackjackSessionBootstrapError,
  repairBlackjackSessionIdentity,
  waitForBlackjackSession,
} from "./sessionBootstrap";

const ACCESS_TOKEN="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACCESS_EXPIRES_AT_MS=1_900_000_000_000;

const response=(status:number,payload:unknown={
  ready:true,
  status:"READY",
  realtimeAccessToken:ACCESS_TOKEN,
  realtimeAccessExpiresAtMs:ACCESS_EXPIRES_AT_MS,
})=>({
  ok:status>=200 && status<300,
  status,
  json:vi.fn(async()=>payload),
}) as unknown as Response;

describe("blackjack session bootstrap",()=>{
  it("retries transient gateway responses and returns realtime access",async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:3,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).resolves.toEqual({
      realtimeAccessToken:ACCESS_TOKEN,
      realtimeAccessExpiresAtMs:ACCESS_EXPIRES_AT_MS,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying transient startup failures by default until ready",async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(504))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(200));

    await expect(waitForBlackjackSession({
      fetchImpl,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).resolves.toMatchObject({
      realtimeAccessToken:ACCESS_TOKEN,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("keeps rolling compatibility with a successful pre-token bootstrap",async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(response(200,{
      ready:true,
      status:"READY",
    }));

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:1,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).resolves.toEqual({
      realtimeAccessToken:null,
      realtimeAccessExpiresAtMs:null,
    });
  });

  it("stops after the configured transient retry budget",async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(response(503));

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:3,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).rejects.toMatchObject({
      name:"BlackjackSessionBootstrapError",
      code:"BLACKJACK_SESSION_UNAVAILABLE",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on a non-transient http response",async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(response(401));

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:4,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).rejects.toMatchObject({
      code:"BLACKJACK_SESSION_HTTP_401",
      status:401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung request instead of leaving CONNECTING forever",async()=>{
    const fetchImpl=vi.fn((_:string,init?:RequestInit)=>
      new Promise<Response>((_resolve,reject)=>{
        init?.signal?.addEventListener("abort",()=>{
          const error=new Error("aborted");
          error.name="AbortError";
          reject(error);
        },{once:true});
      }),
    );

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:1,
      attemptTimeoutMs:5,
      retryDelayMs:0,
    })).rejects.toMatchObject({
      code:"BLACKJACK_SESSION_TIMEOUT",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("repairs account identity before reopening the blackjack session",async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    await expect(repairBlackjackSessionIdentity({
      fetchImpl,
      authTimeoutMs:100,
      sessionOptions:{
        maxAttempts:1,
        attemptTimeoutMs:100,
        retryDelayMs:0,
      },
    })).resolves.toMatchObject({
      realtimeAccessToken:ACCESS_TOKEN,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/auth/me");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/api/blackjack/session");
  });

  it("still lets the session endpoint decide when auth refresh fails",async()=>{
    const fetchImpl=vi.fn()
      .mockRejectedValueOnce(new Error("auth offline"))
      .mockResolvedValueOnce(response(200));

    await expect(repairBlackjackSessionIdentity({
      fetchImpl,
      authTimeoutMs:100,
      sessionOptions:{
        maxAttempts:1,
        attemptTimeoutMs:100,
        retryDelayMs:0,
      },
    })).resolves.toMatchObject({
      realtimeAccessToken:ACCESS_TOKEN,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/api/blackjack/session");
  });

  it("validates retry controls",async()=>{
    await expect(waitForBlackjackSession({
      maxAttempts:0,
    })).rejects.toBeInstanceOf(RangeError);
    await expect(waitForBlackjackSession({
      attemptTimeoutMs:0,
    })).rejects.toBeInstanceOf(RangeError);
    await expect(repairBlackjackSessionIdentity({
      authTimeoutMs:0,
    })).rejects.toBeInstanceOf(RangeError);
  });

  it("exports a typed bootstrap error",()=>{
    const error=new BlackjackSessionBootstrapError(
      "BLACKJACK_SESSION_HTTP_403",
      403,
    );
    expect(error.code).toBe("BLACKJACK_SESSION_HTTP_403");
    expect(error.status).toBe(403);
  });
});
