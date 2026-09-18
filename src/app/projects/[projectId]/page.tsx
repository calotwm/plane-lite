"use client";

import { use, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Kanban, Plus } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Board } from "@/components/board/Board";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useRequireAuth } from "@/lib/useSession";
import { api, ApiError } from "@/lib/apiClient";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface BoardSummary {
  id: string;
  name: string;
}

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const { user, loading: authLoading } = useRequireAuth();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ project: Project }>(`/api/projects/${projectId}`)
      .then((data) => setProject(data.project))
      .catch(() => toast.push("Could not load this project."));
    api<{ boards: BoardSummary[] }>(`/api/projects/${projectId}/boards`)
      .then((data) => {
        setBoards(data.boards);
        setActiveBoardId((prev) => prev ?? data.boards[0]?.id ?? null);
      })
      .catch(() => toast.push("Could not load boards."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  async function createBoard(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const { board } = await api<{ board: BoardSummary }>(`/api/projects/${projectId}/boards`, {
        method: "POST",
        body: JSON.stringify({ name: newBoardName }),
      });
      setNewBoardName("");
      const data = await api<{ boards: BoardSummary[] }>(`/api/projects/${projectId}/boards`);
      setBoards(data.boards);
      setActiveBoardId(board.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create board.");
    } finally {
      setCreating(false);
    }
  }

  if (authLoading || !user || project === null || boards === null) {
    return (
      <AppShell user={user}>
        <div className="p-6">
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 flex gap-3">
            <Skeleton className="h-64 w-72" />
            <Skeleton className="h-64 w-72" />
            <Skeleton className="h-64 w-72" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-muted transition-colors hover:text-ink">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-sm font-semibold text-ink">{project.name}</h1>
          {boards.length > 1 && (
            <div className="ml-2 flex items-center gap-1">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBoardId(b.id)}
                  className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeBoardId === b.id
                      ? "bg-accent text-accent-fg"
                      : "text-ink-muted hover:bg-surface-sunken"
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {boards.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={<Kanban size={28} />}
            title="No board yet"
            body="Create a board to start tracking work for this project."
            action={
              <form onSubmit={createBoard} className="flex w-full max-w-xs flex-col gap-3">
                <Field label="Board name" htmlFor="board-name" error={error ?? undefined}>
                  <Input
                    id="board-name"
                    required
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" icon={<Plus size={16} weight="bold" />} loading={creating}>
                  Create board
                </Button>
              </form>
            }
          />
        </div>
      ) : activeBoardId ? (
        <Board projectId={projectId} boardId={activeBoardId} />
      ) : null}
    </AppShell>
  );
}
