import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  LoginRateLimiter,
} from "@/auth/password";

describe("LoginRateLimiter", () => {
  it("starts at zero failures for a new email", () => {
    const limiter = new LoginRateLimiter();
    expect(limiter.failureCount("a@b.test")).toBe(0);
    expect(limiter.isLimited("a@b.test")).toBe(false);
  });

  it("counts a failure and trips the threshold", () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    expect(limiter.isLimited("a@b.test")).toBe(false);
    limiter.recordFailure("a@b.test");
    limiter.recordFailure("a@b.test");
    expect(limiter.isLimited("a@b.test")).toBe(false);
    limiter.recordFailure("a@b.test");
    // maxAttempts = 3 -> the 4th check needs to be blocked. We have
    // recorded exactly 3 failures; isLimited must be true AT 3 (the
    // 4th attempt would be the one that's throttled).
    expect(limiter.failureCount("a@b.test")).toBe(3);
    expect(limiter.isLimited("a@b.test")).toBe(true);
  });

  it("clears the counter on recordSuccess", () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 2,
      windowMs: 60_000,
    });
    limiter.recordFailure("a@b.test");
    limiter.recordFailure("a@b.test");
    expect(limiter.isLimited("a@b.test")).toBe(true);
    limiter.recordSuccess("a@b.test");
    expect(limiter.isLimited("a@b.test")).toBe(false);
    expect(limiter.failureCount("a@b.test")).toBe(0);
  });

  it("only counts failures within the rolling window", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(
      { maxAttempts: 2, windowMs: 1000 },
      () => now,
    );
    limiter.recordFailure("a@b.test");
    now = 500;
    limiter.recordFailure("a@b.test");
    now = 1500;
    // First failure fell out of the window — count should drop to 1
    // and the limiter should no longer be tripped.
    expect(limiter.failureCount("a@b.test")).toBe(1);
    expect(limiter.isLimited("a@b.test")).toBe(false);
  });

  it("compares emails case-insensitively", () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    limiter.recordFailure("Alice@Example.test");
    expect(limiter.failureCount("alice@example.test")).toBe(1);
    expect(limiter.isLimited("ALICE@example.test")).toBe(true);
  });

  it("rejects invalid configurations", () => {
    expect(() => new LoginRateLimiter({ maxAttempts: 0, windowMs: 1000 })).toThrow();
    expect(() => new LoginRateLimiter({ maxAttempts: 1, windowMs: 0 })).toThrow();
  });

  it("reset() drops all counters (test-only)", () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    limiter.recordFailure("a@b.test");
    limiter.recordFailure("c@d.test");
    expect(limiter.isLimited("a@b.test")).toBe(true);
    limiter.reset();
    expect(limiter.isLimited("a@b.test")).toBe(false);
    expect(limiter.isLimited("c@d.test")).toBe(false);
  });

  it("exposes DEFAULT_LOGIN_RATE_LIMIT as 5 failures / 15 minutes", () => {
    expect(DEFAULT_LOGIN_RATE_LIMIT).toEqual({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });
  });
});
