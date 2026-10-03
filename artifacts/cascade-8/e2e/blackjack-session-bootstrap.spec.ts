import {expect,test} from "@playwright/test";

const idleSnapshot={
  serverTimeMs:1_000,
  tableId:"blackjack-bootstrap-e2e",
  phase:"TABLE_IDLE",
  maxSeats:5,
  seats:[1,2,3,4,5].map((seatNumber)=>({
    seatNumber,
    playerId:null,
  })),
  players:[],
  round:null,
  stateVersion:1,
  eventSequence:1,
};

test.describe("Blackjack session bootstrap",()=>{
  test.use({
    viewport:{width:1440,height:900},
    screen:{width:1440,height:900},
  });

  test("does not remain CONNECTING forever and retry can recover",async({page})=>{
    let sessionHealthy=false;
    let sessionAttempts=0;

    await page.route("**/api/slot/session-converge",async(route)=>{
      await route.fulfill({
        status:200,
        contentType:"application/json",
        body:JSON.stringify({ready:true}),
      });
    });

    await page.route("**/api/blackjack/session",async(route)=>{
      sessionAttempts+=1;
      await route.fulfill({
        status:sessionHealthy ? 200 : 503,
        contentType:"application/json",
        body:JSON.stringify(
          sessionHealthy
            ? {ready:true,status:"READY"}
            : {ready:false,status:"STARTING"},
        ),
      });
    });

    await page.routeWebSocket(/\/api\/blackjack\/ws$/,async(ws)=>{
      ws.send(JSON.stringify({
        type:"FULL_TABLE_SNAPSHOT",
        reason:"INITIAL_CONNECT",
        snapshot:idleSnapshot,
        resetEventSequenceTo:1,
        resetStateVersionTo:1,
      }));
    });

    await page.goto("/blackjack");
    await expect(page.locator(".blackjack-connection-label"))
      .toHaveText("ERROR",{timeout:8_000});
    await expect(page.locator(".blackjack-context-prompt"))
      .toHaveText("TABLE SESSION UNAVAILABLE");
    await expect(page.locator("[data-blackjack-session-retry]"))
      .toBeVisible();
    expect(sessionAttempts).toBe(4);

    sessionHealthy=true;
    await page.locator("[data-blackjack-session-retry]").click();

    await expect(page.locator(".blackjack-connection-label"),{
      timeout:4_000,
    }).toHaveText("LIVE");
    expect(sessionAttempts).toBe(5);
  });
});
