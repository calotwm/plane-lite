"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { FolderOpen, Plus, UsersThree } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useRequireAuth } from "@/lib/useSession";
import { api, ApiError } from "@/lib/apiClient";

interface Project {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
}

interface Team {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const toast = useToast();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ projects: Project[] }>("/api/projects")
      .then((data) => setProjects(data.projects))
      .catch(() => toast.push("Could not load projects."));
    if (user.role === "admin") {
      api<{ teams: Team[] }>("/api/teams")
        .then((data) => setTeams(data.teams))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refreshProjects() {
    const data = await api<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects);
  }

  async function refreshTeams() {
    const data = await api<{ teams: Team[] }>("/api/teams");
    setTeams(data.teams);
  }

  if (authLoading || !user) {
    return (
      <AppShell user={null}>
        <div className="mx-auto w-full max-w-3xl p-6">
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink">Projects</h1>
          <div className="flex items-center gap-2">
            {user.role === "admin" && (
              <Button variant="secondary" icon={<UsersThree size={16} />} onClick={() => setTeamDialogOpen(true)}>
                New team
              </Button>
            )}
            <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setProjectDialogOpen(true)}>
              New project
            </Button>
          </div>
        </div>

        <div className="mt-5">
          {projects === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={28} />}
              title="No projects yet"
              body="Create your first project to get a board going. You'll need a team to own it."
              action={
                <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setProjectDialogOpen(true)}>
                  New project
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-surface-raised">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex flex-col gap-0.5 px-4 py-3.5 transition-colors hover:bg-surface-sunken"
                  >
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    {p.description && (
                      <span className="text-sm text-ink-muted">{p.description}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <NewTeamDialog
        open={teamDialogOpen}
        onClose={() => setTeamDialogOpen(false)}
        onCreated={async () => {
          setTeamDialogOpen(false);
          await refreshTeams();
        }}
      />
      <NewProjectDialog
        open={projectDialogOpen}
        teams={teams}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={async () => {
          setProjectDialogOpen(false);
          await refreshProjects();
        }}
      />
    </AppShell>
  );
}

function NewTeamDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/teams", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create team.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New team">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="team-name" error={error ?? undefined}>
          <Input id="team-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Create team
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewProjectDialog({
  open,
  teams,
  onClose,
  onCreated,
}: {
  open: boolean;
  teams: Team[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined, teamId }),
      });
      setName("");
      setDescription("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New project">
      {teams.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Create a team first — every project needs one to own it.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="project-name">
            <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="project-description" hint="Optional">
            <Textarea
              id="project-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Team" htmlFor="project-team" error={error ?? undefined}>
            <Select id="project-team" required value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="" disabled>
                Select a team
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Create project
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
