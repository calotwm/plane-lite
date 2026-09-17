import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let tmpDir: string | undefined;

export default function globalSetup(): () => void {
  tmpDir = mkdtempSync(path.join(tmpdir(), "plane-lite-"));
  // Prisma's SQLite driver wants forward slashes inside a file: URL.
  const dbPath = path.join(tmpDir, "test.db").split(path.sep).join("/");
  const databaseUrl = `file:${dbPath}`;

  process.env.DATABASE_URL = databaseUrl;

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  return () => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}
