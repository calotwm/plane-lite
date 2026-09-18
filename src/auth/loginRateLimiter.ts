// Singleton rate limiter for POST /api/auth/login, in its own module.
//
// This used to live inline in the route file with a test-only
// `__resetRateLimitForTesting` export, but Next.js's typed-routes build
// check rejects any `route.ts` export beyond the HTTP verb handlers and
// a small allow-list (`dynamic`, `revalidate`, ...) — a non-standard
// export fails `next build` even though `tsc --noEmit` never flags it.

import { LoginRateLimiter } from "./password";

export const rateLimiter = new LoginRateLimiter();

// Test-only: vitest shares modules across files in the same run, so the
// in-memory rate-limit counter survives between `describe` blocks unless
// explicitly reset. Production code MUST NOT call this.
export function __resetRateLimitForTesting(): void {
  rateLimiter.reset();
}
