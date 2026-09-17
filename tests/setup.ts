import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach } from "vitest";
import { db } from "./db";

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

// Clears every table in foreign-key-safe order (children before parents).
async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.cardLabel.deleteMany();
  await client.card.deleteMany();
  await client.label.deleteMany();
  await client.cycle.deleteMany();
  await client.list.deleteMany();
  await client.board.deleteMany();
  await client.project.deleteMany();
  await client.teamMember.deleteMany();
  await client.team.deleteMany();
  await client.user.deleteMany();
}
