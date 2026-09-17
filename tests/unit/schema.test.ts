import { describe, expect, it } from "vitest";
import { db } from "../db";

describe("schema", () => {
  it("allows a card with no list (backlog = list_id NULL)", async () => {
    const team = await db.team.create({ data: { name: "Engineering" } });
    const project = await db.project.create({
      data: { name: "Q3 Launch", teamId: team.id },
    });

    const card = await db.card.create({
      data: { title: "Backlog item", projectId: project.id },
    });

    expect(card.listId).toBeNull();
    expect(card.position).toBeNull();
  });

  it("rejects duplicate label names within the same project", async () => {
    const team = await db.team.create({ data: { name: "Engineering" } });
    const project = await db.project.create({
      data: { name: "Q3 Launch", teamId: team.id },
    });

    await db.label.create({
      data: { name: "Bug", color: "#ff0000", projectId: project.id },
    });

    await expect(
      db.label.create({
        data: { name: "Bug", color: "#00ff00", projectId: project.id },
      }),
    ).rejects.toThrow();
  });

  it("allows the same label name in different projects", async () => {
    const team = await db.team.create({ data: { name: "Engineering" } });
    const p1 = await db.project.create({
      data: { name: "P1", teamId: team.id },
    });
    const p2 = await db.project.create({
      data: { name: "P2", teamId: team.id },
    });

    await db.label.create({
      data: { name: "Bug", color: "#ff0000", projectId: p1.id },
    });

    await expect(
      db.label.create({
        data: { name: "Bug", color: "#ff0000", projectId: p2.id },
      }),
    ).resolves.toBeTruthy();
  });
});
