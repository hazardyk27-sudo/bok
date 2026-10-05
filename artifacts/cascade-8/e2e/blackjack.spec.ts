import {
  expect,
  test,
  type Page,
} from "@playwright/test";

type SeatNumber=1|2|3|4|5;
type Card=Readonly<{
  rank:"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
  suit:"CLUBS"|"DIAMONDS"|"HEARTS"|"SPADES";
}>;

type Snapshot=Readonly<{
  serverTimeMs:number;
  tableId:string;
  phase:
    |"TABLE_IDLE"
    |"BETTING"
    |"PLAYER_TURNS"
    |"DEALER_TURN"
    |"ROUND_END";
  maxSeats:5;
  seats:readonly Readonly<{
    seatNumber:SeatNumber;
    playerId:string|null;
  }>[];
  players:readonly Readonly<{
    playerId:string;
    seatNumber:SeatNumber;
    status:
      |"SEATED_WAITING"
      |"BETTING"
      |"READY"
      |"PLAYING"
      |"DISCONNECTED";
    connected:boolean;
  }>[];
  round:Readonly<{
    roundId:string;
    phase:"BETTING"|"PLAYER_TURNS"|"DEALER_TURN"|"ROUND_END";
    hands:readonly Readonly<{
      handId:string;
      playerId:string;
      seatNumber:SeatNumber;
      cards:readonly Card[];
      betCents:number;
      status:"ACTIVE"|"STOOD"|"COMPLETE";
      result?:"WIN"|"LOSS"|"PUSH"|"BLACKJACK_WIN"|null;
      payoutCents?:number;
    }>[];
    dealer:Readonly<{
      cards:readonly (Card|null)[];
      holeCardRevealed:boolean;
    }>;
    currentTurn:Readonly<{
      seatNumber:SeatNumber;
      handId:string;
      startedAtMs:number;
      endsAtMs:number;
    }>|null;
    bettingClosesAtMs:number|null;
  }>|null;
  stateVersion:number;
  eventSequence:number;
}>;

type WsRouteLike=Readonly<{
  send:(message:string)=>void;
  close:(options?:{code?:number;reason?:string})=>void;
}>;

const LOCAL_PLAYER="blackjack-e2e-player";
const ROUND_ID="blackjack-e2e-round-1";
const HAND_ID="blackjack-e2e-hand-1";
const TABLE_ID="blackjack-e2e-table";

const card=(rank:Card["rank"],suit:Card["suit"]):Card=>({rank,suit});

function seats(local=false): Snapshot["seats"] {
  return [1,2,3,4,5].map((seatNumber)=>({
    seatNumber:seatNumber as SeatNumber,
    playerId:local && seatNumber===3 ? LOCAL_PLAYER : null,
  }));
}

function idleSnapshot(cursor=1):Snapshot{
  return {
    serverTimeMs:1_000,
    tableId:TABLE_ID,
    phase:"TABLE_IDLE",
    maxSeats:5,
    seats:seats(false),
    players:[],
    round:null,
    stateVersion:cursor,
    eventSequence:cursor,
  };
}

function bettingSnapshot(
  cursor:number,
  status:"BETTING"|"READY"="BETTING",
):Snapshot{
  return {
    serverTimeMs:2_000+cursor,
    tableId:TABLE_ID,
    phase:"BETTING",
    maxSeats:5,
    seats:seats(true),
    players:[{
      playerId:LOCAL_PLAYER,
      seatNumber:3,
      status,
      connected:true,
    }],
    round:{
      roundId:ROUND_ID,
      phase:"BETTING",
      hands:[],
      dealer:{cards:[],holeCardRevealed:false},
      currentTurn:null,
      bettingClosesAtMs:60_000,
    },
    stateVersion:cursor,
    eventSequence:cursor,
  };
}

function playerTurnSnapshot(
  cursor:number,
  cards:readonly Card[],
):Snapshot{
  return {
    serverTimeMs:3_000+cursor,
    tableId:TABLE_ID,
    phase:"PLAYER_TURNS",
    maxSeats:5,
    seats:seats(true),
    players:[{
      playerId:LOCAL_PLAYER,
      seatNumber:3,
      status:"PLAYING",
      connected:true,
    }],
    round:{
      roundId:ROUND_ID,
      phase:"PLAYER_TURNS",
      hands:[{
        handId:HAND_ID,
        playerId:LOCAL_PLAYER,
        seatNumber:3,
        cards,
        betCents:10_000,
        status:"ACTIVE",
        result:null,
        payoutCents:0,
      }],
      dealer:{
        cards:[
          card("K","SPADES"),
          null,
        ],
        holeCardRevealed:false,
      },
      currentTurn:{
        seatNumber:3,
        handId:HAND_ID,
        startedAtMs:3_000,
        endsAtMs:30_000,
      },
      bettingClosesAtMs:null,
    },
    stateVersion:cursor,
    eventSequence:cursor,
  };
}

function roundEndSnapshot(cursor:number):Snapshot{
  return {
    serverTimeMs:4_000+cursor,
    tableId:TABLE_ID,
    phase:"ROUND_END",
    maxSeats:5,
    seats:seats(true),
    players:[{
      playerId:LOCAL_PLAYER,
      seatNumber:3,
      status:"SEATED_WAITING",
      connected:true,
    }],
    round:{
      roundId:ROUND_ID,
      phase:"ROUND_END",
      hands:[{
        handId:HAND_ID,
        playerId:LOCAL_PLAYER,
        seatNumber:3,
        cards:[
          card("8","HEARTS"),
          card("7","CLUBS"),
          card("2","DIAMONDS"),
        ],
        betCents:10_000,
        status:"COMPLETE",
        result:"WIN",
        payoutCents:20_000,
      }],
      dealer:{
        cards:[
          card("K","SPADES"),
          card("7","HEARTS"),
        ],
        holeCardRevealed:true,
      },
      currentTurn:null,
      bettingClosesAtMs:null,
    },
    stateVersion:cursor,
    eventSequence:cursor,
  };
}

function privateState(
  snapshot:Snapshot,
  input:{
    availableBalanceCents?:number;
    betCents?:number;
    status?:"OPEN"|"READY"|"LOCKED";
    activeChipValuesCents?:readonly number[];
  }={},
){
  return {
    type:"PRIVATE_PLAYER_STATE",
    stateVersion:snapshot.stateVersion,
    eventSequence:snapshot.eventSequence,
    roundId:snapshot.round?.roundId ?? null,
    playerId:LOCAL_PLAYER,
    availableBalanceCents:input.availableBalanceCents ?? 100_000,
    reservedBalanceCents:input.betCents ?? 0,
    betting:
      snapshot.phase==="BETTING"
        ? {
            roundId:ROUND_ID,
            status:input.status ?? "OPEN",
            betCents:input.betCents ?? 0,
            activeChipValuesCents:[...(input.activeChipValuesCents ?? [])],
          }
        : null,
  };
}

function fullSnapshot(snapshot:Snapshot){
  return {
    type:"FULL_TABLE_SNAPSHOT",
    reason:"INITIAL_CONNECT",
    snapshot,
    resetEventSequenceTo:snapshot.eventSequence,
    resetStateVersionTo:snapshot.stateVersion,
  };
}

type BlackjackFixture=Readonly<{
  outbound:readonly Record<string,unknown>[];
  connectionCount:()=>number;
  currentSnapshot:()=>Snapshot;
  dealInitialHand:()=>void;
  disconnect:()=>void;
  forcePlayerTurn:(cards:readonly Card[])=>void;
}>;

async function installBlackjackFixture(
  page:Page,
):Promise<BlackjackFixture>{
  let snapshot:Snapshot=idleSnapshot();
  let activeSocket:WsRouteLike|null=null;
  let connections=0;
  let cursor=1;
  let betCents=0;
  let activeChipValuesCents:number[]=[];
  let bettingStatus:"OPEN"|"READY"|"LOCKED"="OPEN";
  const outbound:Record<string,unknown>[]=[];

  const send=(payload:unknown)=>{
    activeSocket?.send(JSON.stringify(payload));
  };
  const sendSnapshot=(next:Snapshot)=>{
    snapshot=next;
    send({type:"snapshot",snapshot});
  };
  const sendPrivate=(
    next:Snapshot=snapshot,
    availableBalanceCents=100_000-betCents,
  )=>{
    send(privateState(next,{
      availableBalanceCents,
      betCents,
      status:bettingStatus,
      activeChipValuesCents,
    }));
  };
  const acceptedBetting=()=>({
    roundId:ROUND_ID,
    status:bettingStatus,
    betCents,
    availableBalanceCents:100_000-betCents,
  });

  await page.route("**/api/slot/session-converge",async(route)=>{
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({ready:true}),
    });
  });

  await page.route("**/api/blackjack/session",async(route)=>{
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({
        ready:true,
        status:"READY",
      }),
    });
  });

  await page.routeWebSocket(/\/api\/blackjack\/ws$/,async(ws)=>{
    activeSocket=ws;
    connections+=1;

    ws.onMessage((raw)=>{
      const text=
        typeof raw==="string"
          ? raw
          : Buffer.from(raw).toString("utf8");
      const message=JSON.parse(text) as Record<string,unknown>;
      outbound.push(message);

      if(message.type==="sync"){
        send({
          type:"SYNC_OK",
          eventSequence:snapshot.eventSequence,
          stateVersion:snapshot.stateVersion,
        });
        return;
      }

      if(message.type==="CLAIM_SEAT"){
        cursor+=1;
        betCents=0;
        activeChipValuesCents=[];
        bettingStatus="OPEN";
        const next=bettingSnapshot(cursor);
        snapshot=next;
        send({
          type:"SEAT_CLAIM_ACCEPTED",
          requestId:message.requestId,
          seatNumber:3,
          stateVersion:cursor,
          eventSequence:cursor,
          replayed:false,
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="PLACE_BET"){
        cursor+=1;
        const chipValueCents=Number(message.chipValueCents ?? 0);
        betCents+=chipValueCents;
        activeChipValuesCents=[...activeChipValuesCents,chipValueCents];
        bettingStatus="OPEN";
        const next=bettingSnapshot(cursor);
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
          betting:acceptedBetting(),
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="UNDO_BET"){
        cursor+=1;
        const chipValueCents=activeChipValuesCents.at(-1) ?? 0;
        activeChipValuesCents=activeChipValuesCents.slice(0,-1);
        betCents=Math.max(0,betCents-chipValueCents);
        bettingStatus="OPEN";
        const next=bettingSnapshot(cursor);
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
          betting:acceptedBetting(),
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="CLEAR_BET"){
        cursor+=1;
        betCents=0;
        activeChipValuesCents=[];
        bettingStatus="OPEN";
        const next=bettingSnapshot(cursor);
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
          betting:acceptedBetting(),
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="READY"){
        cursor+=1;
        bettingStatus="READY";
        const next=bettingSnapshot(cursor,"READY");
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
          betting:acceptedBetting(),
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="HIT"){
        cursor+=1;
        const next=playerTurnSnapshot(cursor,[
          card("8","HEARTS"),
          card("7","CLUBS"),
          card("2","DIAMONDS"),
        ]);
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next);
        return;
      }

      if(message.type==="STAND"){
        cursor+=1;
        const settled=roundEndSnapshot(cursor);
        snapshot=settled;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
        });
        send({type:"snapshot",snapshot:settled});
        sendPrivate(settled,110_000);
        return;
      }

      if(message.type==="DOUBLE" || message.type==="SPLIT"){
        cursor+=1;
        const next=playerTurnSnapshot(cursor,[
          card("8","HEARTS"),
          card("8","CLUBS"),
        ]);
        snapshot=next;
        send({
          type:"ACTION_ACCEPTED",
          actionId:message.actionId,
          replayed:false,
          stateVersion:cursor,
          eventSequence:cursor,
        });
        send({type:"snapshot",snapshot:next});
        sendPrivate(next,90_000);
      }
    });

    ws.send(JSON.stringify(fullSnapshot(snapshot)));
    if(snapshot.players.some((player)=>player.playerId===LOCAL_PLAYER)){
      ws.send(JSON.stringify(privateState(snapshot,{
        availableBalanceCents:
          snapshot.phase==="ROUND_END" ? 110_000 : 100_000-betCents,
        betCents,
        status:bettingStatus,
        activeChipValuesCents,
      })));
    }
  });

  return {
    outbound,
    connectionCount:()=>connections,
    currentSnapshot:()=>snapshot,
    dealInitialHand:()=>{
      cursor+=1;
      const dealt=playerTurnSnapshot(cursor,[
        card("8","HEARTS"),
        card("7","CLUBS"),
      ]);
      sendSnapshot(dealt);
      sendPrivate(dealt);
    },
    disconnect:()=>{
      activeSocket?.close({
        code:1012,
        reason:"E2E_SERVICE_RESTART",
      });
    },
    forcePlayerTurn:(cards)=>{
      cursor+=1;
      const next=playerTurnSnapshot(cursor,cards);
      snapshot=next;
      sendSnapshot(next);
      sendPrivate(next,90_000);
    },
  };
}

async function openBlackjack(page:Page){
  await page.goto("/blackjack");
  await expect(page.locator(".blackjack-root")).toBeVisible();
  await expect(page.locator(".blackjack-connection-label"))
    .toHaveText("LIVE");
}

test.describe("Blackjack browser lifecycle",()=>{
  test.use({
    viewport:{width:1440,height:900},
    screen:{width:1440,height:900},
    isMobile:false,
    hasTouch:false,
  });

  test("session to seat, bet, deal, HIT, STAND, settlement and reconnect",async({page})=>{
    const fixture=await installBlackjackFixture(page);
    await openBlackjack(page);

    await test.step("claim a seat through the confirmation UX",async()=>{
      await page.locator('.blackjack-seat[data-seat="3"]').click();
      await expect(page.locator("[data-blackjack-selected-seat]"))
        .toHaveText("3");
      await page.locator(
        '[data-blackjack-seat-confirm-action="CONFIRM"]',
      ).click();

      await expect(page.locator('.blackjack-seat[data-seat="3"]'))
        .toHaveClass(/is-local/);
      await expect(page.locator(".blackjack-context-prompt"))
        .toHaveText("PLACE YOUR BET");
      await expect.poll(()=>
        fixture.outbound.some((message)=>
          message.type==="CLAIM_SEAT" &&
          message.seatNumber===3
        )
      ).toBe(true);
    });

    await test.step("place, undo, clear and ready the wager",async()=>{
      const betToggle=page.locator(
        '[data-blackjack-drawer-toggle="BET"]',
      );
      await expect(betToggle).toBeEnabled();
      await betToggle.click();

      const tableStack=page.locator(
        '[data-blackjack-table-chip-stack="true"] .blackjack-table-chip',
      );
      const tableTotal=page.locator(
        '[data-blackjack-table-bet-total="true"]',
      );

      await page.locator('[data-blackjack-chip="100"]').click();
      await expect(page.locator('[data-blackjack-stat="bet"]'))
        .toHaveText("100");
      await expect(tableStack).toHaveCount(1);
      await expect(tableStack.last()).toHaveText("100");
      await expect(tableTotal).toHaveText("100");

      await tableStack.last().click();
      await expect(tableStack).toHaveCount(0);
      await expect(page.locator('[data-blackjack-stat="bet"]'))
        .toHaveText("0");
      await expect(tableTotal).toHaveText("0");

      await page.locator('[data-blackjack-chip="25"]').click();
      await expect(tableStack).toHaveCount(1);
      await expect(tableStack.last()).toHaveText("25");
      await page.locator('[data-blackjack-bet-action="CLEAR"]').click();
      await expect(tableStack).toHaveCount(0);
      await expect(page.locator('[data-blackjack-stat="bet"]'))
        .toHaveText("0");

      await page.locator('[data-blackjack-chip="100"]').click();
      await expect(tableStack).toHaveCount(1);
      await expect(tableTotal).toHaveText("100");

      await page.locator('[data-blackjack-bet-action="READY"]').click();
      await expect.poll(()=>
        fixture.outbound.filter((message)=>
          message.type==="PLACE_BET" ||
          message.type==="UNDO_BET" ||
          message.type==="CLEAR_BET" ||
          message.type==="READY"
        ).map((message)=>message.type)
      ).toEqual([
        "PLACE_BET",
        "UNDO_BET",
        "PLACE_BET",
        "CLEAR_BET",
        "PLACE_BET",
        "READY",
      ]);
      await expect(page.locator(".blackjack-context-prompt"))
        .toHaveText("BET LOCKED · WAITING FOR DEAL");
      fixture.dealInitialHand();
    });

    await test.step("deal and execute authoritative player actions",async()=>{
      await expect(page.locator(".blackjack-context-prompt"))
        .toHaveText("YOUR TURN");
      await expect(page.locator('[data-blackjack-action="HIT"]'))
        .toBeVisible();
      await expect(page.locator('[data-blackjack-action="STAND"]'))
        .toBeVisible();

      await page.locator('[data-blackjack-action="HIT"]').click();
      await expect.poll(()=>
        fixture.outbound.some((message)=>message.type==="HIT")
      ).toBe(true);
      await expect(page.locator(
        '[data-seat="3"] .blackjack-card-face',
      )).toHaveCount(3);

      await page.locator('[data-blackjack-action="STAND"]').click();
      await expect.poll(()=>
        fixture.outbound.some((message)=>message.type==="STAND")
      ).toBe(true);

      await expect(page.locator(".blackjack-round-result"))
        .toBeVisible();
      await expect(page.locator(".blackjack-round-result strong"))
        .toHaveText("YOU WIN");
      await expect(page.locator(".blackjack-round-result span"))
        .toContainText("NET +100");
    });

    await test.step("recover transport after a service restart",async()=>{
      fixture.disconnect();
      await expect(page.locator(".blackjack-connection-label"))
        .toHaveText("RECONNECTING");

      await expect.poll(
        ()=>fixture.connectionCount(),
        {timeout:4_000},
      ).toBeGreaterThanOrEqual(2);

      await expect(page.locator(".blackjack-connection-label"),{
        timeout:4_000,
      }).toHaveText("LIVE");
      await expect(page.locator(".blackjack-round-result strong"))
        .toHaveText("YOU WIN");
    });
  });

  test("DOUBLE and SPLIT are wired only when authoritative hand allows them",async({page})=>{
    const fixture=await installBlackjackFixture(page);
    await openBlackjack(page);

    await page.locator('.blackjack-seat[data-seat="3"]').click();
    await page.locator(
      '[data-blackjack-seat-confirm-action="CONFIRM"]',
    ).click();
    await expect(page.locator(".blackjack-context-prompt"))
      .toHaveText("PLACE YOUR BET");

    fixture.forcePlayerTurn([
      card("8","HEARTS"),
      card("8","CLUBS"),
    ]);

    await expect(page.locator(".blackjack-context-prompt"))
      .toHaveText("YOUR TURN");
    const doubleButton=page.locator('[data-blackjack-action="DOUBLE"]');
    const splitButton=page.locator('[data-blackjack-action="SPLIT"]');
    await expect(doubleButton).toBeVisible();
    await expect(splitButton).toBeVisible();

    await doubleButton.click();
    await expect.poll(()=>
      fixture.outbound.some((message)=>message.type==="DOUBLE")
    ).toBe(true);

    fixture.forcePlayerTurn([
      card("8","DIAMONDS"),
      card("8","SPADES"),
    ]);
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await expect.poll(()=>
      fixture.outbound.some((message)=>message.type==="SPLIT")
    ).toBe(true);
  });
});

test.describe("Blackjack responsive browser smoke",()=>{
  test.use({
    viewport:{width:390,height:844},
    screen:{width:390,height:844},
    isMobile:true,
    hasTouch:true,
  });

  test("portrait mobile keeps table and dock usable without horizontal overflow",async({page})=>{
    await installBlackjackFixture(page);
    await openBlackjack(page);

    const layout=await page.evaluate(()=>{
      const root=document.querySelector<HTMLElement>(".blackjack-root");
      const table=document.querySelector<HTMLElement>(".blackjack-table-frame");
      const hud=document.querySelector<HTMLElement>(".blackjack-hud");
      const viewportWidth=document.documentElement.clientWidth;
      return {
        scrollWidth:Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        viewportWidth,
        rootOverflowY:root ? getComputedStyle(root).overflowY : "",
        tableWidth:table?.getBoundingClientRect().width ?? 0,
        hudWidth:hud?.getBoundingClientRect().width ?? 0,
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(
      layout.viewportWidth+1,
    );
    expect(layout.rootOverflowY).toBe("auto");
    expect(layout.tableWidth).toBeLessThanOrEqual(
      layout.viewportWidth+1,
    );
    expect(layout.hudWidth).toBeLessThanOrEqual(
      layout.viewportWidth+1,
    );

    await page.locator('.blackjack-seat[data-seat="3"]').tap();
    await expect(page.locator("[data-blackjack-seat-confirm]"))
      .toBeVisible();
  });
});