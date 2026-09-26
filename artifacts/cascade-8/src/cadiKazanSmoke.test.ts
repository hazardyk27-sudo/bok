import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8",
);
const witchClientSource = readFileSync(
  fileURLToPath(new URL("./witchClient.ts", import.meta.url)),
  "utf8",
);

describe("cadi kazan route smoke contract", () => {
  it("keeps /cadi-kazan routed to the witch page shell", () => {
    expect(mainSource).toContain(
      'const isWitchRoute = currentPath === "/cadi-kazan";',
    );
    expect(mainSource).toContain(
      'app.innerHTML = routeShell(witchModule!.CADI_KAZAN_MARKUP, "is-route-page is-witch-page");',
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

  it("still mounts WitchClient only for the Cadı Kazan route", () => {
    expect(mainSource).toContain(
      'const witchRoot = document.querySelector<HTMLElement>(".witch-page");',
    );
    expect(mainSource).toContain(
      "if (witchRoot) new witchModule!.WitchClient(witchRoot);",
    );
    expect(witchClientSource).toContain("export class WitchClient");
    expect(witchClientSource).toContain('const API_BASE = "/api/cadi-kazan";');
  });
});
