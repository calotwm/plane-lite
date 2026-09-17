import { PrismaClient } from "@prisma/client";

// Points at the temp SQLite database prepared by tests/global-setup.ts
// via the DATABASE_URL environment variable.
export const db = new PrismaClient();
