import {describe,expect,it,vi} from "vitest";
import {
  BlackjackSessionBootstrapError,
  repairBlackjackSessionIdentity,
  waitForBlackjackSession,
} from "./sessionBootstrap";

const response=(status:number)=>({
  ok:status>=200 && status<300,
  status,
}) as Response;

describe("blackjack session bootstrap",()=>{
  it("retries transient gateway responses and then resolves",async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    await expect(waitForBlackjackSession({
      fetchImpl,
      maxAttempts:3,
      attemptTimeoutMs:100,
      retryDelayMs:0,
    })).resolves.toBeUndefined();
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
    })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(6);
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
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/auth/me");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/api/blackjack/session");
  });

  it("still repairs anonymous blackjack session when auth refresh fails",async()=>{
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
    })).resolves.toBeUndefined();

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
