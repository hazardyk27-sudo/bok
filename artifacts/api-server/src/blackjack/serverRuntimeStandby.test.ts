import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
} from "./snapshotState";
import {
  BlackjackRuntimeLeaseConflictError,
  BlackjackSnapshotConflictError,
} from "./snapshotRepository";
import {
  BLACKJACK_CANONICAL_TABLE_ID,
  BLACKJACK_PREVIEW_TABLE_PREFIX,
} from "./runtimeProcessRole";
import {
  BLACKJACK_RUNTIME_STANDBY_FAILURE_CODE,
  createBlackjackInitialServerRuntimeState,
  getBlackjackRuntimeBootstrapState,
  initializeAndAttachBlackjackServerRuntime,
  markBlackjackRuntimeStarting,
  markBlackjackRuntimeStopped,
  type BlackjackAttachedServerRuntime,
} from "./serverRuntime";

function durableSnapshot(
  tableId: string,
  savedAtMs = 1_000,
): BlackjackDurableSnapshot {
  return createBlackjackDurableSnapshot(
    createBlackjackInitialServerRuntimeState({
      tableId,
      shoe:createUnshuffledBlackjackShoe({
        shoeId:tableId+":shoe",
        createdAtMs:savedAtMs,
      }),
    }),
    savedAtMs,
  );
}

function closeServer(server: Server): Promise<void> {
  if(!server.listening) return Promise.resolve();
  return new Promise((resolve)=>server.close(()=>resolve()));
}

describe("blackjack server runtime standby authority",()=>{
  let attached: BlackjackAttachedServerRuntime | null=null;
  let server: Server | null=null;

  afterEach(async()=>{
    attached?.close();
    attached=null;
    if(server!==null) await closeServer(server);
    server=null;
    markBlackjackRuntimeStopped();
    vi.unstubAllEnvs();
  });

  it("keeps one bootstrap attempt in standby until the active lease is released",async()=>{
    const tableId="standby-lease-table";
    let stored=durableSnapshot(tableId);
    let saveCalls=0;
    let delayCalls=0;
    let clock=10_000;

    markBlackjackRuntimeStarting(7);
    server=createServer();

    attached=await initializeAndAttachBlackjackServerRuntime({
      server,
      tableId,
      snapshotRepository:{
        load:async()=>stored,
        save:async(snapshot)=>{
          saveCalls+=1;
          if(saveCalls===1){
            throw new BlackjackRuntimeLeaseConflictError(
              tableId,
              "blackjack-runtime:other-process",
              clock+6_000,
              "other-fencing-token",
            );
          }
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:clock,
      nowMs:()=>clock,
      resolveIdentity:()=>null,
      createInitialShoe:()=>{
        throw new Error("existing durable runtime must not create a new shoe");
      },
      scheduler:{
        schedule:()=>"standby-scheduler",
        cancelSchedule:()=>undefined,
      },
      standbyRetryMs:0,
      standbyDelay:async(ms)=>{
        expect(ms).toBe(0);
        delayCalls+=1;
        expect(getBlackjackRuntimeBootstrapState()).toMatchObject({
          ready:false,
          status:"STANDBY",
          attempt:7,
          failureCode:BLACKJACK_RUNTIME_STANDBY_FAILURE_CODE,
          runtime:null,
        });
        clock+=1_000;
      },
    });

    expect(delayCalls).toBe(1);
    expect(saveCalls).toBeGreaterThanOrEqual(2);
    expect(attached.getReadiness()).toMatchObject({
      ready:true,
      status:"READY",
      tableId,
    });
  });

  it("reloads after snapshot CAS contention instead of escaping to process retry",async()=>{
    const tableId="standby-cas-table";
    let stored=durableSnapshot(tableId);
    let saveCalls=0;
    let loadCalls=0;
    let delayCalls=0;
    let clock=20_000;

    markBlackjackRuntimeStarting(11);
    server=createServer();

    attached=await initializeAndAttachBlackjackServerRuntime({
      server,
      tableId,
      snapshotRepository:{
        load:async()=>{
          loadCalls+=1;
          return stored;
        },
        save:async(snapshot)=>{
          saveCalls+=1;
          if(saveCalls===1){
            stored=createBlackjackDurableSnapshot(
              {
                ...stored.payload,
                table:{
                  ...stored.payload.table,
                  stateVersion:stored.payload.table.stateVersion+1,
                },
              },
              clock,
            );
            throw new BlackjackSnapshotConflictError(tableId);
          }
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:clock,
      nowMs:()=>clock,
      resolveIdentity:()=>null,
      createInitialShoe:()=>{
        throw new Error("existing durable runtime must not create a new shoe");
      },
      scheduler:{
        schedule:()=>"standby-cas-scheduler",
        cancelSchedule:()=>undefined,
      },
      standbyRetryMs:0,
      standbyDelay:async()=>{
        delayCalls+=1;
        clock+=1_000;
      },
    });

    expect(delayCalls).toBe(1);
    expect(loadCalls).toBeGreaterThanOrEqual(2);
    expect(saveCalls).toBeGreaterThanOrEqual(2);
    expect(attached.getReadiness().ready).toBe(true);
  });

  it("does not touch durable authority while the process is a sync fallback",async()=>{
    const tableId="fallback-standby-table";
    let stored=durableSnapshot(tableId);
    let suppressed=true;
    let loadCalls=0;
    let saveCalls=0;
    let delayCalls=0;

    markBlackjackRuntimeStarting(13);
    server=createServer();

    attached=await initializeAndAttachBlackjackServerRuntime({
      server,
      tableId,
      snapshotRepository:{
        load:async()=>{
          loadCalls+=1;
          return stored;
        },
        save:async(snapshot)=>{
          saveCalls+=1;
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:30_000,
      nowMs:()=>30_000,
      resolveIdentity:()=>null,
      createInitialShoe:()=>{
        throw new Error("existing durable runtime must not create a new shoe");
      },
      scheduler:{
        schedule:()=>"fallback-standby-scheduler",
        cancelSchedule:()=>undefined,
      },
      authoritySuppressed:()=>suppressed,
      standbyRetryMs:0,
      standbyDelay:async()=>{
        delayCalls+=1;
        expect(loadCalls).toBe(0);
        expect(saveCalls).toBe(0);
        expect(getBlackjackRuntimeBootstrapState()).toMatchObject({
          ready:false,
          status:"STANDBY",
          attempt:13,
          failureCode:BLACKJACK_RUNTIME_STANDBY_FAILURE_CODE,
        });
        suppressed=false;
      },
    });

    expect(delayCalls).toBe(1);
    expect(loadCalls).toBeGreaterThan(0);
    expect(saveCalls).toBeGreaterThan(0);
    expect(attached.getReadiness().ready).toBe(true);
  });

  it("routes the canonical table to the Replit preview namespace before storage access",async()=>{
    vi.stubEnv("NODE_ENV","development");
    vi.stubEnv("REPL_ID","preview-app-123");
    const runtimeTableId=`${BLACKJACK_PREVIEW_TABLE_PREFIX}-preview-app-123`;
    let stored=durableSnapshot(runtimeTableId);
    const loadedTableIds:string[]=[];

    markBlackjackRuntimeStarting(17);
    server=createServer();

    attached=await initializeAndAttachBlackjackServerRuntime({
      server,
      tableId:BLACKJACK_CANONICAL_TABLE_ID,
      snapshotRepository:{
        load:async(tableId)=>{
          loadedTableIds.push(tableId);
          return stored;
        },
        save:async(snapshot)=>{
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:40_000,
      nowMs:()=>40_000,
      resolveIdentity:()=>null,
      createInitialShoe:()=>{
        throw new Error("existing durable runtime must not create a new shoe");
      },
      scheduler:{
        schedule:()=>"preview-namespace-scheduler",
        cancelSchedule:()=>undefined,
      },
    });

    expect(loadedTableIds[0]).toBe(runtimeTableId);
    expect(attached.getReadiness()).toMatchObject({
      ready:true,
      status:"READY",
      tableId:runtimeTableId,
    });
  });
});
