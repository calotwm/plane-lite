// Hard negative tests: there is NO public signup endpoint, and NO public
// password-reset endpoint. The auth spec lists these as scenarios
// ("Anonymous signup is rejected", "No public reset endpoint") that
// MUST be enforced — implementations that quietly added a route would
// pass every positive test while breaking the contract. These tests
// block that drift at CI time.
//
// We exercise the negative by directly importing the App Router route
// map (every dynamic segment under `src/app/api/**` is statically
// known at build time). Hitting a 404 against Next.js's runtime is
// flaky in vitest, so instead we inspect the filesystem to assert
// that the offending files DO NOT exist.

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");

describe("auth route surface", () => {
  it("does NOT expose /api/auth/signup", () => {
    expect(
      existsSync(path.join(ROOT, "src", "app", "api", "auth", "signup")),
    ).toBe(false);
  });

  it("does NOT expose /api/auth/register", () => {
    expect(
      existsSync(path.join(ROOT, "src", "app", "api", "auth", "register")),
    ).toBe(false);
  });

  it("does NOT expose /api/auth/reset-password", () => {
    expect(
      existsSync(path.join(ROOT, "src", "app", "api", "auth", "reset-password")),
    ).toBe(false);
  });

  it("exposes login, logout, and me endpoints", () => {
    expect(
      existsSync(
        path.join(ROOT, "src", "app", "api", "auth", "login", "route.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(ROOT, "src", "app", "api", "auth", "logout", "route.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(ROOT, "src", "app", "api", "auth", "me", "route.ts"),
      ),
    ).toBe(true);
  });

  it("does NOT expose a generic users POST that could be misread as signup", () => {
    expect(
      existsSync(path.join(ROOT, "src", "app", "api", "users", "route.ts")),
    ).toBe(false);
  });
});
