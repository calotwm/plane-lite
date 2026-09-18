// Shared fixtures for Phase 4 API integration tests: an authenticated
// user (with a real Session row, no login-route round-trip needed) and a
// tiny Request builder.

import { randomBytes } from "node:crypto";
import { db } from "@/../tests/db";
import { provisionUser } from "@/auth/password";
import { SESSION_COOKIE_NAME } from "@/auth/session";

export async function createAuthedUser(
  opts: { isAdmin?: boolean; email?: string } = {},
): Promise<{ user: { id: string; email: string }; cookie: string }> {
  const email = opts.email ?? `user-${randomBytes(4).toString("hex")}@example.test`;
  const user = await provisionUser(db, {
    email,
    name: "Test User",
    password: "irrelevant-for-these-tests",
    isAdmin: opts.isAdmin ?? false,
  });
  const token = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.session.create({ data: { userId: user.id, token, expiresAt } });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

export function req(
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["cookie"] = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export async function seedTeamAndProject(overrides: { projectName?: string } = {}) {
  const team = await db.team.create({ data: { name: `Team-${randomBytes(3).toString("hex")}` } });
  const project = await db.project.create({
    data: { name: overrides.projectName ?? "Test Project", teamId: team.id },
  });
  return { team, project };
}
