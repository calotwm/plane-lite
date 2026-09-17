import { describe, expect, it } from "vitest";
import { db } from "../db";
import { conditionalUpdate } from "@/lib/version";

async function newCardWith(title = "card") {
  const team = await db.team.create({ data: { name: "T" } });
  const project = await db.project.create({
    data: { name: "P", teamId: team.id },
  });
  return db.card.create({ data: { title, projectId: project.id } });
}

describe("conditionalUpdate", () => {
  it("updates and increments version when the supplied version matches", async () => {
    const card = await newCardWith("first");
    expect(card.version).toBe(1);

    const result = await conditionalUpdate(
      db.card,
      card.id,
      card.version,
      { title: "renamed" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.id).toBe(card.id);
    expect(result.entity.version).toBe(2);
    expect(result.entity.title).toBe("renamed");

    const fresh = await db.card.findUnique({ where: { id: card.id } });
    expect(fresh?.version).toBe(2);
    expect(fresh?.title).toBe("renamed");
  });

  it("returns STALE_VERSION with the current row when the version is behind", async () => {
    const card = await newCardWith("original");
    // Bump the version behind the caller's back.
    await db.card.update({
      where: { id: card.id },
      data: { version: { increment: 1 } },
    });

    const result = await conditionalUpdate(
      db.card,
      card.id,
      card.version, // 1 — no longer current
      { title: "should-not-land" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STALE_VERSION");
    expect(result.entity).not.toBeNull();
    expect(result.entity?.id).toBe(card.id);
    expect(result.entity?.version).toBe(2);
    expect(result.entity?.title).toBe("original");

    // No mutation occurred.
    const fresh = await db.card.findUnique({ where: { id: card.id } });
    expect(fresh?.title).toBe("original");
    expect(fresh?.version).toBe(2);
  });

  it("returns STALE_VERSION with `entity: null` when the row was deleted", async () => {
    const card = await newCardWith("ghost");
    await db.card.delete({ where: { id: card.id } });

    const result = await conditionalUpdate(
      db.card,
      card.id,
      card.version,
      { title: "resurrect" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STALE_VERSION");
    expect(result.entity).toBeNull();
  });

  it("the 409 entity carries every column the client may want to merge", async () => {
    const card = await newCardWith();
    await db.card.update({
      where: { id: card.id },
      data: {
        title: "by someone else",
        description: "remote",
        priority: "HIGH",
        version: { increment: 1 },
      },
    });

    const result = await conditionalUpdate(
      db.card,
      card.id,
      card.version,
      { title: "local" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const entity = result.entity as typeof card | null;
    expect(entity?.title).toBe("by someone else");
    expect(entity?.description).toBe("remote");
    expect(entity?.priority).toBe("HIGH");
    expect(entity?.version).toBe(2);
  });

  it("serializes two concurrent writers — exactly one wins", async () => {
    const card = await newCardWith();
    const [a, b] = await Promise.all([
      conditionalUpdate(db.card, card.id, card.version, { title: "writer A" }),
      conditionalUpdate(db.card, card.id, card.version, { title: "writer B" }),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const fresh = await db.card.findUnique({ where: { id: card.id } });
    expect(fresh?.version).toBe(2);
    expect(fresh?.title).toBe(winners[0]!.ok ? winners[0]!.entity.title : null);
  });
});