import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cadiRouteSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const witchClientSource = readFileSync(
  fileURLToPath(new URL("./witchClient.ts", import.meta.url)),
  "utf8",
);

describe("cadi kazan route smoke contract", () => {
  it("keeps Cadı Kazan fully mounted inside its owned route module", () => {
    expect(cadiRouteSource).toContain(
      "export function mountCadiKazan(app: HTMLElement)",
    );
    expect(cadiRouteSource).toContain(
      "app.innerHTML = cadiKazanRouteShell(CADI_KAZAN_MARKUP);",
    );
    expect(witchClientSource).toContain('<main class="witch-page"');
  });

  it("keeps critical Cadı Kazan markup anchors", () => {
    const requiredAnchors = [
      "data-witch-balance",
      "data-witch-round",
      "data-witch-round-status",
      "data-witch-ticket",
      'data-witch-mode="STANDARD"',
      'data-witch-mode="ADVANCED"',
      'data-witch-action="start"',
      'data-witch-action="cashout"',
      "data-witch-feedback",
      "data-witch-mobile-actions",
    ];

    for (const anchor of requiredAnchors) {
      expect(witchClientSource).toContain(anchor);
    }
  });

  it("mounts WitchClient from the Cadı Kazan-owned module", () => {
    expect(cadiRouteSource).toContain(
      'const witchRoot = app.querySelector<HTMLElement>(".witch-page");',
    );
    expect(cadiRouteSource).toContain(
      "if (witchRoot) new WitchClient(witchRoot);",
    );
    expect(witchClientSource).toContain("export class WitchClient");
    expect(witchClientSource).toContain('const API_BASE = "/api/cadi-kazan";');
  });

  it("owns its audio dependency instead of importing Slot audio", () => {
    expect(witchClientSource).toContain('from "./AudioManager"');
    expect(witchClientSource).not.toContain('from "./game/AudioManager"');
  });
});
