import { describe, expect, it } from "vitest";
import {
  BLACKJACK_CANONICAL_TABLE_ID,
  BLACKJACK_PREVIEW_TABLE_PREFIX,
  BLACKJACK_RUNTIME_DISABLE_ENV,
  isBlackjackRuntimeAuthoritySuppressed,
  resolveBlackjackRuntimeTableId,
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

  it("detects a historical detached Replit sync fallback by stdout target",()=>{
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

  it("keeps production on the canonical global table",()=>{
    expect(resolveBlackjackRuntimeTableId(
      BLACKJACK_CANONICAL_TABLE_ID,
      {NODE_ENV:"production",REPL_ID:"same-app"},
    )).toBe(BLACKJACK_CANONICAL_TABLE_ID);
  });

  it("isolates Replit preview from the production table",()=>{
    expect(resolveBlackjackRuntimeTableId(
      BLACKJACK_CANONICAL_TABLE_ID,
      {NODE_ENV:"development",REPL_ID:"799F53E3-6D51-4A21-909C-3A4F5E94C6EA"},
    )).toBe(
      `${BLACKJACK_PREVIEW_TABLE_PREFIX}-799f53e3-6d51-4a21-909c-3a4f5e94c6ea`,
    );
  });

  it("uses a stable local namespace outside Replit development",()=>{
    expect(resolveBlackjackRuntimeTableId(
      BLACKJACK_CANONICAL_TABLE_ID,
      {NODE_ENV:"development"},
    )).toBe(`${BLACKJACK_PREVIEW_TABLE_PREFIX}-local`);
  });

  it("does not rewrite explicitly noncanonical table ids",()=>{
    expect(resolveBlackjackRuntimeTableId(
      "blackjack-e2e-table",
      {NODE_ENV:"development",REPL_ID:"replit-app"},
    )).toBe("blackjack-e2e-table");
  });
});
