import { describe, expect, it } from "vitest";
import { db } from "@/../tests/db";
import { createAuthedUser, req, seedTeamAndProject } from "../helpers";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import {
  GET as getProject,
  DELETE as deleteProject,
} from "@/app/api/projects/[projectId]/route";
import { POST as archiveProject } from "@/app/api/projects/[projectId]/archive/route";
import { POST as restoreProject } from "@/app/api/projects/[projectId]/restore/route";
import { GET as listBoards, POST as createBoard } from "@/app/api/projects/[projectId]/boards/route";

function params(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

describe("project scoping", () => {
  it("hides a project owned by a different team from a non-admin member", async () => {
    const { project } = await seedTeamAndProject({ projectName: "Owned by T1" });
    const { cookie } = await createAuthedUser();

    const response = await listProjects(req("/api/projects", { cookie }));
    const body = (await response.json()) as { projects: { id: string }[] };
    expect(body.projects.find((p) => p.id === project.id)).toBeUndefined();
  });

  it("denies direct GET of a project outside the caller's team with 403", async () => {
    const { project } = await seedTeamAndProject();
    const { cookie } = await createAuthedUser();

    const response = await getProject(req(`/api/projects/${project.id}`, { cookie }), params(project.id));
    expect(response.status).toBe(403);
  });

  it("admins see every project regardless of team", async () => {
    const { project } = await seedTeamAndProject();
    const { cookie } = await createAuthedUser({ isAdmin: true });

    const response = await getProject(req(`/api/projects/${project.id}`, { cookie }), params(project.id));
    expect(response.status).toBe(200);
  });

  it("rejects project creation without a valid owning team", async () => {
    const { cookie } = await createAuthedUser();
    const response = await createProject(
      req("/api/projects", { method: "POST", cookie, body: { name: "No team" } }),
    );
    expect(response.status).toBe(400);
  });
});

describe("project archive/restore", () => {
  it("archiving hides the project from the default list and its boards from listing, without deleting anything", async () => {
    const { team, project } = await seedTeamAndProject();
    const { user, cookie } = await createAuthedUser();
    await db.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    await createBoard(
      req(`/api/projects/${project.id}/boards`, { method: "POST", cookie, body: { name: "Board A" } }),
      params(project.id),
    );

    const archiveRes = await archiveProject(
      req(`/api/projects/${project.id}/archive`, { method: "POST", cookie }),
      params(project.id),
    );
    expect(archiveRes.status).toBe(200);

    const defaultList = (await (
      await listProjects(req("/api/projects", { cookie }))
    ).json()) as { projects: { id: string }[] };
    expect(defaultList.projects.find((p) => p.id === project.id)).toBeUndefined();

    const archivedList = (await (
      await listProjects(req("/api/projects?archived=true", { cookie }))
    ).json()) as { projects: { id: string }[] };
    expect(archivedList.projects.find((p) => p.id === project.id)).toBeDefined();

    const boardsRes = await listBoards(
      req(`/api/projects/${project.id}/boards`, { cookie }),
      params(project.id),
    );
    const boardsBody = (await boardsRes.json()) as { boards: unknown[] };
    expect(boardsBody.boards).toHaveLength(0);

    // The board itself was never touched.
    const boardCountAfterArchive = await db.board.count({ where: { projectId: project.id } });
    expect(boardCountAfterArchive).toBe(1);

    const restoreRes = await restoreProject(
      req(`/api/projects/${project.id}/restore`, { method: "POST", cookie }),
      params(project.id),
    );
    expect(restoreRes.status).toBe(200);

    const boardsAfterRestore = await listBoards(
      req(`/api/projects/${project.id}/boards`, { cookie }),
      params(project.id),
    );
    const afterBody = (await boardsAfterRestore.json()) as { boards: unknown[] };
    expect(afterBody.boards).toHaveLength(1);
  });
});

describe("project delete cascade", () => {
  it("removes boards, lists, cards, cycles, and labels when the project is deleted", async () => {
    const { team, project } = await seedTeamAndProject();
    const { user, cookie } = await createAuthedUser();
    await db.teamMember.create({ data: { teamId: team.id, userId: user.id } });

    const board = await db.board.create({ data: { name: "B", projectId: project.id, position: 0 } });
    const list = await db.list.create({ data: { name: "L", boardId: board.id, position: 0 } });
    await db.card.create({ data: { title: "C1", projectId: project.id, listId: list.id, position: "M" } });
    await db.cycle.create({
      data: { name: "Sprint 1", projectId: project.id, startDate: new Date(), endDate: new Date() },
    });
    await db.label.create({ data: { name: "bug", color: "#f00", projectId: project.id } });

    const response = await deleteProject(
      req(`/api/projects/${project.id}`, { method: "DELETE", cookie }),
      params(project.id),
    );
    expect(response.status).toBe(204);

    expect(await db.board.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.list.count({ where: { boardId: board.id } })).toBe(0);
    expect(await db.card.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.cycle.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.label.count({ where: { projectId: project.id } })).toBe(0);
  });
});
