"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./apiClient";

export interface SessionUser {
  id: string;
  email: string;
  role: "admin" | "member";
  teamIds: string[];
}

// Every authenticated page calls this once. Redirects to /login on 401;
// any other failure surfaces as `error` so the page can render its own
// error state instead of silently hanging on a skeleton forever.
export function useRequireAuth(): { user: SessionUser | null; loading: boolean; error: string | null } {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ user: SessionUser }>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load session");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { user, loading, error };
}
