import { describe, expect, it } from "vitest";
import { db } from "@/../tests/db";
import { createAuthedUser, req, seedTeamAndProject } from "../helpers";
import { DELETE as deleteBoard } from "@/app/api/boards/[boardId]/route";
import { POST as archiveBoard } from "@/app/api/boards/[boardId]/archive/route";
import { POST as restoreBoard } from "@/app/api/boards/[boardId]/restore/route";
import { DELETE as deleteList } from "@/app/api/lists/[listId]/route";
import { POST as createCard } from "@/app/api/projects/[projectId]/cards/route";
import { POST as moveCard } from "@/app/api/cards/[cardId]/move/route";

function boardParams(boardId: string) {
  return { params: Promise.resolve({ boardId }) };
}
function listParams(listId: string) {
  return { params: Promise.resolve({ listId }) };
}
function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}
function cardParams(cardId: string) {
  return { params: Promise.resolve({ cardId }) };
}

async function seedMember() {
  const { team, project } = await seedTeamAndProject();
  const { user, cookie } = await createAuthedUser();
  await db.teamMember.create({ data: { teamId: team.id, userId: user.id } });
  return { team, project, user, cookie };
}

describe("board delete — hard cascade", () => {
  it("removes the board, its lists, AND their cards (not a backlog move)", async () => {
    const { project, cookie } = await seedMember();
    const board = await db.board.create({ data: { name: "B", projectId: project.id, position: 0 } });
    const list = await db.list.create({ data: { name: "L", boardId: board.id, position: 0 } });
    const card = await db.card.create({
      data: { title: "C1", projectId: project.id, listId: list.id, position: "M" },
    });

    const response = await deleteBoard(
      req(`/api/boards/${board.id}`, { method: "DELETE", cookie }),
      boardParams(board.id),
    );
    expect(response.status).toBe(204);

    expect(await db.list.count({ where: { boardId: board.id } })).toBe(0);
    // The defining assertion: the card is GONE, not moved to the backlog.
    expect(await db.card.findUnique({ where: { id: card.id } })).toBeNull();
  });
});

describe("list delete — soft, cards move to the backlog", () => {
  it("removes the list but keeps its cards, now in the backlog", async () => {
    const { project, cookie } = await seedMember();
    const board = await db.board.create({ data: { name: "B", projectId: project.id, position: 0 } });
    const list = await db.list.create({ data: { name: "L", boardId: board.id, position: 0 } });
    const card = await db.card.create({
      data: { title: "C1", projectId: project.id, listId: list.id, position: "M" },
    });

    const response = await deleteList(
      req(`/api/lists/${list.id}`, { method: "DELETE", cookie }),
      listParams(list.id),
    );
    expect(response.status).toBe(204);

    expect(await db.list.findUnique({ where: { id: list.id } })).toBeNull();
    const survivingCard = await db.card.findUnique({ where: { id: card.id } });
    expect(survivingCard).not.toBeNull();
    expect(survivingCard?.listId).toBeNull();
    expect(survivingCard?.position).toBeNull();
  });
});

describe("archived guard — 409 discrimination", () => {
  it("rejects card creation on an archived board with code ARCHIVED, distinct from a stale-version 409", async () => {
    const { project, cookie } = await seedMember();
    const board = await db.board.create({ data: { name: "B", projectId: project.id, position: 0 } });
    const list = await db.list.create({ data: { name: "L", boardId: board.id, position: 0 } });

    await archiveBoard(
      req(`/api/boards/${board.id}/archive`, { method: "POST", cookie }),
      boardParams(board.id),
    );

    const createRes = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "Should fail", listId: list.id },
      }),
      projectParams(project.id),
    );
    expect(createRes.status).toBe(409);
    const archivedBody = (await createRes.json()) as { code: string };
    expect(archivedBody.code).toBe("ARCHIVED");
    expect(await db.card.count({ where: { listId: list.id } })).toBe(0);

    await restoreBoard(
      req(`/api/boards/${board.id}/restore`, { method: "POST", cookie }),
      boardParams(board.id),
    );

    const okRes = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "Now it works", listId: list.id },
      }),
      projectParams(project.id),
    );
    expect(okRes.status).toBe(201);
    const { card } = (await okRes.json()) as { card: { id: string; version: number } };

    // A separate, stale-version 409 on the same card must carry a
    // different `code` than the ARCHIVED case above.
    const staleRes = await moveCard(
      req(`/api/cards/${card.id}/move`, {
        method: "POST",
        cookie,
        body: { version: card.version + 99, listId: list.id, index: 0 },
      }),
      cardParams(card.id),
    );
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as { code: string };
    expect(staleBody.code).toBe("STALE_VERSION");
    expect(staleBody.code).not.toBe(archivedBody.code);
  });

  it("archiving a board leaves its project and sibling boards unchanged", async () => {
    const { project, cookie } = await seedMember();
    const b1 = await db.board.create({ data: { name: "B1", projectId: project.id, position: 0 } });
    const b2 = await db.board.create({ data: { name: "B2", projectId: project.id, position: 1 } });

    await archiveBoard(req(`/api/boards/${b1.id}/archive`, { method: "POST", cookie }), boardParams(b1.id));

    const reloadedProject = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(reloadedProject.archivedAt).toBeNull();
    const reloadedB2 = await db.board.findUniqueOrThrow({ where: { id: b2.id } });
    expect(reloadedB2.archivedAt).toBeNull();
  });
});
