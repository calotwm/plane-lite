"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SignOut } from "@phosphor-icons/react";
import { IconButton } from "./ui/Button";
import { api } from "@/lib/apiClient";
import type { SessionUser } from "@/lib/useSession";

export function AppShell({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface-raised px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
          plane-lite
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted">{user.email}</span>
            <IconButton aria-label="Log out" onClick={logout}>
              <SignOut size={18} />
            </IconButton>
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
