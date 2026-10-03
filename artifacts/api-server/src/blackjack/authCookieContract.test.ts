import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLACKJACK_AUTH_COOKIE } from "./sessionIdentityMiddleware";

const authRoutesSource = readFileSync(
  fileURLToPath(new URL("../auth/routes.ts", import.meta.url)),
  "utf8",
);

describe("blackjack auth cookie contract", () => {
  it("uses the same auth cookie name as the account system without importing its DB-backed runtime", () => {
    expect(BLACKJACK_AUTH_COOKIE).toBe("fy_auth");
    expect(authRoutesSource).toContain('export const AUTH_COOKIE = "fy_auth"');
  });
});
