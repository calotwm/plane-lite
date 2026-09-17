import { describe, expect, it } from "vitest";
import {
  buildSetCookieValue,
  parseSessionCookieHeader,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/auth/session";

describe("sessionCookieOptions", () => {
  it("is httpOnly, Lax, path=/, and marks secure only in production", () => {
    const dev = sessionCookieOptions({ nodeEnv: "development" });
    expect(dev.httpOnly).toBe(true);
    expect(dev.sameSite).toBe("Lax");
    expect(dev.path).toBe("/");
    expect(dev.secure).toBe(false);
    expect(dev.name).toBe(SESSION_COOKIE_NAME);

    const prod = sessionCookieOptions({ nodeEnv: "production" });
    expect(prod.secure).toBe(true);

    const test = sessionCookieOptions({ nodeEnv: "test" });
    expect(test.secure).toBe(false);
  });

  it("exposes a maxAgeSeconds derived from the 7-day default", () => {
    const opts = sessionCookieOptions({});
    expect(opts.maxAgeSeconds).toBe(7 * 24 * 60 * 60);
  });
});

describe("buildSetCookieValue", () => {
  it("includes HttpOnly, SameSite=Lax, Path=/, Max-Age", () => {
    const opts = sessionCookieOptions({ nodeEnv: "test" });
    const value = buildSetCookieValue("plane_session", "abc", opts);
    expect(value).toContain("plane_session=abc");
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=604800");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("HttpOnly");
    expect(value).not.toContain("Secure");
  });

  it("emits Secure when the options say so", () => {
    const opts = sessionCookieOptions({ nodeEnv: "production" });
    const value = buildSetCookieValue("plane_session", "abc", opts);
    expect(value).toContain("Secure");
  });

  it("includes an Expires header when expiresAt is provided", () => {
    const opts = sessionCookieOptions({ nodeEnv: "test" });
    const expires = new Date("2030-01-01T00:00:00Z");
    const value = buildSetCookieValue("plane_session", "abc", opts, expires);
    expect(value).toMatch(/Expires=/);
  });
});

describe("parseSessionCookieHeader", () => {
  it("returns the named cookie when present", () => {
    const header = "plane_session=abc123; other=xyz";
    expect(parseSessionCookieHeader(header, "plane_session")).toBe("abc123");
  });

  it("returns null when the named cookie is absent", () => {
    expect(parseSessionCookieHeader("other=xyz", "plane_session")).toBeNull();
    expect(parseSessionCookieHeader(null, "plane_session")).toBeNull();
    expect(parseSessionCookieHeader("", "plane_session")).toBeNull();
  });

  it("trims whitespace around each part", () => {
    const header = "  plane_session = abc ;  other=xyz  ";
    expect(parseSessionCookieHeader(header, "plane_session")).toBe("abc");
  });

  it("ignores malformed segments without an =", () => {
    const header = "bogus; plane_session=abc; still-bogus";
    expect(parseSessionCookieHeader(header, "plane_session")).toBe("abc");
  });

  it("finds the named cookie even when it appears after unrelated ones", () => {
    const header = "sessionid=js; plane_session=abc; tracking=1";
    expect(parseSessionCookieHeader(header, "plane_session")).toBe("abc");
  });
});
