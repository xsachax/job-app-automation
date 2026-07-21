import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// Create a fresh test database with the current schema before the suite runs.
export default function setup() {
  const dir = path.join(process.cwd(), "prisma");
  for (const f of ["test.db", "test.db-journal"]) {
    const p = path.join(dir, f);
    if (existsSync(p)) rmSync(p);
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
