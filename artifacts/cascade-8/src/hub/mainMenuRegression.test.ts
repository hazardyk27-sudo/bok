import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hubSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

const leaderboardSource = readFileSync(
  fileURLToPath(new URL("./leaderboard.ts", import.meta.url)),
  "utf8",
);

const leaderboardCss = readFileSync(
  fileURLToPath(new URL("./leaderboard.css", import.meta.url)),
  "utf8",
);

const menuSource = hubSource;

describe("main menu regression", () => {
  it("keeps four games and integrates wealth ranking into Profile", () => {
    expect(menuSource).toContain('class="game-choice game-choice-slot" href="/slot"');
    expect(menuSource).toContain('class="game-choice game-choice-roulette" href="/roulette"');
    expect(menuSource).toContain('class="game-choice game-choice-witch" href="/cadi-kazan"');
    expect(menuSource).toContain('class="game-choice game-choice-businesses" href="/businesses"');
    expect(menuSource).toContain('class="game-choice game-choice-profile" href="/account"');

    expect(menuSource.match(/class="game-choice game-choice-/g)).toHaveLength(5);
    expect(menuSource).not.toContain("game-choice-leaderboard");
    expect(menuSource).toContain("hub-profile-wealth");
    expect(menuSource).toContain("data-hub-open-leaderboard");
    expect(menuSource).toContain("data-hub-profile-rank");
    expect(menuSource).toContain("data-hub-profile-cash");
    expect(menuSource).toContain("data-hub-profile-capital");
    expect(menuSource).toContain("data-hub-profile-wealth-total");
    expect(menuSource).toContain("ONE LOUNGE · FOUR WORLDS · ONE PROFILE");
  });

  it("preserves the existing selector identity for the four game cards", () => {
    expect(menuSource).toContain("<span class=\"choice-overline\">CASCADE 8</span>");
    expect(menuSource).toContain("<strong>FAHRİNİN YOLU</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">SLOT EXPERIENCE</span>");

    expect(menuSource).toContain("<span class=\"choice-overline\">THE NIGHT TABLE</span>");
    expect(menuSource).toContain("<strong>ROULETTE</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">TABLE EXPERIENCE</span>");

    expect(menuSource).toContain("<span class=\"choice-overline\">LUCKY SCRATCH</span>");
    expect(menuSource).toContain("<strong>CADI KAZAN</strong>");
    expect(menuSource).toContain("<span class=\"choice-type\">SCRATCH EXPERIENCE</span>");
    expect(menuSource).toContain("<strong>İŞLETMELER</strong>");
  });

  it("hydrates Profile and binds the logged-in username to wealth summary", () => {
    expect(menuSource).toContain('fetch("/api/auth/me"');
    expect(menuSource).toContain('credentials: "same-origin"');
    expect(menuSource).toContain("data-hub-profile-name");
    expect(menuSource).toContain("user.userCode");
    expect(menuSource).toContain("user.balanceCents");
    expect(menuSource).toContain(
      "leaderboard.setCurrentUsername(user?.username ?? null)",
    );
  });

  it("refreshes the Profile wealth summary and leaderboard from one authority", () => {
    expect(hubSource).toContain(
      'import { mountHubLeaderboard } from "./leaderboard"',
    );
    expect(hubSource).toContain("mountHubLeaderboard(app)");
    expect(leaderboardSource).toContain(
      'fetch("/api/idle/leaderboard"',
    );
    expect(leaderboardSource).toContain(
      "export const HUB_LEADERBOARD_REFRESH_MS = 15_000",
    );
    expect(leaderboardSource).toContain("renderProfileSummary(response)");
    expect(leaderboardSource).toContain("window.setInterval");
    expect(leaderboardSource).toContain(
      'document.visibilityState === "visible"',
    );
  });

  it("stacks mobile ranking rows without horizontal table scrolling", () => {
    expect(leaderboardSource).toContain('data-label="NAKİT"');
    expect(leaderboardSource).toContain('data-label="SERMAYE"');
    expect(leaderboardSource).toContain('data-label="TOPLAM SERVET"');
    expect(leaderboardCss).toContain("@media (max-width: 760px)");
    expect(leaderboardCss).toContain("overflow-x: hidden");
    expect(leaderboardCss).toContain(".hub-leaderboard-table thead");
    expect(leaderboardCss).toContain("display: none;");
    expect(leaderboardCss).toContain("content: attr(data-label)");
    expect(leaderboardCss).toContain("min-width: 0");
  });

  it("keeps the Hub mount isolated from game runtime code", () => {
    expect(hubSource).toContain("export function mountHub(app: HTMLElement)");
    expect(hubSource).toContain("hubRouteShell(HUB_MARKUP)");
  });
});
