import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// The test database is a throwaway file: delete it and recreate the schema.
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) {
    rmSync(path.join("prisma", f), { force: true });
  }
  execSync("npx prisma db push --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
