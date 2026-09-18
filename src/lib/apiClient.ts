// Thin fetch wrapper for client components. Same-origin cookies are sent
// by default (no `credentials` override needed). Throws ApiError so
// callers can branch on the ARCHIVED vs STALE_VERSION 409 discrimination
// from design.md without re-parsing the response themselves.

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Request failed with ${status}`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // no body
  }
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
