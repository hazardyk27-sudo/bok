import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  verifyPassword,
} from "./security";

describe("auth security", () => {
  it("normalizes email without changing the local value beyond casing/trim", () => {
    expect(normalizeEmail("  Player.One+Game@Example.COM ")).toBe(
      "player.one+game@example.com",
    );
  });

  it("validates basic email and password boundaries", () => {
    expect(isValidEmail("player@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
    expect(isValidPassword("1234567")).toBe(false);
  });

  it("hashes passwords with a random salt and verifies them", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    expect(await verifyPassword("correct horse battery staple", first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
  });

  it("creates opaque session tokens and stores a deterministic hash", () => {
    const session = createSessionToken();
    expect(session.token.length).toBeGreaterThanOrEqual(40);
    expect(session.tokenHash).toBe(hashSessionToken(session.token));
    expect(session.tokenHash).not.toContain(session.token);
  });
});
