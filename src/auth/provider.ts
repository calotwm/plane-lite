// Auth provider seam per openspec/changes/core-mvp/design.md §Architecture Decisions.
//
// Every protected route depends on `getSessionUser(request)` (in ./session) and
// never on a concrete password or OIDC implementation. An OIDC provider can
// be added post-MVP without touching authorization paths: it just implements
// the `AuthProvider` interface below and the login route plugs it in.
//
// The SessionUser shape is the ONLY user identity contract callers see. It
// carries no password material — `passwordHash` is filtered out at the seam
// so a leaking route cannot expose it even by accident.

export type UserRole = "admin" | "member";

// Minimum identity needed by every protected route. `teamIds` is included
// up-front so a route can do membership / scoping checks in one round-trip
// without re-issuing a query per request.
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  teamIds: string[];
}

// Discriminated result of `AuthProvider.authenticate`. The reasons drive the
// HTTP status code in the login route: RATE_LIMITED -> 429, everything else
// (INVALID_CREDENTIALS, USER_INACTIVE) -> 401. We collapse the inactive case
// into the 401 bucket to avoid leaking which addresses exist on the system.
export type AuthFailureReason =
  | "INVALID_CREDENTIALS"
  | "USER_INACTIVE"
  | "RATE_LIMITED";

export type AuthResult =
  | {
      ok: true;
      sessionUser: SessionUser;
      token: string;
      expiresAt: Date;
    }
  | { ok: false; reason: AuthFailureReason };

// The seam. Every concrete provider (password today, OIDC tomorrow) returns
// the same shape so route handlers stay unaware of how the token was issued.
export interface AuthProvider {
  authenticate(input: {
    email: string;
    password: string;
  }): Promise<AuthResult>;
}

// The shape session.ts reads on the request. Lives here so route handlers
// and tests both type-check against the same contract — Node's built-in
// Request and Next's NextRequest both satisfy it without a cast.
export interface CookieSource {
  headers: { get(name: "cookie"): string | null };
}
