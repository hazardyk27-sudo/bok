import { describe, expect, it } from "vitest";
import {
  BLACKJACK_RUNTIME_DISABLE_ENV,
  isBlackjackRuntimeAuthoritySuppressed,
} from "./runtimeProcessRole";

describe("blackjack runtime process role",()=>{
  it("honors the explicit authority disable flag",()=>{
    expect(isBlackjackRuntimeAuthoritySuppressed({
      env:{
        [BLACKJACK_RUNTIME_DISABLE_ENV]:"1",
      },
      readStdoutTarget:()=>null,
    })).toBe(true);

    expect(isBlackjackRuntimeAuthoritySuppressed({
      env:{
        [BLACKJACK_RUNTIME_DISABLE_ENV]:"0",
        REPL_ID:"replit-app",
      },
      readStdoutTarget:()=>"/tmp/oyun-replit-api-server.log",
    })).toBe(false);
  });

  it("detects the canonical detached Replit sync fallback by stdout target",()=>{
    expect(isBlackjackRuntimeAuthoritySuppressed({
      env:{REPL_ID:"replit-app"},
      readStdoutTarget:()=>"/tmp/oyun-replit-api-server.log",
    })).toBe(true);
  });

  it("keeps normal Replit and non-Replit API runtimes eligible for authority",()=>{
    expect(isBlackjackRuntimeAuthoritySuppressed({
      env:{REPL_ID:"replit-app"},
      readStdoutTarget:()=>"pipe:[12345]",
    })).toBe(false);

    expect(isBlackjackRuntimeAuthoritySuppressed({
      env:{},
      readStdoutTarget:()=>"/tmp/oyun-replit-api-server.log",
    })).toBe(false);
  });
});
