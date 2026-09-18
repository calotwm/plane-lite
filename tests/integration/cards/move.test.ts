import { describe, expect, it } from "vitest";
import { db } from "@/../tests/db";
import { createAuthedUser, req, seedTeamAndProject } from "../helpers";
import { POST as createCard } from "@/app/api/projects/[projectId]/cards/route";
import { POST as moveCard } from "@/app/api/cards/[cardId]/move/route";

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}
function cardParams(cardId: string) {
  return { params: Promise.resolve({ cardId }) };
}

async function seedBoardWithTwoLists() {
  const { team, project } = await seedTeamAndProject();
  const { user, cookie } = await createAuthedUser();
  await db.teamMember.create({ data: { teamId: team.id, userId: user.id } });
  const board = await db.board.create({ data: { name: "B", projectId: project.id, position: 0 } });
  const listA = await db.list.create({ data: { name: "A", boardId: board.id, position: 0 } });
  const listB = await db.list.create({ data: { name: "B", boardId: board.id, position: 1 } });
  return { project, cookie, listA, listB };
}

describe("card move", () => {
  it("moves a card across lists atomically: it disappears from the source and appears once in the target", async () => {
    const { project, cookie, listA, listB } = await seedBoardWithTwoLists();
    const created = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "Card", listId: listA.id },
      }),
      projectParams(project.id),
    );
    const { card } = (await created.json()) as { card: { id: string; version: number } };

    const response = await moveCard(
      req(`/api/cards/${card.id}/move`, {
        method: "POST",
        cookie,
        body: { version: card.version, listId: listB.id, index: 0 },
      }),
      cardParams(card.id),
    );
    expect(response.status).toBe(200);

    expect(await db.card.count({ where: { listId: listA.id } })).toBe(0);
    const inTargetList = await db.card.findMany({ where: { listId: listB.id } });
    expect(inTargetList).toHaveLength(1);
    expect(inTargetList[0].id).toBe(card.id);
  });

  it("moving to the backlog clears listId and position", async () => {
    const { project, cookie, listA } = await seedBoardWithTwoLists();
    const created = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "Card", listId: listA.id },
      }),
      projectParams(project.id),
    );
    const { card } = (await created.json()) as { card: { id: string; version: number } };

    const response = await moveCard(
      req(`/api/cards/${card.id}/move`, {
        method: "POST",
        cookie,
        body: { version: card.version, listId: null },
      }),
      cardParams(card.id),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { card: { listId: string | null; position: string | null } };
    expect(body.card.listId).toBeNull();
    expect(body.card.position).toBeNull();
  });

  it("rejects a stale-version move with 409 STALE_VERSION and leaves the card untouched", async () => {
    const { project, cookie, listA, listB } = await seedBoardWithTwoLists();
    const created = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "Card", listId: listA.id },
      }),
      projectParams(project.id),
    );
    const { card } = (await created.json()) as { card: { id: string; version: number } };

    const response = await moveCard(
      req(`/api/cards/${card.id}/move`, {
        method: "POST",
        cookie,
        body: { version: card.version + 1, listId: listB.id, index: 0 },
      }),
      cardParams(card.id),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("STALE_VERSION");

    const stillInSource = await db.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(stillInSource.listId).toBe(listA.id);
  });

  it("concurrent drops into the same list leave every card present exactly once with unique positions", async () => {
    const { project, cookie, listA, listB } = await seedBoardWithTwoLists();
    const created1 = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "C1", listId: listA.id },
      }),
      projectParams(project.id),
    );
    const created2 = await createCard(
      req(`/api/projects/${project.id}/cards`, {
        method: "POST",
        cookie,
        body: { title: "C2", listId: listA.id },
      }),
      projectParams(project.id),
    );
    const { card: card1 } = (await created1.json()) as { card: { id: string; version: number } };
    const { card: card2 } = (await created2.json()) as { card: { id: string; version: number } };

    const [r1, r2] = await Promise.all([
      moveCard(
        req(`/api/cards/${card1.id}/move`, {
          method: "POST",
          cookie,
          body: { version: card1.version, listId: listB.id, index: 0 },
        }),
        cardParams(card1.id),
      ),
      moveCard(
        req(`/api/cards/${card2.id}/move`, {
          method: "POST",
          cookie,
          body: { version: card2.version, listId: listB.id, index: 0 },
        }),
        cardParams(card2.id),
      ),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const inTarget = await db.card.findMany({ where: { listId: listB.id } });
    expect(inTarget).toHaveLength(2);
    const positions = inTarget.map((c) => c.position);
    expect(new Set(positions).size).toBe(2);
  });
});
